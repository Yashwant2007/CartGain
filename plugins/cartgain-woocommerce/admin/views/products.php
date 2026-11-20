<?php

if (!defined('ABSPATH')) {
    exit;
}
?>
<h2><?php esc_html_e('Products &amp; bargain', 'cartgain-woocommerce'); ?></h2>
<form method="post" action="options.php">
    <?php settings_fields('cartgain_wc_settings'); ?>
    <?php do_settings_sections('cartgain-wc-products'); ?>
    <?php submit_button(); ?>
</form>

<form method="post" class="cgw-inline-form">
    <?php wp_nonce_field('cartgain_wc_sync'); ?>
    <input type="hidden" name="cartgain_action" value="sync" />
    <button type="submit" class="button button-secondary"><?php esc_html_e('Queue full product sync', 'cartgain-woocommerce'); ?></button>
</form>

<div class="cgw-note">
    <h3><?php esc_html_e('Bargain widget', 'cartgain-woocommerce'); ?></h3>
    <p><code>[cartgain_bargain]</code></p>
    <p class="description"><?php esc_html_e('Only public title, price, image, currency, product ID, store ID and cart token are sent to the iframe. Pricing rules and floors stay on CartGain servers.', 'cartgain-woocommerce'); ?></p>
</div>
