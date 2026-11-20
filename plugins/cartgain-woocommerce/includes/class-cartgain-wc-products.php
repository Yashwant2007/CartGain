<?php

if (!defined('ABSPATH')) {
    exit;
}

final class CartGain_WC_Products
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
        add_action('cartgain_wc_sync_product', array($this, 'sync_product'));
        add_action('cartgain_wc_full_sync', array($this, 'full_sync'));
        if (!cartgain_wc_to_bool(cartgain_wc_setting('product_sync'))) {
            return;
        }
        add_action('woocommerce_new_product', array($this, 'schedule_product'));
        add_action('woocommerce_update_product', array($this, 'schedule_product'));
        add_action('woocommerce_delete_product', array($this, 'product_deleted'));
        add_action('woocommerce_new_product_variation', array($this, 'schedule_variation'));
        add_action('woocommerce_update_product_variation', array($this, 'schedule_variation'));
        add_action('woocommerce_delete_product_variation', array($this, 'variation_deleted'));
    }

    public function schedule_product($product_id)
    {
        $product_id = (int) $product_id;
        if ($product_id <= 0) {
            return;
        }
        $this->scheduler->schedule_single('cartgain_wc_sync_product', array('id' => $product_id), 10);
    }

    public function schedule_variation($variation_id)
    {
        $variation = wc_get_product((int) $variation_id);
        if (!$variation || !method_exists($variation, 'get_parent_id')) {
            return;
        }
        $parent_id = (int) $variation->get_parent_id();
        if ($parent_id > 0) {
            $this->schedule_product($parent_id);
        }
    }

    public function sync_product($product_id)
    {
        $product_id = (int) $product_id;
        $product = $product_id > 0 ? wc_get_product($product_id) : null;
        if (!$product) {
            return false;
        }
        $payload = array('products' => array($this->build_product($product)));
        $modified = method_exists($product, 'get_date_modified') && $product->get_date_modified() ? (int) $product->get_date_modified()->getTimestamp() : time();
        $result = $this->queue->enqueue(
            'product_sync',
            $payload,
            'product_' . $product_id . '_' . $modified,
            'api/integrations/woocommerce/sync/products'
        );
        if ($result) {
            $this->credentials->touch_sync('product_synced', time());
        }
        return $result;
    }

    public function product_deleted($product_id)
    {
        return $this->queue->enqueue(
            'product_deleted',
            array('products' => array(array('id' => (int) $product_id, 'status' => 'trash'))),
            'product_delete_' . (int) $product_id,
            'api/integrations/woocommerce/sync/products'
        );
    }

    public function variation_deleted($variation_id)
    {
        return $this->queue->enqueue(
            'product_deleted',
            array('products' => array(array('id' => (int) $variation_id, 'status' => 'trash'))),
            'variation_delete_' . (int) $variation_id,
            'api/integrations/woocommerce/sync/products'
        );
    }

    public function schedule_full_sync()
    {
        return $this->scheduler->schedule_single('cartgain_wc_full_sync', array('offset' => 0), 5);
    }

    public function full_sync($offset = 0)
    {
        if (!$this->credentials->is_connected()) {
            return 0;
        }
        $offset = max(0, (int) $offset);
        $limit = 50;
        $products = wc_get_products(array(
            'limit' => $limit,
            'offset' => $offset,
            'orderby' => 'ID',
            'order' => 'ASC',
            'status' => array('publish', 'draft', 'private'),
            'type' => array('simple', 'variable', 'grouped', 'external'),
        ));
        if (empty($products)) {
            $this->credentials->touch_sync('full_sync_complete', time());
            return 0;
        }
        $payload = array('products' => array());
        foreach ($products as $product) {
            if (is_object($product) && method_exists($product, 'get_id')) {
                $payload['products'][] = $this->build_product($product);
            }
        }
        $result = $this->queue->enqueue(
            'product_sync',
            $payload,
            'full_sync_' . $offset . '_' . count($payload['products']),
            'api/integrations/woocommerce/sync/products'
        );
        if ($result) {
            $this->credentials->touch_sync('full_sync_batch_queued', time());
        }
        if (count($products) === $limit) {
            $this->scheduler->schedule_single('cartgain_wc_full_sync', array('offset' => $offset + $limit), 5);
        }
        return count($payload['products']);
    }

    private function build_product($product)
    {
        $id = method_exists($product, 'get_id') ? (int) $product->get_id() : 0;
        $images = array();
        if (method_exists($product, 'get_image_id')) {
            $image_id = (int) $product->get_image_id();
            if ($image_id > 0) {
                $url = wp_get_attachment_url($image_id);
                if ($url) {
                    $images[] = array('id' => $image_id, 'src' => esc_url_raw($url), 'role' => 'main');
                }
            }
        }
        if (method_exists($product, 'get_gallery_image_ids')) {
            foreach (array_slice($product->get_gallery_image_ids(), 0, 8) as $gallery_id) {
                $url = wp_get_attachment_url((int) $gallery_id);
                if ($url) {
                    $images[] = array('id' => (int) $gallery_id, 'src' => esc_url_raw($url), 'role' => 'gallery');
                }
            }
        }

        $categories = array();
        if ($id > 0) {
            $terms = wp_get_post_terms($id, 'product_cat', array('fields' => 'all'));
            if (!is_wp_error($terms)) {
                foreach ($terms as $term) {
                    $categories[] = array('id' => (int) $term->term_id, 'name' => sanitize_text_field($term->name), 'slug' => sanitize_key($term->slug));
                }
            }
        }

        $data = array(
            'id' => $id,
            'name' => method_exists($product, 'get_name') ? sanitize_text_field($product->get_name()) : '',
            'description' => method_exists($product, 'get_description') ? wp_strip_all_tags($product->get_description()) : '',
            'shortDescription' => method_exists($product, 'get_short_description') ? wp_strip_all_tags($product->get_short_description()) : '',
            'sku' => method_exists($product, 'get_sku') ? sanitize_text_field($product->get_sku()) : '',
            'status' => method_exists($product, 'get_status') ? sanitize_key($product->get_status()) : '',
            'type' => method_exists($product, 'get_type') ? sanitize_key($product->get_type()) : '',
            'permalink' => method_exists($product, 'get_permalink') ? esc_url_raw($product->get_permalink()) : '',
            'prices' => array(
                'price' => method_exists($product, 'get_price') ? (string) $product->get_price() : '0',
                'regularPrice' => method_exists($product, 'get_regular_price') ? (string) $product->get_regular_price() : '0',
                'salePrice' => method_exists($product, 'get_sale_price') ? (string) $product->get_sale_price() : '',
                'currency' => function_exists('get_woocommerce_currency') ? get_woocommerce_currency() : 'USD',
            ),
            'inventory' => array(
                'manageStock' => method_exists($product, 'get_manage_stock') ? (bool) $product->get_manage_stock() : false,
                'stockQuantity' => method_exists($product, 'get_stock_quantity') ? $product->get_stock_quantity() : null,
                'stockStatus' => method_exists($product, 'get_stock_status') ? sanitize_key($product->get_stock_status()) : '',
                'backorders' => method_exists($product, 'get_backorders') ? sanitize_key($product->get_backorders()) : '',
            ),
            'images' => $images,
            'categories' => $categories,
            'attributes' => $this->build_attributes($product),
            'variations' => array(),
            'updatedAt' => method_exists($product, 'get_date_modified') && $product->get_date_modified() ? $product->get_date_modified()->date('c') : gmdate('c'),
        );

        if (method_exists($product, 'is_type') && $product->is_type('variable')) {
            $children = method_exists($product, 'get_children') ? $product->get_children() : array();
            foreach (array_slice($children, 0, 250) as $child_id) {
                $child = wc_get_product((int) $child_id);
                if (is_object($child)) {
                    $data['variations'][] = $this->build_variation($child);
                }
            }
        }
        return $data;
    }

    private function build_variation($variation)
    {
        $image_id = method_exists($variation, 'get_image_id') ? (int) $variation->get_image_id() : 0;
        $image_url = $image_id > 0 ? wp_get_attachment_url($image_id) : '';
        return array(
            'id' => method_exists($variation, 'get_id') ? (int) $variation->get_id() : 0,
            'parentId' => method_exists($variation, 'get_parent_id') ? (int) $variation->get_parent_id() : 0,
            'sku' => method_exists($variation, 'get_sku') ? sanitize_text_field($variation->get_sku()) : '',
            'status' => method_exists($variation, 'get_status') ? sanitize_key($variation->get_status()) : '',
            'prices' => array(
                'price' => method_exists($variation, 'get_price') ? (string) $variation->get_price() : '0',
                'regularPrice' => method_exists($variation, 'get_regular_price') ? (string) $variation->get_regular_price() : '0',
                'salePrice' => method_exists($variation, 'get_sale_price') ? (string) $variation->get_sale_price() : '',
                'currency' => function_exists('get_woocommerce_currency') ? get_woocommerce_currency() : 'USD',
            ),
            'inventory' => array(
                'manageStock' => method_exists($variation, 'get_manage_stock') ? (bool) $variation->get_manage_stock() : false,
                'stockQuantity' => method_exists($variation, 'get_stock_quantity') ? $variation->get_stock_quantity() : null,
                'stockStatus' => method_exists($variation, 'get_stock_status') ? sanitize_key($variation->get_stock_status()) : '',
            ),
            'image' => $image_url ? esc_url_raw($image_url) : '',
            'attributes' => $this->build_attributes($variation),
        );
    }

    private function build_attributes($product)
    {
        $attributes = array();
        if (!method_exists($product, 'get_attributes') || !is_array($product->get_attributes())) {
            return $attributes;
        }
        foreach ($product->get_attributes() as $taxonomy => $attribute) {
            if (is_object($attribute) && method_exists($attribute, 'get_options')) {
                $options = $attribute->get_options();
                $attributes[] = array(
                    'key' => sanitize_key((string) $taxonomy),
                    'name' => method_exists($attribute, 'get_name') ? sanitize_text_field($attribute->get_name()) : sanitize_text_field((string) $taxonomy),
                    'values' => array_values(array_map('strval', array_slice((array) $options, 0, 50))),
                    'visible' => method_exists($attribute, 'get_visible') ? (bool) $attribute->get_visible() : true,
                );
            } elseif (is_scalar($attribute)) {
                $attributes[] = array(
                    'key' => sanitize_key((string) $taxonomy),
                    'name' => sanitize_text_field((string) $taxonomy),
                    'values' => array(sanitize_text_field((string) $attribute)),
                    'visible' => true,
                );
            }
        }
        return $attributes;
    }
}
