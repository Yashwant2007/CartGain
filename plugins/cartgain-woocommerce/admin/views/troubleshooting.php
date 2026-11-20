<?php

if (!defined('ABSPATH')) {
    exit;
}
$stats = $this->queue->stats();
$scheduler = cartgain_wc()->scheduler;
$hpos = false;
if (class_exists('Automattic\\WooCommerce\\Utilities\\OrderUtil') && method_exists('Automattic\\WooCommerce\\Utilities\\OrderUtil', 'custom_orders_table_usage_is_enabled')) {
    $hpos = (bool) Automattic\WooCommerce\Utilities\OrderUtil::custom_orders_table_usage_is_enabled();
}
?>
<h2><?php esc_html_e('Troubleshooting', 'cartgain-woocommerce'); ?></h2>
<table class="widefat striped cgw-diagnostics">
    <tbody>
        <tr>
            <th><?php esc_html_e('WooCommerce', 'cartgain-woocommerce'); ?></th>
            <td><?php echo esc_html(class_exists('WooCommerce') && defined('WC_VERSION') ? 'WC ' . WC_VERSION : __('Inactive', 'cartgain-woocommerce')); ?></td>
        </tr>
        <tr>
            <th><?php esc_html_e('High-Performance Order Storage', 'cartgain-woocommerce'); ?></th>
            <td><?php echo esc_html($hpos ? __('Enabled', 'cartgain-woocommerce') : __('Disabled or not detected', 'cartgain-woocommerce')); ?></td>
        </tr>
        <tr>
            <th><?php esc_html_e('Encryption', 'cartgain-woocommerce'); ?></th>
            <td><?php echo esc_html(cartgain_wc()->crypto->is_available() ? __('OpenSSL AES-256 available', 'cartgain-woocommerce') : __('OpenSSL unavailable', 'cartgain-woocommerce')); ?></td>
        </tr>
        <tr>
            <th><?php esc_html_e('Scheduler', 'cartgain-woocommerce'); ?></th>
            <td>
                <?php echo esc_html($scheduler->uses_action_scheduler() ? __('Action Scheduler', 'cartgain-woocommerce') : __('WP Cron', 'cartgain-woocommerce')); ?>
                <?php
                $next = $scheduler->next_run('cartgain_wc_process_queue');
                if ($next > 0) {
                    echo ' · ' . esc_html(sprintf(__('Next queue run: %s', 'cartgain-woocommerce'), date_i18n(get_option('date_format') . ' ' . get_option('time_format'), $next)));
                }
                ?>
            </td>
        </tr>
        <tr>
            <th><?php esc_html_e('Event queue', 'cartgain-woocommerce'); ?></th>
            <td><?php echo esc_html(sprintf(__('Pending %d · Failed %d · Delivered %d', 'cartgain-woocommerce'), $stats['pending'], $stats['failed'], $stats['done'])); ?></td>
        </tr>
        <tr>
            <th><?php esc_html_e('Outbound endpoint', 'cartgain-woocommerce'); ?></th>
            <td><code><?php echo esc_html(CGW_API_BASE . '/api/webhooks/woocommerce'); ?></code></td>
        </tr>
    </tbody>
</table>

<form method="post" class="cgw-inline-form">
    <?php wp_nonce_field('cartgain_wc_retry'); ?>
    <input type="hidden" name="cartgain_action" value="retry" />
    <button type="submit" class="button button-secondary"><?php esc_html_e('Retry failed events', 'cartgain-woocommerce'); ?></button>
</form>

<p class="description"><?php esc_html_e('Event payloads never include encryption keys or webhook secrets. If delivery remains failed, confirm that outbound HTTPS to cart-gain.com is allowed and that the connection is still active.', 'cartgain-woocommerce'); ?></p>
