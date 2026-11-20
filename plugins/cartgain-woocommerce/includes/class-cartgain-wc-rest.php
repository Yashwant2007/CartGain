<?php

if (!defined('ABSPATH')) {
    exit;
}

final class CartGain_WC_REST
{
    private $credentials;
    private $queue;
    private $tracking;

    public function __construct($credentials, $queue, $tracking)
    {
        $this->credentials = $credentials;
        $this->queue = $queue;
        $this->tracking = $tracking;
        add_action('rest_api_init', array($this, 'register'));
    }

    public function register()
    {
        register_rest_route('cartgain/v1', '/health', array(
            'methods' => 'GET',
            'callback' => array($this, 'health'),
            'permission_callback' => array($this, 'health_permission'),
        ));
        register_rest_route('cartgain/v1', '/events', array(
            'methods' => 'POST',
            'callback' => array($this, 'events'),
            'permission_callback' => array($this, 'public_permission'),
        ));
        register_rest_route('cartgain/v1', '/consent', array(
            'methods' => 'POST',
            'callback' => array($this, 'consent'),
            'permission_callback' => array($this, 'public_permission'),
        ));
    }

    public function health_permission($request)
    {
        if (!cartgain_wc_rate_limit('rest_health', 60, 5 * MINUTE_IN_SECONDS)) {
            return new WP_Error('cgw_rate_limited', __('Too many health checks.', 'cartgain-woocommerce'), array('status' => 429));
        }
        $secret = $this->credentials->signing_secret();
        if ($secret === '') {
            return false;
        }
        $timestamp = $request->get_header('X-CartGain-Timestamp');
        $signature = $request->get_header('X-CartGain-Signature');
        $canonical = $timestamp . '.';
        return cartgain_wc_hmac_matches(cartgain_wc_hmac_hex($canonical, $secret), $signature, $timestamp);
    }

    public function health($request)
    {
        $hpos = false;
        if (class_exists('Automattic\\WooCommerce\\Utilities\\OrderUtil') && method_exists('Automattic\\WooCommerce\\Utilities\\OrderUtil', 'custom_orders_table_usage_is_enabled')) {
            $hpos = (bool) Automattic\WooCommerce\Utilities\OrderUtil::custom_orders_table_usage_is_enabled();
        }
        return rest_ensure_response(array(
            'plugin' => 'cartgain-woocommerce',
            'version' => CGW_VERSION,
            'php' => PHP_VERSION,
            'wordpress' => get_bloginfo('version'),
            'woocommerce' => defined('WC_VERSION') ? WC_VERSION : '',
            'woocommerceActive' => class_exists('WooCommerce'),
            'hpos' => $hpos,
            'connected' => $this->credentials->is_connected(),
            'queue' => $this->queue->stats(),
            'scheduler' => cartgain_wc()->scheduler && cartgain_wc()->scheduler->uses_action_scheduler() ? 'action_scheduler' : 'wp_cron',
            'timestamp' => current_time('timestamp'),
        ));
    }

    public function public_permission($request)
    {
        if (!cartgain_wc_rate_limit('rest_public', 120, MINUTE_IN_SECONDS)) {
            return new WP_Error('cgw_rate_limited', __('Too many requests.', 'cartgain-woocommerce'), array('status' => 429));
        }
        $nonce = $request->get_header('X-WP-Nonce');
        if (!is_string($nonce) || $nonce === '') {
            $nonce = (string) $request->get_param('nonce');
        }
        if (!wp_verify_nonce($nonce, 'cartgain_wc_public')) {
            return false;
        }
        return true;
    }

    public function events($request)
    {
        if (!$this->tracking) {
            return new WP_Error('cgw_woocommerce_missing', __('WooCommerce is not active.', 'cartgain-woocommerce'), array('status' => 503));
        }
        if (!cartgain_wc_to_bool(cartgain_wc_setting('cart_tracking'))) {
            return rest_ensure_response(array('accepted' => false, 'reason' => 'tracking_disabled'));
        }
        $body = $request->get_json_params();
        if (!is_array($body)) {
            return new WP_Error('cgw_bad_request', __('Invalid payload.', 'cartgain-woocommerce'), array('status' => 400));
        }
        $type = isset($body['type']) ? sanitize_key($body['type']) : '';
        $payload = isset($body['payload']) && is_array($body['payload']) ? $body['payload'] : array();

        if ($type === 'store_api_cart') {
            $accepted = (bool) $this->tracking->enqueue_store_api_cart($payload);
        } elseif ($type === 'checkout_started') {
            $accepted = (bool) $this->tracking->enqueue_store_api_checkout($payload);
        } elseif ($type === 'customer_identified') {
            $accepted = (bool) $this->tracking->enqueue_store_api_customer($payload);
        } else {
            return new WP_Error('cgw_bad_event', __('Unsupported event.', 'cartgain-woocommerce'), array('status' => 400));
        }
        return rest_ensure_response(array('accepted' => $accepted));
    }

    public function consent($request)
    {
        if (!$this->tracking) {
            return new WP_Error('cgw_woocommerce_missing', __('WooCommerce is not active.', 'cartgain-woocommerce'), array('status' => 503));
        }
        $body = $request->get_json_params();
        if (!is_array($body)) {
            return new WP_Error('cgw_bad_request', __('Invalid payload.', 'cartgain-woocommerce'), array('status' => 400));
        }
        $source = isset($body['source']) ? sanitize_key($body['source']) : 'store_api';
        if (!in_array($source, array('checkout', 'store_api', 'shortcode', 'optout_link'), true)) {
            $source = 'unknown';
        }
        $input = array(
            'email' => !empty($body['email']),
            'whatsapp' => !empty($body['whatsapp']),
            'whatsappPhone' => isset($body['whatsappPhone']) ? (string) $body['whatsappPhone'] : '',
        );
        $accepted = $this->tracking->set_consent($input, $source);
        return rest_ensure_response(array('accepted' => $accepted));
    }
}
