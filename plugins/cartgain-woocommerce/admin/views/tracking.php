<?php

if (!defined('ABSPATH')) {
    exit;
}
?>
<h2><?php esc_html_e('Tracking, consent &amp; recovery', 'cartgain-woocommerce'); ?></h2>
<form method="post" action="options.php">
    <?php settings_fields('cartgain_wc_settings'); ?>
    <?php do_settings_sections('cartgain-wc-tracking'); ?>
    <?php submit_button(); ?>
</form>

<div class="cgw-note">
    <h3><?php esc_html_e('Consent shortcode', 'cartgain-woocommerce'); ?></h3>
    <p><code>[cartgain_consent]</code></p>
    <p class="description"><?php esc_html_e('Renders independent email and WhatsApp opt-in checkboxes anywhere. Checkout also renders them automatically when enabled. WhatsApp consent is never inferred from a billing phone number.', 'cartgain-woocommerce'); ?></p>
</div>
