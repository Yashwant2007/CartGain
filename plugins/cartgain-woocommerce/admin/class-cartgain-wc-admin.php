<?php

if (!defined('ABSPATH')) {
    exit;
}

final class CartGain_WC_Admin
{
    private $credentials;
    private $queue;
    private $settings;

    public function __construct($credentials, $queue, $settings)
    {
        $this->credentials = $credentials;
        $this->queue = $queue;
        $this->settings = $settings;
    }

    public function hooks()
    {
        add_action('admin_menu', array($this, 'menu'));
        add_action('admin_enqueue_scripts', array($this, 'enqueue_assets'));
        add_action('admin_init', array($this, 'handle_actions'));
        add_action('admin_notices', array($this, 'notices'));
    }

    public function menu()
    {
        add_menu_page(
            __('CartGain', 'cartgain-woocommerce'),
            __('CartGain', 'cartgain-woocommerce'),
            'manage_options',
            'cartgain',
            array($this, 'render_page'),
            'dashicons-cart',
            56
        );
    }

    public function enqueue_assets($hook)
    {
        if (strpos($hook, 'cartgain') === false) {
            return;
        }
        wp_enqueue_style('cartgain-wc-admin', CGW_PLUGIN_URL . 'assets/css/admin.css', array(), CGW_VERSION);
        wp_enqueue_script('cartgain-wc-admin-js', CGW_PLUGIN_URL . 'assets/js/admin.js', array(), CGW_VERSION, true);
        wp_localize_script('cartgain-wc-admin-js', 'cartgainAdmin', array(
            'confirmDisconnect' => __('Disconnect CartGain? Local credentials will be removed.', 'cartgain-woocommerce'),
        ));
    }

    private function guard($nonce_action, $rate_action)
    {
        if (!current_user_can('manage_options')) {
            wp_die(esc_html__('You are not allowed to perform this action.', 'cartgain-woocommerce'));
        }
        check_admin_referer($nonce_action);
        if (!cartgain_wc_rate_limit($rate_action, 10, 5 * MINUTE_IN_SECONDS)) {
            return false;
        }
        return true;
    }

    private function redirect($notice, $tab = 'connection')
    {
        $url = add_query_arg(array(
            'page' => 'cartgain',
            'tab' => sanitize_key($tab),
            'cgw_notice' => sanitize_key($notice),
        ), admin_url('admin.php'));
        wp_safe_redirect($url);
        exit;
    }

    public function handle_actions()
    {
        if (!isset($_POST['cartgain_action'])) {
            return;
        }
        $action = sanitize_key(wp_unslash($_POST['cartgain_action']));

        if ($action === 'connect') {
            if (!$this->guard('cartgain_wc_connect', 'admin_connect')) {
                $this->redirect('rate_limited', 'connection');
            }
            $code = isset($_POST['cartgain_connection_code']) ? (string) wp_unslash($_POST['cartgain_connection_code']) : '';
            $url = isset($_POST['cartgain_store_url']) ? (string) wp_unslash($_POST['cartgain_store_url']) : home_url('/');
            $key = isset($_POST['cartgain_consumer_key']) ? (string) wp_unslash($_POST['cartgain_consumer_key']) : '';
            $secret = isset($_POST['cartgain_consumer_secret']) ? (string) wp_unslash($_POST['cartgain_consumer_secret']) : '';
            $result = $this->credentials->connect($code, $url, $key, $secret);
            if (is_wp_error($result)) {
                set_transient(
                    'cartgain_wc_connect_error',
                    $result->get_error_code() . ': ' . $result->get_error_message(),
                    10 * MINUTE_IN_SECONDS
                );
                $this->redirect('connect_failed', 'connection');
            }
            delete_transient('cartgain_wc_connect_error');
            $plugin = cartgain_wc();
            if ($plugin && $plugin->products) {
                $plugin->products->schedule_full_sync();
            }
            $this->redirect('connected', 'connection');
        }

        if ($action === 'disconnect') {
            if (!$this->guard('cartgain_wc_disconnect', 'admin_disconnect')) {
                $this->redirect('rate_limited', 'connection');
            }
            $result = $this->credentials->disconnect();
            $this->redirect(is_wp_error($result) ? 'disconnected_warning' : 'disconnected', 'connection');
        }

        if ($action === 'sync') {
            if (!$this->guard('cartgain_wc_sync', 'admin_sync')) {
                $this->redirect('rate_limited', 'products');
            }
            $plugin = cartgain_wc();
            if (!$plugin->products) {
                $this->redirect('action_failed', 'products');
            }
            $plugin->products->schedule_full_sync();
            $this->redirect('sync_queued', 'products');
        }

        if ($action === 'retry') {
            if (!$this->guard('cartgain_wc_retry', 'admin_retry')) {
                $this->redirect('rate_limited', 'troubleshooting');
            }
            $this->queue->retry_failed();
            $this->redirect('retry_queued', 'troubleshooting');
        }
    }

    public function notices()
    {
        if (!isset($_GET['cgw_notice'])) {
            return;
        }
        $notice = sanitize_key(wp_unslash($_GET['cgw_notice']));
        $messages = array(
            'connected' => array('notice-success', __('CartGain connected successfully.', 'cartgain-woocommerce')),
            'connect_failed' => array('notice-error', __('Connection failed. Check the code, URL, Consumer Key and Consumer Secret, then try again.', 'cartgain-woocommerce')),
            'disconnected' => array('notice-success', __('CartGain disconnected and local credentials removed.', 'cartgain-woocommerce')),
            'disconnected_warning' => array('notice-warning', __('Disconnected locally. CartGain could not be reached to complete remote cleanup.', 'cartgain-woocommerce')),
            'sync_queued' => array('notice-success', __('Full product sync queued.', 'cartgain-woocommerce')),
            'retry_queued' => array('notice-success', __('Failed events queued for retry.', 'cartgain-woocommerce')),
            'rate_limited' => array('notice-warning', __('Too many attempts. Please wait a few minutes.', 'cartgain-woocommerce')),
            'action_failed' => array('notice-error', __('Action unavailable. Check that WooCommerce is active.', 'cartgain-woocommerce')),
        );
        if (!isset($messages[$notice])) {
            return;
        }
        $message = $messages[$notice][1];
        if ($notice === 'connect_failed') {
            $detail = get_transient('cartgain_wc_connect_error');
            if (is_string($detail) && $detail !== '') {
                $message .= ' ' . $detail;
                delete_transient('cartgain_wc_connect_error');
            }
        }
        echo '<div class="notice ' . esc_attr($messages[$notice][0]) . ' is-dismissible"><p>' . esc_html($message) . '</p></div>';
    }

    public function render_page()
    {
        if (!current_user_can('manage_options')) {
            wp_die(esc_html__('You are not allowed to view this page.', 'cartgain-woocommerce'));
        }
        $tab = isset($_GET['tab']) ? sanitize_key(wp_unslash($_GET['tab'])) : 'connection';
        if (!in_array($tab, array('connection', 'tracking', 'products', 'troubleshooting'), true)) {
            $tab = 'connection';
        }
        $public = $this->credentials->get_public();
        include CGW_PLUGIN_DIR . 'admin/views/settings-page.php';
    }
}
