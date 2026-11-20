<?php

if (!defined('ABSPATH')) {
    exit;
}

final class CartGain_WC_Orders
{
    private $credentials;
    private $queue;
    private $tracking;

    public function __construct($credentials, $queue, $tracking)
    {
        $this->credentials = $credentials;
        $this->queue = $queue;
        $this->tracking = $tracking;
        $this->hooks();
    }

    private function hooks()
    {
        if (!cartgain_wc_to_bool(cartgain_wc_setting('order_tracking'))) {
            return;
        }
        add_action('woocommerce_new_order', array($this, 'order_created'));
        add_action('woocommerce_order_status_completed', array($this, 'order_paid'));
        add_action('woocommerce_payment_complete', array($this, 'order_paid'));
        add_action('woocommerce_order_status_cancelled', array($this, 'order_cancelled'));
        add_action('woocommerce_order_status_refunded', array($this, 'order_refunded'));
        add_action('woocommerce_refund_created', array($this, 'refund_created'));
    }

    public function order_created($order_id)
    {
        return $this->send('order_created', (int) $order_id);
    }

    public function order_paid($order_id)
    {
        $result = $this->send('order_paid', (int) $order_id);
        $order = wc_get_order((int) $order_id);
        if ($order) {
            $this->mark_converted($order);
        }
        return $result;
    }

    public function order_cancelled($order_id)
    {
        return $this->send('order_cancelled', (int) $order_id);
    }

    public function order_refunded($order_id)
    {
        return $this->send('order_refunded', (int) $order_id);
    }

    public function refund_created($refund_id)
    {
        $refund = wc_get_order((int) $refund_id);
        if (!$refund || !method_exists($refund, 'get_parent_id')) {
            return false;
        }
        $parent_id = (int) $refund->get_parent_id();
        if ($parent_id <= 0) {
            return false;
        }
        $result = $this->send('order_refunded', $parent_id, array(
            'refundId' => (int) $refund_id,
            'refundAmount' => method_exists($refund, 'get_amount') ? (string) $refund->get_amount() : '0',
            'refundReason' => method_exists($refund, 'get_reason') ? sanitize_text_field($refund->get_reason()) : '',
        ));
        return $result;
    }

    private function send($event_type, $order_id, $extra = array())
    {
        $order = $order_id > 0 ? wc_get_order($order_id) : null;
        if (!$order || !method_exists($order, 'get_id')) {
            return false;
        }
        $payload = array_merge($this->build_order($order), $extra);
        return $this->queue->enqueue($event_type, $payload, $event_type . '_' . $order_id . '_' . md5(cartgain_wc_json_encode($extra)));
    }

    private function build_order($order)
    {
        $items = array();
        foreach ($order->get_items() as $item) {
            $items[] = array(
                'itemId' => method_exists($item, 'get_id') ? (int) $item->get_id() : 0,
                'productId' => method_exists($item, 'get_product_id') ? (int) $item->get_product_id() : 0,
                'variationId' => method_exists($item, 'get_variation_id') ? (int) $item->get_variation_id() : 0,
                'name' => method_exists($item, 'get_name') ? sanitize_text_field($item->get_name()) : '',
                'quantity' => method_exists($item, 'get_quantity') ? (int) $item->get_quantity() : 0,
                'total' => method_exists($item, 'get_total') ? (string) $item->get_total() : '0',
            );
            if (count($items) >= 200) {
                break;
            }
        }

        $customer_id = method_exists($order, 'get_customer_id') ? (int) $order->get_customer_id() : 0;
        $consent_raw = method_exists($order, 'get_meta') ? $order->get_meta('_cartgain_consent', true) : '';
        $consent = json_decode($consent_raw, true);
        if (!is_array($consent)) {
            $consent = array();
        }

        $data = array(
            'orderId' => (int) $order->get_id(),
            'orderNumber' => method_exists($order, 'get_order_number') ? sanitize_text_field($order->get_order_number()) : (string) $order->get_id(),
            'customerId' => $customer_id,
            'status' => method_exists($order, 'get_status') ? sanitize_key($order->get_status()) : '',
            'items' => $items,
            'totals' => array(
                'subtotal' => method_exists($order, 'get_subtotal') ? (string) $order->get_subtotal() : '0',
                'total' => method_exists($order, 'get_total') ? (string) $order->get_total() : '0',
                'refunded' => method_exists($order, 'get_total_refunded') ? (string) $order->get_total_refunded() : '0',
            ),
            'currency' => method_exists($order, 'get_currency') ? sanitize_text_field($order->get_currency()) : 'USD',
            'createdAt' => method_exists($order, 'get_date_created') && $order->get_date_created() ? $order->get_date_created()->date('c') : gmdate('c'),
            'paidAt' => method_exists($order, 'get_date_paid') && $order->get_date_paid() ? $order->get_date_paid()->date('c') : '',
            'completedAt' => method_exists($order, 'get_date_completed') && $order->get_date_completed() ? $order->get_date_completed()->date('c') : '',
            'consent' => $consent,
            'source' => 'php',
        );

        $cart_key = method_exists($order, 'get_meta') ? $order->get_meta('_cartgain_cart_key', true) : '';
        if (is_string($cart_key) && $cart_key !== '') {
            $data['cartKey'] = sanitize_hex_hash($cart_key);
        }

        $email = method_exists($order, 'get_billing_email') ? (string) $order->get_billing_email() : '';
        $phone = method_exists($order, 'get_billing_phone') ? (string) $order->get_billing_phone() : '';
        if ($email !== '' && is_email($email)) {
            $data['customerEmail'] = sanitize_email($email);
        }
        if ($phone !== '') {
            $data['customerPhone'] = sanitize_text_field($phone);
        }
        return $data;
    }

    private function mark_converted($order)
    {
        if (!$this->tracking || !method_exists($order, 'get_meta')) {
            return;
        }
        $cart_key = (string) $order->get_meta('_cartgain_cart_key', true);
        $this->tracking->mark_converted((int) $order->get_id(), sanitize_hex_hash($cart_key));
    }
}
