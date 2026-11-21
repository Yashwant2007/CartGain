<?php

if (!defined('ABSPATH')) {
    exit;
}

final class CartGain_WC_HTTP
{
    public function url($path)
    {
        return CGW_API_BASE . '/' . ltrim((string) $path, '/');
    }

    public function request($method, $path, $payload, $secret, $extra_headers = array(), $event_id = '')
    {
        $url = $this->url($path);
        if (!cartgain_wc_is_https_url($url)) {
            return new WP_Error('cgw_http_insecure', __('CartGain endpoints must use HTTPS.', 'cartgain-woocommerce'));
        }

        $method = strtoupper((string) $method);
        $body = (null === $payload) ? '' : cartgain_wc_json_encode($payload);
        $timestamp = time();
        $store_id = isset($extra_headers['X-CartGain-Store-Id']) ? trim((string) $extra_headers['X-CartGain-Store-Id']) : '';
        $signature_path = '/' . ltrim((string) $path, '/');
        $canonical = $store_id === ''
            ? $timestamp . '.' . $body
            : $timestamp . '.' . $store_id . '.' . $signature_path;

        $headers = array(
            'Content-Type' => 'application/json',
            'Accept' => 'application/json',
            'User-Agent' => 'CartGain-WooCommerce/' . CGW_VERSION,
            'X-CartGain-Timestamp' => (string) $timestamp,
            'X-CartGain-Signature' => cartgain_wc_signature_header(cartgain_wc_hmac_hex($canonical, (string) $secret)),
            'X-CartGain-Platform' => 'woocommerce',
        );
        if ($event_id !== '') {
            $headers['X-CartGain-Event-Id'] = $event_id;
        }
        foreach ($extra_headers as $key => $value) {
            $headers[$key] = (string) $value;
        }

        $args = array(
            'method' => $method,
            'headers' => $headers,
            'body' => $body,
            'timeout' => 15,
            'redirection' => 0,
            'sslverify' => true,
        );

        $response = wp_safe_remote_request($url, $args);
        if (is_wp_error($response)) {
            return new WP_Error('cgw_http_transport', __('Could not reach CartGain.', 'cartgain-woocommerce'));
        }

        $code = (int) wp_remote_retrieve_response_code($response);
        $raw = wp_remote_retrieve_body($response);
        $decoded = json_decode($raw, true);
        if ($code < 200 || $code >= 300) {
            $detail = '';
            if (is_array($decoded)) {
                if (!empty($decoded['error'])) {
                    $detail .= ' ' . sanitize_text_field((string) $decoded['error']);
                }
                if (!empty($decoded['message'])) {
                    $detail .= ' ' . sanitize_text_field((string) $decoded['message']);
                }
            }
            return new WP_Error(
                'cgw_http_status',
                sprintf(__('CartGain returned HTTP %d.', 'cartgain-woocommerce'), $code) . $detail,
                array('status' => $code)
            );
        }

        return array(
            'code' => $code,
            'body' => is_array($decoded) ? $decoded : array(),
        );
    }
}
