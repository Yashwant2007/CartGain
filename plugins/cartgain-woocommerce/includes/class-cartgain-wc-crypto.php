<?php

if (!defined('ABSPATH')) {
    exit;
}

final class CartGain_WC_Crypto
{
    private $algorithm = 'aes-256-cbc';
    private $prefix = 'cgw1';

    public function is_available()
    {
        return function_exists('openssl_encrypt') && function_exists('openssl_decrypt') && in_array($this->algorithm, openssl_get_cipher_methods(), true);
    }

    private function keys()
    {
        $material = wp_salt('auth') . wp_salt('secure_auth') . wp_salt('logged_in');
        return array(
            hash_hmac('sha256', 'cartgain-woocommerce:v1:enc', $material),
            hash_hmac('sha256', 'cartgain-woocommerce:v1:mac', $material),
        );
    }

    public function encrypt($plaintext)
    {
        if (!$this->is_available()) {
            return new WP_Error('cgw_crypto_unavailable', __('OpenSSL AES-256 is not available on this server.', 'cartgain-woocommerce'));
        }
        if (!is_string($plaintext) || $plaintext === '') {
            return '';
        }
        $keys = $this->keys();
        $iv = openssl_random_pseudo_bytes(16);
        if (!is_string($iv) || strlen($iv) !== 16) {
            return new WP_Error('cgw_crypto_iv', __('Could not generate a secure encryption IV.', 'cartgain-woocommerce'));
        }
        $ciphertext = openssl_encrypt($plaintext, $this->algorithm, $keys[0], OPENSSL_RAW_DATA, $iv);
        if ($ciphertext === false) {
            return new WP_Error('cgw_crypto_encrypt', __('Encryption failed.', 'cartgain-woocommerce'));
        }
        $iv_part = base64_encode($iv);
        $cipher_part = base64_encode($ciphertext);
        $mac = base64_encode(hash_hmac('sha256', $iv_part . '.' . $cipher_part, $keys[1], true));
        return implode('.', array($this->prefix, $iv_part, $cipher_part, $mac));
    }

    public function decrypt($payload)
    {
        if (!is_string($payload) || $payload === '') {
            return '';
        }
        if (!$this->is_available()) {
            return new WP_Error('cgw_crypto_unavailable', __('OpenSSL AES-256 is not available on this server.', 'cartgain-woocommerce'));
        }
        $parts = explode('.', $payload);
        if (count($parts) !== 4 || $parts[0] !== $this->prefix) {
            return new WP_Error('cgw_crypto_format', __('Stored credentials are invalid.', 'cartgain-woocommerce'));
        }
        $keys = $this->keys();
        $expected = base64_encode(hash_hmac('sha256', $parts[1] . '.' . $parts[2], $keys[1], true));
        if (!hash_equals($expected, $parts[3])) {
            return new WP_Error('cgw_crypto_mac', __('Stored credentials failed integrity verification.', 'cartgain-woocommerce'));
        }
        $iv = base64_decode($parts[1], true);
        $ciphertext = base64_decode($parts[2], true);
        if ($iv === false || $ciphertext === false || strlen($iv) !== 16) {
            return new WP_Error('cgw_crypto_decode', __('Stored credentials are invalid.', 'cartgain-woocommerce'));
        }
        $plaintext = openssl_decrypt($ciphertext, $this->algorithm, $keys[0], OPENSSL_RAW_DATA, $iv);
        if ($plaintext === false) {
            return new WP_Error('cgw_crypto_decrypt', __('Stored credentials could not be decrypted.', 'cartgain-woocommerce'));
        }
        return $plaintext;
    }
}
