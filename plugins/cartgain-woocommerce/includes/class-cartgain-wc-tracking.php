<?php

if (!defined('ABSPATH')) {
    exit;
}

final class CartGain_WC_Tracking
{
    private $credentials;
    private $queue;
    private $scheduler;

    public function __construct($credentials, $queue, $scheduler)
    {
        $this->credentials = $credentials;
        $this->queue = $queue;
        $this->scheduler = $scheduler;
        $this->hooks();
    }

    private function hooks()
    {
        if (!cartgain_wc_to_bool(cartgain_wc_setting('cart_tracking'))) {
            return;
        }
        add_action('woocommerce_add_to_cart', array($this, 'on_item_added'), 10, 4);
        add_action('woocommerce_after_cart_item_quantity_update', array($this, 'on_item_updated'), 10, 4);
        add_action('woocommerce_cart_item_removed', array($this, 'on_item_removed'), 10, 2);
        add_action('woocommerce_cart_item_restored', array($this, 'on_item_restored'), 10, 2);
        add_action('wp', array($this, 'maybe_checkout_started'));
        add_action('woocommerce_checkout_update_customer', array($this, 'on_customer_identified'), 10, 2);
        add_filter('woocommerce_checkout_fields', array($this, 'add_consent_fields'));
        add_filter('woocommerce_checkout_posted_data', array($this, 'capture_posted_consent'));
        add_action('woocommerce_checkout_create_order', array($this, 'attach_consent_to_order'), 10, 2);
        add_action('cartgain_wc_inactivity_check', array($this, 'check_inactivity'));
        add_action('cartgain_wc_cleanup', array($this, 'cleanup_carts'));
    }

    private function ensure_woocommerce()
    {
        if (function_exists('wc_load_cart') && (!isset(WC()->session) || !isset(WC()->cart))) {
            wc_load_cart();
        }
        return isset(WC()->cart) ? true : false;
    }

    private function cart_identity()
    {
        $this->ensure_woocommerce();
        $session_id = '';
        $cart_hash = '';
        $source = 'php';
        if (isset(WC()->session) && WC()->session) {
            $session_id = (string) WC()->session->get_customer_id();
            $cart_hash = (string) WC()->session->get('cartgain_cart_hash', '');
        }
        if (isset(WC()->cart) && WC()->cart && method_exists(WC()->cart, 'get_cart_hash')) {
            $cart_hash = (string) WC()->cart->get_cart_hash();
            if (isset(WC()->session) && WC()->session) {
                WC()->session->set('cartgain_cart_hash', $cart_hash);
            }
        }
        if ($session_id === '' && $cart_hash === '') {
            return array();
        }
        $source_key = $session_id !== '' ? $session_id : $cart_hash;
        return array(
            'key' => hash('sha256', $source_key),
            'session_id' => $session_id,
            'cart_hash' => $cart_hash,
            'source' => $source,
        );
    }

    private function cart_items()
    {
        $this->ensure_woocommerce();
        $items = array();
        if (!isset(WC()->cart) || !WC()->cart || !method_exists(WC()->cart, 'get_cart')) {
            return $items;
        }
        foreach (WC()->cart->get_cart() as $values) {
            $product = isset($values['data']) && is_object($values['data']) ? $values['data'] : null;
            $items[] = array(
                'productId' => isset($values['product_id']) ? (int) $values['product_id'] : 0,
                'variationId' => isset($values['variation_id']) ? (int) $values['variation_id'] : 0,
                'quantity' => isset($values['quantity']) ? (int) $values['quantity'] : 0,
                'lineTotal' => isset($values['line_total']) ? (string) round((float) $values['line_total'], 2) : '0',
                'name' => $product && method_exists($product, 'get_name') ? sanitize_text_field($product->get_name()) : '',
                'sku' => $product && method_exists($product, 'get_sku') ? sanitize_text_field($product->get_sku()) : '',
            );
            if (count($items) >= 100) {
                break;
            }
        }
        return $items;
    }

    private function cart_totals()
    {
        $this->ensure_woocommerce();
        if (!isset(WC()->cart) || !WC()->cart) {
            return array('subtotal' => '0', 'total' => '0');
        }
        $subtotal = method_exists(WC()->cart, 'get_subtotal') ? WC()->cart->get_subtotal() : 0;
        $total = method_exists(WC()->cart, 'get_total') ? WC()->cart->get_total('numeric') : 0;
        return array(
            'subtotal' => (string) round((float) $subtotal, 2),
            'total' => (string) round((float) $total, 2),
        );
    }

    private function snapshot()
    {
        $identity = $this->cart_identity();
        if (empty($identity)) {
            return array();
        }
        return array(
            'cartId' => $identity['session_id'],
            'cartToken' => $identity['session_id'],
            'cartHash' => $identity['cart_hash'],
            'source' => 'php',
            'items' => $this->cart_items(),
            'totals' => $this->cart_totals(),
            'currency' => function_exists('get_woocommerce_currency') ? get_woocommerce_currency() : 'USD',
            'consent' => $this->get_consent(),
        );
    }

    private function enqueue_cart_event($event_type, $extra = array(), $dedupe_suffix = '')
    {
        $snapshot = $this->snapshot();
        if (empty($snapshot)) {
            return false;
        }
        $identity = $this->cart_identity();
        if (!empty($identity) && !$this->row_exists($identity['key'])) {
            $this->queue->enqueue('cart_created', $snapshot, $identity['key'] . '|created');
            $this->upsert_row($identity['key'], $identity['cart_hash'], $identity['source'], $snapshot['consent'], $snapshot);
        }
        $snapshot = array_merge($snapshot, $extra);
        $dedupe = $snapshot['cartHash'] . '|' . $event_type . '|' . $dedupe_suffix;
        return $this->queue->enqueue($event_type, $snapshot, $dedupe);
    }

    public function on_item_added($cart_item_key, $product_id, $quantity, $variation_id = 0)
    {
        $this->enqueue_cart_event('cart_item_added', array(
            'productId' => (int) $product_id,
            'variationId' => (int) $variation_id,
            'quantity' => (int) $quantity,
        ), (string) $cart_item_key);
        $this->touch_row();
    }

    public function on_item_updated($cart_item_key, $quantity, $old_quantity = 0, $cart = null)
    {
        $this->enqueue_cart_event('cart_item_updated', array(
            'quantity' => (int) $quantity,
            'previousQuantity' => (int) $old_quantity,
        ), (string) $cart_item_key . '|' . (int) $quantity);
        $this->touch_row();
    }

    public function on_item_removed($cart_item_key, $cart = null)
    {
        $this->enqueue_cart_event('cart_item_removed', array('itemKey' => substr((string) $cart_item_key, 0, 64)), (string) $cart_item_key);
        $this->touch_row();
    }

    public function on_item_restored($cart_item_key, $cart = null)
    {
        $this->enqueue_cart_event('cart_item_added', array('itemKey' => substr((string) $cart_item_key, 0, 64)), 'restored_' . (string) $cart_item_key);
        $this->touch_row();
    }

    public function maybe_checkout_started()
    {
        if (!function_exists('is_checkout') || !is_checkout() || (function_exists('is_order_received_page') && is_order_received_page())) {
            return;
        }
        $this->ensure_woocommerce();
        if (!isset(WC()->session) || !WC()->session || WC()->session->get('cartgain_checkout_started')) {
            return;
        }
        WC()->session->set('cartgain_checkout_started', 1);
        $this->enqueue_cart_event('checkout_started', $this->customer_fields(), 'checkout');
        $this->on_customer_identified(null, WC()->customer);
    }

    private function customer_fields()
    {
        $this->ensure_woocommerce();
        if (!isset(WC()->customer) || !WC()->customer) {
            return array();
        }
        $customer = WC()->customer;
        $email = method_exists($customer, 'get_billing_email') ? (string) $customer->get_billing_email() : '';
        $phone = method_exists($customer, 'get_billing_phone') ? (string) $customer->get_billing_phone() : '';
        $fields = array();
        if ($email !== '' && is_email($email)) {
            $fields['email'] = sanitize_email($email);
        }
        if ($phone !== '') {
            $fields['phone'] = sanitize_text_field($phone);
        }
        return $fields;
    }

    public function on_customer_identified($customer = null, $wc_customer = null)
    {
        if (!cartgain_wc_to_bool(cartgain_wc_setting('cart_tracking'))) {
            return;
        }
        $fields = $this->customer_fields();
        if (empty($fields)) {
            return;
        }
        $this->ensure_woocommerce();
        if (!isset(WC()->session) || !WC()->session) {
            return;
        }
        $signature = md5(cartgain_wc_json_encode($fields));
        if (WC()->session->get('cartgain_customer_signature') === $signature) {
            return;
        }
        WC()->session->set('cartgain_customer_signature', $signature);
        $this->enqueue_cart_event('customer_identified', $fields, $signature);
    }

    public function add_consent_fields($fields)
    {
        if (!isset($fields['order']) || !is_array($fields['order'])) {
            $fields['order'] = array();
        }
        if (cartgain_wc_to_bool(cartgain_wc_setting('consent_email_enabled'))) {
            $fields['order']['cartgain_email_consent'] = array(
                'type' => 'checkbox',
                'label' => __('Email me a link to finish my cart later', 'cartgain-woocommerce'),
                'required' => false,
                'class' => array('cartgain-consent-checkbox'),
                'priority' => 5,
            );
        }
        if (cartgain_wc_to_bool(cartgain_wc_setting('consent_whatsapp_enabled'))) {
            $fields['order']['cartgain_whatsapp_consent'] = array(
                'type' => 'checkbox',
                'label' => __('Message me on WhatsApp about my cart', 'cartgain-woocommerce'),
                'required' => false,
                'class' => array('cartgain-consent-checkbox'),
                'priority' => 6,
            );
            $fields['order']['cartgain_whatsapp_phone'] = array(
                'type' => 'tel',
                'label' => __('WhatsApp number (optional)', 'cartgain-woocommerce'),
                'required' => false,
                'class' => array('cartgain-consent-phone'),
                'priority' => 7,
            );
        }
        return $fields;
    }

    public function capture_posted_consent($data)
    {
        if (!is_array($data)) {
            return $data;
        }
        $this->ensure_woocommerce();
        $email_on = isset($data['cartgain_email_consent']) && cartgain_wc_to_bool($data['cartgain_email_consent']);
        $whatsapp_on = isset($data['cartgain_whatsapp_consent']) && cartgain_wc_to_bool($data['cartgain_whatsapp_consent']);
        $phone = isset($data['cartgain_whatsapp_phone']) ? (string) $data['cartgain_whatsapp_phone'] : '';
        $this->set_consent(array(
            'email' => $email_on,
            'whatsapp' => $whatsapp_on,
            'whatsappPhone' => $phone,
        ), 'checkout');
        return $data;
    }

    public function get_consent()
    {
        $this->ensure_woocommerce();
        $stored = array();
        if (isset(WC()->session) && WC()->session) {
            $stored = WC()->session->get('cartgain_consent', array());
        }
        if (!is_array($stored) && is_user_logged_in()) {
            $stored = get_user_meta(get_current_user_id(), '_cartgain_consent', true);
        }
        if (!is_array($stored)) {
            $stored = array();
        }
        return $stored;
    }

    public function set_consent($input, $source)
    {
        if (!is_array($input)) {
            return false;
        }
        $source = in_array($source, array('checkout', 'store_api', 'shortcode', 'optout_link'), true) ? $source : 'unknown';
        $timestamp = current_time('timestamp');
        $consent = $this->get_consent();
        if (!is_array($consent)) {
            $consent = array();
        }
        foreach (array('email', 'whatsapp') as $channel) {
            if (!array_key_exists($channel, $input) || null === $input[$channel]) {
                continue;
            }
            $consent[$channel] = array(
                'enabled' => !empty($input[$channel]),
                'source' => $source,
                'timestamp' => $timestamp,
            );
        }
        if (array_key_exists('whatsappPhone', $input) && isset($consent['whatsapp'])) {
            $phone = preg_replace('/[^0-9+]/', '', (string) $input['whatsappPhone']);
            if (strlen($phone) > 20) {
                $phone = substr($phone, 0, 20);
            }
            if ($phone !== '') {
                $consent['whatsapp']['phone'] = $phone;
            }
        }

        $this->ensure_woocommerce();
        if (isset(WC()->session) && WC()->session) {
            WC()->session->set('cartgain_consent', $consent);
        }
        if (is_user_logged_in()) {
            update_user_meta(get_current_user_id(), '_cartgain_consent', $consent);
        }
        $this->touch_row($consent);
        $this->queue->enqueue('customer_identified', array(
            'consent' => $consent,
            'cartId' => $this->cart_identity_key(),
            'source' => $source,
        ), 'consent_' . md5(cartgain_wc_json_encode($consent)) . '|' . $source);
        return true;
    }

    private function cart_identity_key()
    {
        $identity = $this->cart_identity();
        return empty($identity) ? '' : $identity['key'];
    }

    public function attach_consent_to_order($order, $data = array())
    {
        if (!is_object($order) || !method_exists($order, 'update_meta_data')) {
            return;
        }
        $order->update_meta_data('_cartgain_consent', cartgain_wc_json_encode($this->get_consent()));
        $identity = $this->cart_identity();
        if (!empty($identity)) {
            $order->update_meta_data('_cartgain_cart_key', $identity['key']);
        }
    }

    public function mark_converted($order_id, $cart_key = '')
    {
        global $wpdb;
        $table = CartGain_WC_Database::carts_table();
        if ($cart_key === '') {
            return;
        }
        $wpdb->update(
            $table,
            array('status' => 'converted', 'last_activity' => current_time('mysql')),
            array('cart_key' => sanitize_hex_hash($cart_key)),
            array('%s', '%s'),
            array('%s')
        );
    }

    public function enqueue_store_api_cart($payload)
    {
        $token = isset($payload['cartToken']) ? (string) $payload['cartToken'] : '';
        if ($token === '' || strlen($token) > 190) {
            return false;
        }
        $cart_key = hash('sha256', $token);
        $items = $this->sanitize_items(isset($payload['items']) ? $payload['items'] : array());
        $totals = $this->sanitize_totals(isset($payload['totals']) ? $payload['totals'] : array());
        $currency = isset($payload['currency']) ? strtoupper(substr(sanitize_text_field($payload['currency']), 0, 3)) : '';
        if ($currency === '') {
            $currency = function_exists('get_woocommerce_currency') ? get_woocommerce_currency() : 'USD';
        }
        $consent = $this->get_consent();
        $data = array(
            'cartId' => $token,
            'cartToken' => $token,
            'cartHash' => isset($payload['cartHash']) ? substr(sanitize_text_field($payload['cartHash']), 0, 64) : '',
            'source' => 'store_api',
            'items' => $items,
            'totals' => $totals,
            'currency' => $currency,
            'consent' => $consent,
        );
        $signature = md5(cartgain_wc_json_encode(array($items, $totals, $currency)));
        $exists = $this->row_exists($cart_key);
        $event_type = $exists ? 'cart_item_updated' : 'cart_created';
        $result = $this->queue->enqueue($event_type, $data, $cart_key . '|' . $signature);
        $this->upsert_row($cart_key, $data['cartHash'], 'store_api', $consent, $data);
        return $result;
    }

    public function enqueue_store_api_checkout($payload)
    {
        $token = isset($payload['cartToken']) ? (string) $payload['cartToken'] : '';
        if ($token === '') {
            return false;
        }
        return $this->queue->enqueue('checkout_started', array(
            'cartId' => $token,
            'cartToken' => $token,
            'source' => 'store_api',
        ), hash('sha256', $token) . '|checkout');
    }

    public function enqueue_store_api_customer($payload)
    {
        $token = isset($payload['cartToken']) ? (string) $payload['cartToken'] : '';
        if ($token === '') {
            return false;
        }
        $fields = array();
        if (!empty($payload['email']) && is_email($payload['email'])) {
            $fields['email'] = sanitize_email($payload['email']);
        }
        if (!empty($payload['phone'])) {
            $fields['phone'] = sanitize_text_field($payload['phone']);
        }
        if (empty($fields)) {
            return false;
        }
        return $this->queue->enqueue('customer_identified', array_merge(array(
            'cartId' => $token,
            'cartToken' => $token,
            'source' => 'store_api',
        ), $fields), hash('sha256', $token) . '|customer|' . md5(cartgain_wc_json_encode($fields)));
    }

    private function sanitize_items($items)
    {
        $clean = array();
        if (!is_array($items)) {
            return $clean;
        }
        foreach (array_slice($items, 0, 100) as $item) {
            if (!is_array($item)) {
                continue;
            }
            $clean[] = array(
                'productId' => isset($item['productId']) ? (int) $item['productId'] : 0,
                'variationId' => isset($item['variationId']) ? (int) $item['variationId'] : 0,
                'quantity' => isset($item['quantity']) ? max(0, min(10000, (int) $item['quantity'])) : 0,
            );
        }
        return $clean;
    }

    private function sanitize_totals($totals)
    {
        if (!is_array($totals)) {
            return array('subtotal' => '0', 'total' => '0');
        }
        return array(
            'subtotal' => isset($totals['subtotal']) ? (string) round((float) $totals['subtotal'], 2) : '0',
            'total' => isset($totals['total']) ? (string) round((float) $totals['total'], 2) : '0',
        );
    }

    private function row_exists($cart_key)
    {
        global $wpdb;
        $table = CartGain_WC_Database::carts_table();
        return (bool) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM `{$table}` WHERE cart_key = %s", $cart_key));
    }

    private function ensure_row($cart_key, $cart_hash, $source, $consent, $data)
    {
        if (!$this->row_exists($cart_key)) {
            $this->upsert_row($cart_key, $cart_hash, $source, $consent, $data);
        }
    }

    private function touch_row($consent = null)
    {
        $identity = $this->cart_identity();
        if (empty($identity)) {
            return;
        }
        if (null === $consent) {
            $consent = $this->get_consent();
        }
        $this->upsert_row($identity['key'], $identity['cart_hash'], $identity['source'], $consent, $this->snapshot());
    }

    private function upsert_row($cart_key, $cart_hash, $source, $consent, $data)
    {
        global $wpdb;
        $table = CartGain_WC_Database::carts_table();
        $now = current_time('mysql');
        $sql = "INSERT INTO `{$table}` (cart_key, cart_hash, source, last_activity, created_at, status, consent, data)
                VALUES (%s, %s, %s, %s, %s, 'open', %s, %s)
                ON DUPLICATE KEY UPDATE cart_hash = VALUES(cart_hash), source = VALUES(source), last_activity = VALUES(last_activity), consent = VALUES(consent), data = VALUES(data)";
        $wpdb->query($wpdb->prepare(
            $sql,
            sanitize_hex_hash($cart_key),
            substr((string) $cart_hash, 0, 64),
            in_array($source, array('php', 'store_api'), true) ? $source : 'php',
            $now,
            $now,
            cartgain_wc_json_encode(is_array($consent) ? $consent : array()),
            cartgain_wc_json_encode(is_array($data) ? $data : array())
        ));
    }

    public function check_inactivity()
    {
        if (!cartgain_wc_to_bool(cartgain_wc_setting('abandonment_enabled')) || !$this->credentials->is_connected()) {
            return 0;
        }
        $minutes = max(15, min(10080, (int) cartgain_wc_setting('inactivity_minutes')));
        $cutoff = date('Y-m-d H:i:s', current_time('timestamp') - $minutes * MINUTE_IN_SECONDS);
        global $wpdb;
        $table = CartGain_WC_Database::carts_table();
        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT * FROM `{$table}` WHERE status = 'open' AND abandoned_notified = 0 AND last_activity <= %s ORDER BY last_activity ASC LIMIT 50",
                $cutoff
            ),
            ARRAY_A
        );
        if (empty($rows)) {
            return 0;
        }
        $sent = 0;
        foreach ($rows as $row) {
            $consent = json_decode($row['consent'], true);
            if (!is_array($consent)) {
                continue;
            }
            $has_consent = false;
            foreach (array('email', 'whatsapp') as $channel) {
                if (isset($consent[$channel]['enabled']) && cartgain_wc_to_bool($consent[$channel]['enabled'])) {
                    $has_consent = true;
                }
            }
            if (!$has_consent) {
                continue;
            }
            $data = json_decode($row['data'], true);
            if (!is_array($data)) {
                $data = array();
            }
            $data['cartKey'] = $row['cart_key'];
            $data['consent'] = $consent;
            $data['source'] = $row['source'];
            $data['inactiveMinutes'] = $minutes;
            $event_id = $this->queue->enqueue('cart_abandoned', $data, 'abandoned_' . $row['cart_key']);
            if ($event_id) {
                $wpdb->update(
                    $table,
                    array('abandoned_notified' => 1),
                    array('id' => (int) $row['id']),
                    array('%d'),
                    array('%d')
                );
                $sent++;
            }
        }
        return $sent;
    }

    public function cleanup_carts()
    {
        global $wpdb;
        $table = CartGain_WC_Database::carts_table();
        $stale = date('Y-m-d H:i:s', current_time('timestamp') - 30 * DAY_IN_SECONDS);
        $converted = date('Y-m-d H:i:s', current_time('timestamp') - 7 * DAY_IN_SECONDS);
        $wpdb->query($wpdb->prepare("DELETE FROM `{$table}` WHERE last_activity < %s", $stale));
        $wpdb->query($wpdb->prepare("DELETE FROM `{$table}` WHERE status = 'converted' AND last_activity < %s", $converted));
    }
}
