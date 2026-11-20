<?php

if (!defined('ABSPATH')) {
    exit;
}

final class CartGain_WC_Credentials
{
    const OPTION_KEY = 'cartgain_wc_connection';

    private $crypto;
    private $http;

    public function __construct($crypto, $http)
    {
        $this->crypto = $crypto;
        $this->http = $http;
    }

    private function decrypt_field($data, $key)
    {
        if (empty($data[$key])) {
            return '';
        }
        $value = $this->crypto->decrypt($data[$key]);
        return is_wp_error($value) ? '' : (string) $value;
    }

    public function get_all()
    {
        $data = get_option(self::OPTION_KEY, array());
        if (!is_array($data) || empty($data['connected'])) {
            return array();
        }
        return array(
            'connected' => true,
            'store_url' => isset($data['store_url']) ? (string) $data['store_url'] : '',
            'connection_id' => $this->decrypt_field($data, 'connection_id_enc'),
            'store_id' => $this->decrypt_field($data, 'store_id_enc'),
            'webhook_secret' => $this->decrypt_field($data, 'webhook_secret_enc'),
            'consumer_key' => $this->decrypt_field($data, 'consumer_key_enc'),
            'consumer_secret' => $this->decrypt_field($data, 'consumer_secret_enc'),
            'connected_at' => isset($data['connected_at']) ? (int) $data['connected_at'] : 0,
            'last_sync' => isset($data['last_sync']) ? (int) $data['last_sync'] : 0,
            'last_sync_status' => isset($data['last_sync_status']) ? sanitize_text_field($data['last_sync_status']) : '',
        );
    }

    public function get_public()
    {
        $data = $this->get_all();
        if (empty($data)) {
            return array(
                'connected' => false,
                'store_url' => home_url('/'),
                'store_id' => '',
                'connection_id_masked' => '',
                'consumer_key_masked' => '',
                'connected_at' => 0,
                'last_sync' => 0,
                'last_sync_status' => '',
                'webhook_secret_configured' => false,
            );
        }
        return array(
            'connected' => true,
            'store_url' => $data['store_url'],
            'store_id' => $data['store_id'],
            'connection_id_masked' => cartgain_wc_mask_secret($data['connection_id']),
            'consumer_key_masked' => cartgain_wc_mask_secret($data['consumer_key']),
            'connected_at' => $data['connected_at'],
            'last_sync' => $data['last_sync'],
            'last_sync_status' => $data['last_sync_status'],
            'webhook_secret_configured' => $data['webhook_secret'] !== '',
        );
    }

    public function is_connected()
    {
        $data = $this->get_all();
        return !empty($data['connection_id']) && !empty($data['store_id']) && !empty($data['webhook_secret']);
    }

    public function signing_secret()
    {
        $data = $this->get_all();
        return isset($data['webhook_secret']) ? $data['webhook_secret'] : '';
    }

    public function connection_headers()
    {
        $data = $this->get_all();
        return array(
            'X-CartGain-Connection-Id' => isset($data['connection_id']) ? $data['connection_id'] : '',
            'X-CartGain-Store-Id' => isset($data['store_id']) ? $data['store_id'] : '',
        );
    }

    public function touch_sync($status, $timestamp = 0)
    {
        $data = get_option(self::OPTION_KEY, array());
        if (!is_array($data) || empty($data['connected'])) {
            return;
        }
        $data['last_sync'] = $timestamp > 0 ? (int) $timestamp : time();
        $data['last_sync_status'] = cartgain_wc_sanitize_error($status);
        update_option(self::OPTION_KEY, $data, false);
    }

    public function install_id()
    {
        $install_id = get_option('cartgain_wc_install_id', '');
        if (!is_string($install_id) || strlen($install_id) < 8) {
            $install_id = 'wcs_' . str_replace('-', '', cartgain_wc_uuid4());
            add_option('cartgain_wc_install_id', $install_id, '', false);
        }
        return $install_id;
    }

    private function derivation_secret($code, $install_id, $store_url, $consumer_secret)
    {
        return hash_hmac('sha256', 'cartgain|' . $code . '|' . $install_id . '|' . $store_url, $consumer_secret);
    }

    public function connect($connection_code, $store_url, $consumer_key, $consumer_secret)
    {
        $connection_code = trim((string) $connection_code);
        $consumer_key = trim((string) $consumer_key);
        $consumer_secret = trim((string) $consumer_secret);
        $store_url = cartgain_wc_normalize_store_url($store_url);

        if (strlen($connection_code) < 20 || strlen($connection_code) > 200) {
            return new WP_Error('cgw_bad_code', __('Enter a valid CartGain connection code.', 'cartgain-woocommerce'));
        }
        if ($store_url === '') {
            return new WP_Error('cgw_bad_url', __('Store URL must be a public HTTPS URL without credentials or a query string.', 'cartgain-woocommerce'));
        }
        if (strlen($consumer_key) < 10 || strlen($consumer_key) > 500 || strlen($consumer_secret) < 10 || strlen($consumer_secret) > 500) {
            return new WP_Error('cgw_bad_keys', __('Enter a valid WooCommerce Consumer Key and Consumer Secret.', 'cartgain-woocommerce'));
        }
        if (!$this->crypto->is_available()) {
            return new WP_Error('cgw_crypto_unavailable', __('Credentials cannot be encrypted on this server. Enable OpenSSL.', 'cartgain-woocommerce'));
        }

        $install_id = $this->install_id();
        $proof = hash('sha256', $connection_code . '|' . $install_id . '|' . $store_url);
        $payload = array(
            'code' => $connection_code,
            'storeUrl' => $store_url,
            'storeName' => sanitize_text_field(get_bloginfo('name')),
            'currency' => function_exists('get_woocommerce_currency') ? get_woocommerce_currency() : 'USD',
            'timezone' => sanitize_text_field(wp_timezone_string()),
            'installId' => $install_id,
            'proof' => $proof,
            'consumerKey' => $consumer_key,
            'consumerSecret' => $consumer_secret,
            'webhookUrl' => esc_url_raw(rest_url('cartgain/v1/health')),
        );
        $headers = array(
            'X-CartGain-Connection-Code' => $connection_code,
            'X-CartGain-Install-Id' => $install_id,
        );

        $response = $this->http->request('POST', 'api/integrations/woocommerce/exchange', $payload, $connection_code, $headers);
        if (is_wp_error($response)) {
            return $response;
        }

        $body = isset($response['body']) && is_array($response['body']) ? $response['body'] : array();
        $connection_id = $this->pick_field($body, array('connectionId', 'connection_id'));
        $store_id = $this->pick_field($body, array('storeId', 'store_id'));
        $webhook_secret = $this->pick_field($body, array('webhookSecret', 'webhook_secret'));
        if ($webhook_secret === '') {
            $webhook_secret = $this->derivation_secret($connection_code, $install_id, $store_url, $consumer_secret);
        }
        if ($connection_id === '' || $store_id === '' || $webhook_secret === '') {
            return new WP_Error('cgw_exchange_response', __('CartGain did not return valid connection details.', 'cartgain-woocommerce'));
        }

        $fields = array(
            'connection_id_enc' => $this->crypto->encrypt($connection_id),
            'store_id_enc' => $this->crypto->encrypt($store_id),
            'webhook_secret_enc' => $this->crypto->encrypt($webhook_secret),
            'consumer_key_enc' => $this->crypto->encrypt($consumer_key),
            'consumer_secret_enc' => $this->crypto->encrypt($consumer_secret),
        );
        foreach ($fields as $encrypted) {
            if (is_wp_error($encrypted)) {
                return $encrypted;
            }
        }

        update_option(self::OPTION_KEY, array_merge($fields, array(
            'connected' => 1,
            'store_url' => $store_url,
            'install_id' => $install_id,
            'connected_at' => time(),
            'last_sync' => 0,
            'last_sync_status' => 'connected',
        )), false);

        delete_transient('cartgain_wc_recovery_status');
        return true;
    }

    public function disconnect()
    {
        $data = $this->get_all();
        $remote_error = '';
        if (!empty($data['connection_id'])) {
            $payload = array(
                'connectionId' => $data['connection_id'],
                'storeId' => $data['store_id'],
                'platform' => 'woocommerce',
            );
            $response = $this->http->request(
                'POST',
                'api/integrations/woocommerce/disconnect',
                $payload,
                $data['webhook_secret'],
                $this->connection_headers()
            );
            if (is_wp_error($response)) {
                $remote_error = cartgain_wc_sanitize_error($response->get_error_message());
            }
        }

        delete_option(self::OPTION_KEY);
        delete_transient('cartgain_wc_recovery_status');

        if ($remote_error !== '') {
            return new WP_Error('cgw_disconnect_remote', sprintf(__('Disconnected locally. CartGain reported: %s', 'cartgain-woocommerce'), $remote_error));
        }
        return true;
    }

    public function recovery_status()
    {
        $status = get_transient('cartgain_wc_recovery_status');
        if (is_array($status)) {
            return $status;
        }
        if (!$this->is_connected()) {
            return new WP_Error('cgw_not_connected', __('Connect CartGain to view recovery status.', 'cartgain-woocommerce'));
        }
        $response = $this->http->request(
            'GET',
            'api/integrations/woocommerce/status',
            null,
            $this->signing_secret(),
            $this->connection_headers()
        );
        if (is_wp_error($response)) {
            return $response;
        }
        $status = isset($response['body']) && is_array($response['body']) ? $response['body'] : array();
        set_transient('cartgain_wc_recovery_status', $status, 5 * MINUTE_IN_SECONDS);
        return $status;
    }

    private function pick_field($data, $keys)
    {
        foreach ($keys as $key) {
            if (isset($data[$key]) && is_scalar($data[$key]) && trim((string) $data[$key]) !== '') {
                return trim((string) $data[$key]);
            }
        }
        return '';
    }

    public static function remove_all()
    {
        delete_option(self::OPTION_KEY);
        delete_option('cartgain_wc_install_id');
        delete_transient('cartgain_wc_recovery_status');
    }
}
