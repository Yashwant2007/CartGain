<?php

if (!defined('ABSPATH')) {
    exit;
}

function cartgain_wc_uuid4()
{
    try {
        $bytes = random_bytes(16);
    } catch (Exception $e) {
        $bytes = wp_generate_password(16, true, true);
        $bytes = substr($bytes, 0, 16);
    }
    $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($bytes), 4));
}

function cartgain_wc_client_ip()
{
    $ip = isset($_SERVER['REMOTE_ADDR']) ? sanitize_text_field(wp_unslash($_SERVER['REMOTE_ADDR'])) : '';
    return $ip;
}

function cartgain_wc_rate_limit($action, $limit, $window)
{
    $limit = max(1, (int) $limit);
    $window = max(1, (int) $window);
    $bucket = (int) floor(time() / $window);
    $key = 'cgw_rl_' . md5($action . '|' . cartgain_wc_client_ip() . '|' . $bucket);
    $count = (int) get_transient($key);
    if ($count >= $limit) {
        return false;
    }
    set_transient($key, $count + 1, $window);
    return true;
}

function cartgain_wc_json_encode($data)
{
    return wp_json_encode($data, JSON_UNESCAPED_SLASHES);
}

function cartgain_wc_sanitize_error($message)
{
    $message = is_string($message) ? $message : '';
    $message = preg_replace('/[\r\n\t]+/', ' ', $message);
    $message = preg_replace('/\s+/', ' ', $message);
    return substr(sanitize_text_field($message), 0, 180);
}

function cartgain_wc_is_https_url($url)
{
    if (!is_string($url) || $url === '') {
        return false;
    }
    return strpos($url, 'https://') === 0;
}

function cartgain_wc_normalize_store_url($url)
{
    $parts = wp_parse_url(trim((string) $url));
    if (!is_array($parts) || !isset($parts['scheme'], $parts['host'])) {
        return '';
    }
    if (strtolower($parts['scheme']) !== 'https' || (isset($parts['port']) && (int) $parts['port'] !== 443)) {
        return '';
    }
    if (isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment'])) {
        return '';
    }
    $host = strtolower(rtrim((string) $parts['host'], '.'));
    if ($host === '' || strpos($host, '.') === false) {
        return '';
    }
    $blocked = array('localhost', 'metadata', 'metadata.google.internal', 'instance-data');
    if (in_array($host, $blocked, true)) {
        return '';
    }
    foreach (array('.local', '.internal', '.localhost', '.test', '.invalid') as $suffix) {
        if (substr($host, -strlen($suffix)) === $suffix) {
            return '';
        }
    }
    if (filter_var($host, FILTER_VALIDATE_IP) && !filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
        return '';
    }
    $path = isset($parts['path']) ? rtrim((string) $parts['path'], '/') : '';
    return 'https://' . $host . $path;
}

function cartgain_wc_mask_secret($plain)
{
    if (!is_string($plain) || $plain === '') {
        return '';
    }
    $tail = substr($plain, -4);
    return str_repeat("\xe2\x80\xa2", 8) . $tail;
}

function cartgain_wc_to_bool($value)
{
    if (is_bool($value)) {
        return $value;
    }
    return in_array($value, array('yes', '1', 1, true, 'true', 'on'), true);
}

function cartgain_wc_default_settings()
{
    return array(
        'cart_tracking' => 'yes',
        'product_sync' => 'yes',
        'order_tracking' => 'yes',
        'bargain_enabled' => 'no',
        'bargain_auto_product' => 'no',
        'consent_email_enabled' => 'yes',
        'consent_whatsapp_enabled' => 'no',
        'abandonment_enabled' => 'no',
        'inactivity_minutes' => 60,
        'recovery_status' => 'yes',
    );
}

function cartgain_wc_get_settings()
{
    $saved = get_option('cartgain_wc_settings', array());
    if (!is_array($saved)) {
        $saved = array();
    }
    return array_merge(cartgain_wc_default_settings(), $saved);
}

function cartgain_wc_setting($key)
{
    $settings = cartgain_wc_get_settings();
    return isset($settings[$key]) ? $settings[$key] : null;
}

function sanitize_hex_hash($value)
{
    return preg_replace('/[^a-f0-9]/', '', strtolower((string) $value));
}

function cartgain_wc_hmac_hex($canonical, $secret)
{
    return hash_hmac('sha256', $canonical, $secret);
}

function cartgain_wc_signature_header($hex)
{
    return 'sha256=' . $hex;
}

function cartgain_wc_parse_signature($header)
{
    if (!is_string($header)) {
        return '';
    }
    if (strpos($header, 'sha256=') === 0) {
        $header = substr($header, 7);
    }
    return preg_match('/^[a-f0-9]{64}$/i', $header) ? strtolower($header) : '';
}

function cartgain_wc_optout_token($action, $channel)
{
    return hash_hmac('sha256', 'cartgain-optout|' . $action . '|' . $channel, wp_salt('auth'));
}

function cartgain_wc_hmac_matches($expected_hex, $header, $timestamp, $max_age = 300)
{
    $provided = cartgain_wc_parse_signature($header);
    $timestamp = (int) $timestamp;
    if ($provided === '' || $timestamp <= 0 || abs(time() - $timestamp) > (int) $max_age) {
        return false;
    }
    return hash_equals(strtolower($expected_hex), $provided);
}

function cartgain_wc_signed_request_valid($request, $secret, $store_id = '')
{
    if (!is_object($request) || !method_exists($request, 'get_header')) {
        return false;
    }
    $secret = (string) $secret;
    if ($secret === '') {
        return false;
    }
    $timestamp = (string) $request->get_header('X-CartGain-Timestamp');
    $signature = (string) $request->get_header('X-CartGain-Signature');
    if ($store_id !== '') {
        $header = (string) $request->get_header('X-CartGain-Store-Id');
        if ($header !== '' && $header !== (string) $store_id) {
            return false;
        }
    }
    $canonical = $timestamp . '.' . $request->get_body();
    return cartgain_wc_hmac_matches(cartgain_wc_hmac_hex($canonical, $secret), $signature, $timestamp);
}
