<?php

if (!defined('ABSPATH')) {
    exit;
}

final class CartGain_WC_Public
{
    public function hooks()
    {
        add_action('wp_enqueue_scripts', array($this, 'register_assets'));
        add_shortcode('cartgain_consent', array($this, 'render_consent'));
        add_action('template_redirect', array($this, 'maybe_optout'));
    }

    public function register_assets()
    {
        wp_register_script(
            'cartgain-wc-store-api',
            CGW_PLUGIN_URL . 'assets/js/store-api.js',
            array(),
            CGW_VERSION,
            true
        );
        wp_localize_script('cartgain-wc-store-api', 'cartgainWC', array(
            'restUrl' => esc_url_raw(rest_url('cartgain/v1')),
            'nonce' => wp_create_nonce('cartgain_wc_public'),
            'isCheckout' => function_exists('is_checkout') && is_checkout() ? true : false,
            'cartEnabled' => cartgain_wc_to_bool(cartgain_wc_setting('cart_tracking')),
            'consentEmail' => cartgain_wc_to_bool(cartgain_wc_setting('consent_email_enabled')),
            'consentWhatsapp' => cartgain_wc_to_bool(cartgain_wc_setting('consent_whatsapp_enabled')),
        ));

        if ((function_exists('is_cart') && is_cart()) || (function_exists('is_checkout') && is_checkout())) {
            wp_enqueue_script('cartgain-wc-store-api');
        }
    }

    public function render_consent($atts = array(), $content = '')
    {
        $atts = shortcode_atts(array('source' => 'shortcode'), (array) $atts, 'cartgain_consent');
        $source = in_array($atts['source'], array('shortcode', 'checkout', 'store_api'), true) ? $atts['source'] : 'shortcode';
        $email = cartgain_wc_to_bool(cartgain_wc_setting('consent_email_enabled'));
        $whatsapp = cartgain_wc_to_bool(cartgain_wc_setting('consent_whatsapp_enabled'));
        if (!$email && !$whatsapp) {
            return '';
        }
        wp_enqueue_script('cartgain-wc-store-api');
        wp_enqueue_style('cartgain-wc-consent', CGW_PLUGIN_URL . 'assets/css/bargain.css', array(), CGW_VERSION);

        $html = '<fieldset class="cartgain-consent" data-cartgain-consent-box="1" data-cartgain-source="' . esc_attr($source) . '">';
        $html .= '<legend>' . esc_html__('Reminder preferences', 'cartgain-woocommerce') . '</legend>';
        if ($email) {
            $html .= '<label class="cartgain-consent__row"><input type="checkbox" data-cartgain-consent="email" /> ' . esc_html__('Email me a link to finish my cart later', 'cartgain-woocommerce') . '</label>';
        }
        if ($whatsapp) {
            $html .= '<label class="cartgain-consent__row"><input type="checkbox" data-cartgain-consent="whatsapp" /> ' . esc_html__('Message me on WhatsApp about my cart', 'cartgain-woocommerce') . '</label>';
            $html .= '<label class="cartgain-consent__row">' . esc_html__('WhatsApp number', 'cartgain-woocommerce') . ' <input type="tel" data-cartgain-whatsapp-phone="1" maxlength="20" /></label>';
        }
        $html .= '<p class="cartgain-consent__help">' . esc_html__('Each channel is optional. You can opt out at any time.', 'cartgain-woocommerce') . '</p>';
        $html .= '</fieldset>';
        return $html;
    }

    public function maybe_optout()
    {
        if (is_admin() || !isset($_GET['cartgain_optout'])) {
            return;
        }
        $channel = sanitize_key(wp_unslash($_GET['cartgain_optout']));
        if (!in_array($channel, array('email', 'whatsapp', 'all'), true)) {
            return;
        }
        $token = isset($_GET['cgw_token']) ? (string) wp_unslash($_GET['cgw_token']) : '';
        if (!hash_equals(cartgain_wc_optout_token('optout', $channel), $token)) {
            return;
        }
        $plugin = cartgain_wc();
        if ($plugin->tracking) {
            $plugin->tracking->set_consent(array(
                'email' => $channel === 'whatsapp' ? null : false,
                'whatsapp' => $channel === 'email' ? null : false,
            ), 'optout_link');
        }
        if (function_exists('wc_add_notice')) {
            wc_add_notice(__('Your CartGain reminder preferences were updated.', 'cartgain-woocommerce'), 'notice');
        }
        wp_safe_redirect(remove_query_arg(array('cartgain_optout', 'cgw_token')));
        exit;
    }
}
