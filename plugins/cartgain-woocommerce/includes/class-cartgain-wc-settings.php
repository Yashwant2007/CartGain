<?php

if (!defined('ABSPATH')) {
    exit;
}

final class CartGain_WC_Settings
{
    private $credentials;
    private $queue;
    private $scheduler;

    public function __construct($credentials, $queue, $scheduler)
    {
        $this->credentials = $credentials;
        $this->queue = $queue;
        $this->scheduler = $scheduler;
        add_action('admin_init', array($this, 'register'));
    }

    public static function seed_defaults()
    {
        if (false === get_option('cartgain_wc_settings')) {
            add_option('cartgain_wc_settings', cartgain_wc_default_settings(), '', false);
        }
    }

    public static function remove_all()
    {
        delete_option('cartgain_wc_settings');
        delete_option('cartgain_wc_db_version');
    }

    public function register()
    {
        register_setting('cartgain_wc_settings', 'cartgain_wc_settings', array($this, 'sanitize'));

        add_settings_section(
            'cartgain_wc_status',
            __('Connection &amp; service status', 'cartgain-woocommerce'),
            array($this, 'status_section_text'),
            'cartgain-wc-connection'
        );
        $this->add_status_field('cgw_status_connection', 'render_status_connection', __('Connection', 'cartgain-woocommerce'));
        $this->add_status_field('cgw_status_store', 'render_status_store', __('Store identifier', 'cartgain-woocommerce'));
        $this->add_status_field('cgw_status_sync', 'render_status_sync', __('Product sync / last sync', 'cartgain-woocommerce'));
        $this->add_status_field('cgw_status_cart', 'render_status_cart', __('Cart tracking', 'cartgain-woocommerce'));
        $this->add_status_field('cgw_status_bargain', 'render_status_bargain', __('Bargain widget', 'cartgain-woocommerce'));
        $this->add_status_field('cgw_status_recovery', 'render_status_recovery', __('Recovery status', 'cartgain-woocommerce'));
        $this->add_status_field('cgw_status_consent', 'render_status_consent', __('Consent configuration', 'cartgain-woocommerce'));
        $this->add_status_field('cgw_status_queue', 'render_status_queue', __('Event queue', 'cartgain-woocommerce'));

        add_settings_section(
            'cartgain_wc_tracking_section',
            __('Tracking, consent &amp; recovery', 'cartgain-woocommerce'),
            array($this, 'tracking_section_text'),
            'cartgain-wc-tracking'
        );
        $this->add_config_field('cart_tracking', __('Enable cart tracking', 'cartgain-woocommerce'), 'cartgain-wc-tracking', 'cartgain_wc_tracking_section');
        $this->add_config_field('abandonment_enabled', __('Local inactivity check (advanced)', 'cartgain-woocommerce'), 'cartgain-wc-tracking', 'cartgain_wc_tracking_section');
        $this->add_config_field('inactivity_minutes', __('Inactivity threshold (minutes)', 'cartgain-woocommerce'), 'cartgain-wc-tracking', 'cartgain_wc_tracking_section', 'render_number');
        $this->add_config_field('consent_email_enabled', __('Show email reminder opt-in', 'cartgain-woocommerce'), 'cartgain-wc-tracking', 'cartgain_wc_tracking_section');
        $this->add_config_field('consent_whatsapp_enabled', __('Show WhatsApp reminder opt-in', 'cartgain-woocommerce'), 'cartgain-wc-tracking', 'cartgain_wc_tracking_section');
        $this->add_config_field('recovery_status', __('Show recovery status summary', 'cartgain-woocommerce'), 'cartgain-wc-tracking', 'cartgain_wc_tracking_section');
        $this->add_config_field('order_tracking', __('Enable order events', 'cartgain-woocommerce'), 'cartgain-wc-tracking', 'cartgain_wc_tracking_section');

        add_settings_section(
            'cartgain_wc_products_section',
            __('Products &amp; bargain', 'cartgain-woocommerce'),
            array($this, 'products_section_text'),
            'cartgain-wc-products'
        );
        $this->add_config_field('product_sync', __('Sync products and variations', 'cartgain-woocommerce'), 'cartgain-wc-products', 'cartgain_wc_products_section');
        $this->add_config_field('bargain_enabled', __('Enable bargain widget shortcode', 'cartgain-woocommerce'), 'cartgain-wc-products', 'cartgain_wc_products_section');
        $this->add_config_field('bargain_auto_product', __('Automatically add widget to product pages', 'cartgain-woocommerce'), 'cartgain-wc-products', 'cartgain_wc_products_section');
    }

    public function sanitize($input)
    {
        $defaults = cartgain_wc_default_settings();
        $output = array();
        foreach ($defaults as $key => $default) {
            if ($key === 'inactivity_minutes') {
                $minutes = isset($input[$key]) ? (int) $input[$key] : (int) $default;
                $output[$key] = max(15, min(10080, $minutes));
                continue;
            }
            $value = isset($input[$key]) ? $input[$key] : 'no';
            $output[$key] = cartgain_wc_to_bool($value) ? 'yes' : 'no';
        }
        return $output;
    }

    private function add_status_field($id, $callback, $title)
    {
        add_settings_field($id, $title, array($this, $callback), 'cartgain-wc-connection', 'cartgain_wc_status');
    }

    private function add_config_field($key, $title, $page, $section, $renderer = 'render_checkbox')
    {
        add_settings_field(
            'cgw_field_' . $key,
            $title,
            array($this, $renderer),
            $page,
            $section,
            array('key' => $key, 'label' => $title)
        );
    }

    public function status_section_text()
    {
        echo '<p class="description">' . esc_html__('Read-only status from this plugin and your CartGain connection. No credentials are shown.', 'cartgain-woocommerce') . '</p>';
    }

    public function tracking_section_text()
    {
        echo '<p class="description">' . esc_html__('CartGain decides inactivity and recovery timing. The local inactivity check is an advanced opt-in that only sends an event for carts with explicit consent.', 'cartgain-woocommerce') . '</p>';
    }

    public function products_section_text()
    {
        echo '<p class="description">' . esc_html__('Product data is sent to CartGain when saved. No product mirror table is kept locally.', 'cartgain-woocommerce') . '</p>';
    }

    public function render_checkbox($args)
    {
        $key = isset($args['key']) ? $args['key'] : '';
        $label = isset($args['label']) ? $args['label'] : '';
        $settings = cartgain_wc_get_settings();
        $checked = cartgain_wc_to_bool(isset($settings[$key]) ? $settings[$key] : 'no') ? 'checked="checked"' : '';
        echo '<label><input type="hidden" name="cartgain_wc_settings[' . esc_attr($key) . ']" value="0" />';
        echo '<input type="checkbox" name="cartgain_wc_settings[' . esc_attr($key) . ']" value="yes" ' . $checked . ' /> ';
        echo esc_html($label) . '</label>';
    }

    public function render_number($args)
    {
        $key = isset($args['key']) ? $args['key'] : '';
        $settings = cartgain_wc_get_settings();
        $value = isset($settings[$key]) ? (int) $settings[$key] : 60;
        echo '<input type="number" min="15" max="10080" step="1" name="cartgain_wc_settings[' . esc_attr($key) . ']" value="' . esc_attr((string) $value) . '" class="small-text" />';
    }

    private function pill($label, $good)
    {
        $class = $good ? 'cgw-pill cgw-pill-ok' : 'cgw-pill cgw-pill-off';
        echo '<span class="' . esc_attr($class) . '">' . esc_html($label) . '</span>';
    }

    public function render_status_connection()
    {
        $public = $this->credentials->get_public();
        $this->pill($public['connected'] ? __('Connected', 'cartgain-woocommerce') : __('Not connected', 'cartgain-woocommerce'), $public['connected']);
        if ($public['connected']) {
            echo '<p class="description">' . esc_html(sprintf(__('Connected %s', 'cartgain-woocommerce'), date_i18n(get_option('date_format'), $public['connected_at']))) . '</p>';
        }
    }

    public function render_status_store()
    {
        $public = $this->credentials->get_public();
        if ($public['store_id'] === '') {
            echo '<span class="description">' . esc_html__('Not available', 'cartgain-woocommerce') . '</span>';
            return;
        }
        echo '<code>' . esc_html($public['store_id']) . '</code>';
        echo '<p class="description">' . esc_html($public['store_url']) . '</p>';
    }

    public function render_status_sync()
    {
        $public = $this->credentials->get_public();
        $enabled = cartgain_wc_to_bool(cartgain_wc_setting('product_sync'));
        $this->pill($enabled ? __('Enabled', 'cartgain-woocommerce') : __('Paused', 'cartgain-woocommerce'), $enabled);
        if ($public['last_sync'] > 0) {
            echo '<p class="description">' . esc_html(sprintf(__('Last delivery: %s', 'cartgain-woocommerce'), date_i18n(get_option('date_format') . ' ' . get_option('time_format'), $public['last_sync']))) . '</p>';
        }
    }

    public function render_status_cart()
    {
        $enabled = cartgain_wc_to_bool(cartgain_wc_setting('cart_tracking'));
        $this->pill($enabled ? __('Enabled', 'cartgain-woocommerce') : __('Paused', 'cartgain-woocommerce'), $enabled);
        echo '<p class="description">' . esc_html__('Events: created, item added/updated/removed, checkout started, customer identified.', 'cartgain-woocommerce') . '</p>';
    }

    public function render_status_bargain()
    {
        $enabled = cartgain_wc_to_bool(cartgain_wc_setting('bargain_enabled'));
        $this->pill($enabled ? __('Enabled', 'cartgain-woocommerce') : __('Disabled', 'cartgain-woocommerce'), $enabled);
        echo '<p class="description">' . esc_html__('Shortcode: [cartgain_bargain]', 'cartgain-woocommerce') . '</p>';
    }

    public function render_status_recovery()
    {
        if (!cartgain_wc_to_bool(cartgain_wc_setting('recovery_status'))) {
            echo '<span class="description">' . esc_html__('Summary hidden by settings.', 'cartgain-woocommerce') . '</span>';
            return;
        }
        $status = $this->credentials->recovery_status();
        if (is_wp_error($status)) {
            echo '<span class="description">' . esc_html__('Status unavailable.', 'cartgain-woocommerce') . '</span>';
            return;
        }
        $labels = array(
            'status' => __('Status', 'cartgain-woocommerce'),
            'activeCarts' => __('Active carts', 'cartgain-woocommerce'),
            'pendingReminders' => __('Pending reminders', 'cartgain-woocommerce'),
            'consentedCarts' => __('Consented carts', 'cartgain-woocommerce'),
        );
        $shown = false;
        foreach ($labels as $key => $label) {
            if (isset($status[$key]) && is_scalar($status[$key])) {
                echo '<p class="description">' . esc_html($label . ': ' . (string) $status[$key]) . '</p>';
                $shown = true;
            }
        }
        if (!$shown) {
            echo '<span class="description">' . esc_html__('Connected; no status fields returned.', 'cartgain-woocommerce') . '</span>';
        }
    }

    public function render_status_consent()
    {
        $email = cartgain_wc_to_bool(cartgain_wc_setting('consent_email_enabled'));
        $whatsapp = cartgain_wc_to_bool(cartgain_wc_setting('consent_whatsapp_enabled'));
        $this->pill($email ? __('Email opt-in on', 'cartgain-woocommerce') : __('Email opt-in off', 'cartgain-woocommerce'), $email);
        echo ' ';
        $this->pill($whatsapp ? __('WhatsApp opt-in on', 'cartgain-woocommerce') : __('WhatsApp opt-in off', 'cartgain-woocommerce'), $whatsapp);
        echo '<p class="description">' . esc_html__('Channels are independent. Billing phone never enables WhatsApp consent.', 'cartgain-woocommerce') . '</p>';
    }

    public function render_status_queue()
    {
        $stats = $this->queue->stats();
        echo '<p class="description">' . esc_html(sprintf(
            __('Pending: %d · Failed: %d · Delivered: %d', 'cartgain-woocommerce'),
            $stats['pending'],
            $stats['failed'],
            $stats['done']
        )) . '</p>';
        $next = $this->scheduler->next_run('cartgain_wc_process_queue');
        echo '<p class="description">' . esc_html(sprintf(
            __('Scheduler: %s · next run: %s', 'cartgain-woocommerce'),
            $this->scheduler->uses_action_scheduler() ? 'Action Scheduler' : 'WP Cron',
            $next > 0 ? date_i18n(get_option('date_format') . ' ' . get_option('time_format'), $next) : __('not scheduled', 'cartgain-woocommerce')
        )) . '</p>';
    }
}
