<?php

if (!defined('ABSPATH')) {
    exit;
}

final class CartGain_WC_Bargain
{
    private $credentials;
    private $localized = false;
    private $rendered = false;

    public function __construct($credentials)
    {
        $this->credentials = $credentials;
        add_shortcode('cartgain_bargain', array($this, 'render'));
        if (cartgain_wc_to_bool(cartgain_wc_setting('bargain_auto_product'))) {
            add_action('woocommerce_single_product_summary', array($this, 'auto_render'), 40);
            add_action('wp_footer', array($this, 'footer_render'), 30);
        }
    }

    public function auto_render()
    {
        if (!function_exists('is_product') || !is_product()) {
            return;
        }
        echo $this->render(array());
    }

    public function footer_render()
    {
        if ($this->rendered || !function_exists('is_product') || !is_product()) {
            return;
        }
        echo $this->render(array());
    }

    public function render($atts)
    {
        if (!$this->credentials->is_connected() || !cartgain_wc_to_bool(cartgain_wc_setting('bargain_enabled'))) {
            return '';
        }
        $atts = shortcode_atts(array(
            'product_id' => 0,
            'variation_id' => 0,
        ), (array) $atts, 'cartgain_bargain');

        $product_id = (int) $atts['product_id'];
        $variation_id = (int) $atts['variation_id'];
        $product = null;
        if ($product_id > 0) {
            $product = wc_get_product($product_id);
        } elseif (function_exists('is_product') && is_product()) {
            $product = wc_get_product(get_the_ID());
        } elseif (isset($GLOBALS['product']) && is_object($GLOBALS['product'])) {
            $product = $GLOBALS['product'];
        }
        if (!$product || !is_object($product) || !method_exists($product, 'get_id')) {
            return '';
        }
        if ($variation_id <= 0 && method_exists($product, 'get_id')) {
            $is_variable = method_exists($product, 'is_type') && $product->is_type('variable');
            if (!$is_variable) {
                $variation_id = (int) $product->get_id();
            }
        }

        $public = $this->credentials->get_public();
        $args = array(
            'platform' => 'woocommerce',
            'storeId' => $public['store_id'],
            'productId' => (int) $product->get_id(),
            'variationId' => $variation_id,
            'title' => method_exists($product, 'get_name') ? sanitize_text_field($product->get_name()) : '',
            'price' => method_exists($product, 'get_price') ? (string) $product->get_price() : '',
            'currency' => function_exists('get_woocommerce_currency') ? get_woocommerce_currency() : 'USD',
            'image' => $this->product_image($product),
            'cartToken' => $this->cart_token(),
        );
        $iframe_url = add_query_arg($args, CGW_API_BASE . '/bargain/embed');

        $this->enqueue_assets();

        $html = '<div class="cartgain-bargain" data-cartgain-bargain="1" data-cartgain-product="' . esc_attr((string) (int) $product->get_id()) . '" data-cartgain-variation="' . esc_attr((string) $variation_id) . '">';
        $html .= '<iframe class="cartgain-bargain__frame" title="' . esc_attr__('CartGain bargain', 'cartgain-woocommerce') . '" src="' . esc_url($iframe_url) . '" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="forms" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"></iframe>';
        $html .= '</div>';
        $this->rendered = true;
        return $html;
    }

    private function product_image($product)
    {
        $image = '';
        if (method_exists($product, 'get_image_id')) {
            $url = wp_get_attachment_url((int) $product->get_image_id());
            if ($url) {
                $image = esc_url_raw($url);
            }
        }
        if ($image === '' && function_exists('wc_placeholder_img_src')) {
            $image = esc_url_raw(wc_placeholder_img_src());
        }
        return $image;
    }

    private function cart_token()
    {
        if (function_exists('wc_load_cart') && (!isset(WC()->session) || !WC()->session)) {
            wc_load_cart();
        }
        if (!isset(WC()->session) || !WC()->session) {
            return '';
        }
        return substr((string) WC()->session->get_customer_id(), 0, 190);
    }

    private function enqueue_assets()
    {
        wp_enqueue_style('cartgain-wc-bargain', CGW_PLUGIN_URL . 'assets/css/bargain.css', array(), CGW_VERSION);
        wp_enqueue_script('cartgain-wc-bargain-js', CGW_PLUGIN_URL . 'assets/js/bargain.js', array(), CGW_VERSION, true);
        if (!$this->localized) {
            $data = array(
                'apiBase' => CGW_API_BASE,
                'storeId' => $this->credentials->get_public()['store_id'],
            );
            wp_add_inline_script('cartgain-wc-bargain-js', 'window.cartgainBargain=' . cartgain_wc_json_encode($data) . ';', 'before');
            $this->localized = true;
        }
    }
}
