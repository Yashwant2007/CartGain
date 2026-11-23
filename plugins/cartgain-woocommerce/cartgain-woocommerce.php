<?php
/**
 * Plugin Name: CartGain for WooCommerce
 * Plugin URI: https://cart-gain.com
 * Description: Cart tracking, product sync, order recovery events, and the CartGain bargain widget for WooCommerce.
 * Version: 1.0.9
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * Author: CartGain
 * Author URI: https://cart-gain.com
 * Text Domain: cartgain-woocommerce
 * Domain Path: /languages
 * WC requires at least: 7.0
 * WC tested up to: 9.0
 * License: GPLv2 or later
 */

if (!defined('ABSPATH')) {
    exit;
}

define('CGW_VERSION', '1.0.9');
define('CGW_PLUGIN_FILE', __FILE__);
define('CGW_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('CGW_PLUGIN_URL', plugin_dir_url(__FILE__));
define('CGW_TEXT_DOMAIN', 'cartgain-woocommerce');
define('CGW_API_BASE', 'https://cart-gain.com');

require_once CGW_PLUGIN_DIR . 'includes/cartgain-wc-helpers.php';
require_once CGW_PLUGIN_DIR . 'includes/class-cartgain-wc-crypto.php';
require_once CGW_PLUGIN_DIR . 'includes/class-cartgain-wc-credentials.php';
require_once CGW_PLUGIN_DIR . 'includes/class-cartgain-wc-database.php';
require_once CGW_PLUGIN_DIR . 'includes/class-cartgain-wc-http.php';
require_once CGW_PLUGIN_DIR . 'includes/class-cartgain-wc-scheduler.php';
require_once CGW_PLUGIN_DIR . 'includes/class-cartgain-wc-queue.php';
require_once CGW_PLUGIN_DIR . 'includes/class-cartgain-wc-settings.php';
require_once CGW_PLUGIN_DIR . 'includes/class-cartgain-wc-tracking.php';
require_once CGW_PLUGIN_DIR . 'includes/class-cartgain-wc-products.php';
require_once CGW_PLUGIN_DIR . 'includes/class-cartgain-wc-orders.php';
require_once CGW_PLUGIN_DIR . 'includes/class-cartgain-wc-bargain.php';
require_once CGW_PLUGIN_DIR . 'includes/class-cartgain-wc-checkout-links.php';
require_once CGW_PLUGIN_DIR . 'includes/class-cartgain-wc-rest.php';
require_once CGW_PLUGIN_DIR . 'includes/class-cartgain-wc-cli.php';
require_once CGW_PLUGIN_DIR . 'admin/class-cartgain-wc-admin.php';
require_once CGW_PLUGIN_DIR . 'public/class-cartgain-wc-public.php';

function cartgain_wc_declare_hpos()
{
    if (class_exists('Automattic\\WooCommerce\\Utilities\\FeaturesUtil')) {
        Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility('custom_order_tables', CGW_PLUGIN_FILE, true);
    }
}

function cartgain_wc_create_tables()
{
    CartGain_WC_Database::create_tables();
}

function cartgain_wc_activate()
{
    cartgain_wc_create_tables();
    CartGain_WC_Settings::seed_defaults();
    (new CartGain_WC_Scheduler())->schedule_recurring();
    flush_rewrite_rules();
}

function cartgain_wc_deactivate()
{
    (new CartGain_WC_Scheduler())->unschedule_all();
    flush_rewrite_rules();
}

function cartgain_wc_uninstall()
{
    CartGain_WC_Settings::remove_all();
    CartGain_WC_Credentials::remove_all();
    CartGain_WC_Database::drop_tables();
    (new CartGain_WC_Scheduler())->unschedule_all();
}

function cartgain_wc_missing_woocommerce_notice()
{
    if (class_exists('WooCommerce') || !current_user_can('activate_plugins')) {
        return;
    }
    echo '<div class="notice notice-error"><p>' . esc_html__('CartGain for WooCommerce requires WooCommerce to be installed and active.', 'cartgain-woocommerce') . '</p></div>';
}

final class CartGain_WC_Plugin
{
    private static $instance = null;

    public $crypto;
    public $credentials;
    public $http;
    public $database;
    public $scheduler;
    public $queue;
    public $settings;
    public $tracking;
    public $products;
    public $orders;
    public $bargain;
    public $checkout_links;
    public $rest;
    public $cli;
    public $admin;
    public $public_front;
    private $started = false;

    public static function instance()
    {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    public function init()
    {
        if ($this->started) {
            return;
        }
        $this->started = true;

        $this->crypto = new CartGain_WC_Crypto();
        $this->http = new CartGain_WC_HTTP();
        $this->credentials = new CartGain_WC_Credentials($this->crypto, $this->http);
        $this->database = new CartGain_WC_Database();
        $this->scheduler = new CartGain_WC_Scheduler();
        $this->queue = new CartGain_WC_Queue($this->credentials, $this->http, $this->scheduler);
        $this->settings = new CartGain_WC_Settings($this->credentials, $this->queue, $this->scheduler);
        $this->admin = new CartGain_WC_Admin($this->credentials, $this->queue, $this->settings);
        $this->public_front = new CartGain_WC_Public();

        if (class_exists('WooCommerce')) {
            $this->tracking = new CartGain_WC_Tracking($this->credentials, $this->queue, $this->scheduler);
            $this->products = new CartGain_WC_Products($this->credentials, $this->queue, $this->scheduler);
            $this->orders = new CartGain_WC_Orders($this->credentials, $this->queue, $this->tracking);
            $this->bargain = new CartGain_WC_Bargain($this->credentials);
            $this->checkout_links = new CartGain_WC_Checkout_Links();
            $this->cli = new CartGain_WC_CLI($this->credentials, $this->queue, $this->products);
        }

        $this->rest = new CartGain_WC_REST($this->credentials, $this->queue, $this->tracking);

        add_action('cartgain_wc_process_queue', array($this->queue, 'process_batch'));
        add_action('cartgain_wc_cleanup', array($this->queue, 'cleanup'));
        $this->scheduler->schedule_recurring();

        if (is_admin()) {
            $this->admin->hooks();
        } else {
            $this->public_front->hooks();
        }
    }
}

function cartgain_wc()
{
    return CartGain_WC_Plugin::instance();
}

function cartgain_wc_cron_schedules($schedules)
{
    $schedules['cartgain_every_minute'] = array(
        'interval' => 60,
        'display' => __('Every minute (CartGain)', 'cartgain-woocommerce'),
    );
    $schedules['cartgain_every_five_minutes'] = array(
        'interval' => 300,
        'display' => __('Every five minutes (CartGain)', 'cartgain-woocommerce'),
    );
    return $schedules;
}

add_filter('cron_schedules', 'cartgain_wc_cron_schedules');
add_action('before_woocommerce_init', 'cartgain_wc_declare_hpos');
add_action('init', 'cartgain_wc_load_textdomain');
add_action('plugins_loaded', array(cartgain_wc(), 'init'));
add_action('admin_notices', 'cartgain_wc_missing_woocommerce_notice');

register_activation_hook(__FILE__, 'cartgain_wc_activate');
register_deactivation_hook(__FILE__, 'cartgain_wc_deactivate');
register_uninstall_hook(__FILE__, 'cartgain_wc_uninstall');

function cartgain_wc_load_textdomain()
{
    load_plugin_textdomain(CGW_TEXT_DOMAIN, false, dirname(plugin_basename(CGW_PLUGIN_FILE)) . '/languages');
}
