<?php

if (!defined('ABSPATH')) {
    exit;
}
?>
<h2><?php esc_html_e('Service status', 'cartgain-woocommerce'); ?></h2>
<form method="post" action="options.php">
    <?php settings_fields('cartgain_wc_settings'); ?>
    <?php do_settings_sections('cartgain-wc-connection'); ?>
</form>
