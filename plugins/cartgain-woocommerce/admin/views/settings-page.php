<?php

if (!defined('ABSPATH')) {
    exit;
}
?>
<div class="wrap cgw-wrap">
    <h1 class="cgw-title">
        <?php esc_html_e('CartGain', 'cartgain-woocommerce'); ?>
        <span class="cgw-version"><?php echo esc_html('v' . CGW_VERSION); ?></span>
    </h1>
    <p class="cgw-subtitle"><?php esc_html_e('Connect your WooCommerce store to CartGain cart recovery and the bargain widget.', 'cartgain-woocommerce'); ?></p>

    <nav class="cgw-tabs" aria-label="<?php esc_attr_e('CartGain settings sections', 'cartgain-woocommerce'); ?>">
        <?php
        $tabs = array(
            'connection' => __('Connection', 'cartgain-woocommerce'),
            'tracking' => __('Tracking &amp; consent', 'cartgain-woocommerce'),
            'products' => __('Products &amp; bargain', 'cartgain-woocommerce'),
            'troubleshooting' => __('Troubleshooting', 'cartgain-woocommerce'),
        );
        foreach ($tabs as $key => $label) {
            $url = add_query_arg(array('page' => 'cartgain', 'tab' => $key), admin_url('admin.php'));
            echo '<a class="cgw-tab ' . esc_attr($key === $tab ? 'is-active' : '') . '" href="' . esc_url($url) . '">' . $label . '</a>';
        }
        ?>
    </nav>

    <div class="cgw-card">
        <?php
        if ($tab === 'connection') {
            include CGW_PLUGIN_DIR . 'admin/views/connection-form.php';
            include CGW_PLUGIN_DIR . 'admin/views/status-panel.php';
        } elseif ($tab === 'tracking') {
            include CGW_PLUGIN_DIR . 'admin/views/tracking.php';
        } elseif ($tab === 'products') {
            include CGW_PLUGIN_DIR . 'admin/views/products.php';
        } else {
            include CGW_PLUGIN_DIR . 'admin/views/troubleshooting.php';
        }
        ?>
    </div>
</div>
