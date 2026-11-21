<?php

if (!defined('ABSPATH')) {
    exit;
}

final class CartGain_WC_Checkout_Links
{
    public function __construct()
    {
        add_action('template_redirect', array($this, 'apply_bargain_checkout_link'), 5);
    }

    public function apply_bargain_checkout_link()
    {
        if (is_admin() || (function_exists('wp_doing_ajax') && wp_doing_ajax())) {
            return;
        }
        if (!function_exists('WC') || !WC() || !WC()->cart) {
            return;
        }
        if (!isset($_GET['coupon_code']) && !isset($_GET['product_id'])) {
            return;
        }

        $code = isset($_GET['coupon_code']) ? sanitize_text_field(wp_unslash($_GET['coupon_code'])) : '';
        $product_id = isset($_GET['product_id']) ? absint(wp_unslash($_GET['product_id'])) : 0;

        if ($product_id > 0 && function_exists('wc_get_product')) {
            $product = wc_get_product($product_id);
            if (is_object($product) && method_exists($product, 'is_purchasable') && $product->is_purchasable()) {
                $in_cart = false;
                foreach (WC()->cart->get_cart() as $item) {
                    $item_product = isset($item['product_id']) ? (int) $item['product_id'] : 0;
                    $item_variation = isset($item['variation_id']) ? (int) $item['variation_id'] : 0;
                    if ($item_product === $product_id || $item_variation === $product_id) {
                        $in_cart = true;
                        break;
                    }
                }
                if (!$in_cart) {
                    $add_id = $product_id;
                    if (method_exists($product, 'is_type') && $product->is_type('variable')) {
                        $add_id = 0;
                        foreach ($product->get_children() as $child_id) {
                            $variation = wc_get_product($child_id);
                            if (
                                is_object($variation) &&
                                method_exists($variation, 'is_purchasable') &&
                                $variation->is_purchasable() &&
                                (!method_exists($variation, 'is_in_stock') || $variation->is_in_stock())
                            ) {
                                $add_id = (int) $child_id;
                                break;
                            }
                        }
                    }
                    if ($add_id > 0) {
                        WC()->cart->add_to_cart($add_id, 1);
                    }
                }
            }
        }

        WC()->cart->calculate_totals();

        if ($code !== '') {
            $has_discount = method_exists(WC()->cart, 'has_discount') && WC()->cart->has_discount($code);
            if (!$has_discount) {
                if (method_exists(WC()->cart, 'apply_coupon')) {
                    WC()->cart->apply_coupon($code);
                } elseif (method_exists(WC()->cart, 'add_discount')) {
                    WC()->cart->add_discount($code);
                }
            }
        }

        $checkout_url = function_exists('wc_get_checkout_url') ? wc_get_checkout_url() : home_url('/');
        wp_safe_redirect($checkout_url);
        exit;
    }
}
