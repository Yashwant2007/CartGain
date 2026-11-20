<?php

if (!defined('ABSPATH')) {
    exit;
}
?>
<h2><?php esc_html_e('Connection', 'cartgain-woocommerce'); ?></h2>
<p class="description"><?php esc_html_e('Enter the connection code from your CartGain dashboard plus a WooCommerce REST API key with read/write access. Credentials are encrypted at rest and never displayed again.', 'cartgain-woocommerce'); ?></p>

<?php if ($public['connected']) : ?>
    <div class="cgw-connected">
        <span class="cgw-pill cgw-pill-ok"><?php esc_html_e('Connected', 'cartgain-woocommerce'); ?></span>
        <code><?php echo esc_html($public['store_id']); ?></code>
    </div>
    <form method="post" class="cgw-disconnect-form">
        <?php wp_nonce_field('cartgain_wc_disconnect'); ?>
        <input type="hidden" name="cartgain_action" value="disconnect" />
        <button type="submit" class="button button-secondary" data-cartgain-confirm="1"><?php esc_html_e('Disconnect', 'cartgain-woocommerce'); ?></button>
    </form>
<?php endif; ?>

<form method="post" class="cgw-connect-form">
    <?php wp_nonce_field('cartgain_wc_connect'); ?>
    <input type="hidden" name="cartgain_action" value="connect" />
    <table class="form-table" role="presentation">
        <tbody>
            <tr>
                <th scope="row"><label for="cartgain_connection_code"><?php esc_html_e('CartGain connection code', 'cartgain-woocommerce'); ?></label></th>
                <td>
                    <input type="password" id="cartgain_connection_code" name="cartgain_connection_code" value="" class="regular-text" autocomplete="off" required />
                    <p class="description"><?php esc_html_e('One-time code generated in CartGain. It is used to prove this request and is not stored.', 'cartgain-woocommerce'); ?></p>
                </td>
            </tr>
            <tr>
                <th scope="row"><label for="cartgain_store_url"><?php esc_html_e('Store URL', 'cartgain-woocommerce'); ?></label></th>
                <td>
                    <input type="url" id="cartgain_store_url" name="cartgain_store_url" value="<?php echo esc_attr($public['connected'] ? $public['store_url'] : home_url('/')); ?>" class="regular-text" required />
                    <p class="description"><?php esc_html_e('Auto-filled from WordPress. Must be HTTPS.', 'cartgain-woocommerce'); ?></p>
                </td>
            </tr>
            <tr>
                <th scope="row"><label for="cartgain_consumer_key"><?php esc_html_e('WooCommerce Consumer Key', 'cartgain-woocommerce'); ?></label></th>
                <td><input type="password" id="cartgain_consumer_key" name="cartgain_consumer_key" value="" class="regular-text" autocomplete="off" required /></td>
            </tr>
            <tr>
                <th scope="row"><label for="cartgain_consumer_secret"><?php esc_html_e('WooCommerce Consumer Secret', 'cartgain-woocommerce'); ?></label></th>
                <td><input type="password" id="cartgain_consumer_secret" name="cartgain_consumer_secret" value="" class="regular-text" autocomplete="off" required /></td>
            </tr>
        </tbody>
    </table>
    <?php submit_button($public['connected'] ? __('Replace connection', 'cartgain-woocommerce') : __('Connect to CartGain', 'cartgain-woocommerce')); ?>
</form>
