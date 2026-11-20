<?php

if (!defined('ABSPATH')) {
    exit;
}

final class CartGain_WC_Database
{
    public static function events_table()
    {
        global $wpdb;
        return $wpdb->prefix . 'cartgain_events';
    }

    public static function carts_table()
    {
        global $wpdb;
        return $wpdb->prefix . 'cartgain_carts';
    }

    public static function create_tables()
    {
        global $wpdb;
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';

        $charset = $wpdb->get_charset_collate();
        $events = self::events_table();
        $carts = self::carts_table();

        $events_sql = "CREATE TABLE {$events} (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            event_uuid char(36) NOT NULL,
            event_type varchar(80) NOT NULL,
            endpoint varchar(190) NOT NULL DEFAULT '',
            payload longtext NOT NULL,
            status varchar(20) NOT NULL DEFAULT 'pending',
            attempts int(11) NOT NULL DEFAULT 0,
            next_attempt_at datetime NOT NULL,
            created_at datetime NOT NULL,
            updated_at datetime NOT NULL,
            last_error varchar(255) NOT NULL DEFAULT '',
            PRIMARY KEY  (id),
            UNIQUE KEY event_uuid (event_uuid),
            KEY status_next (status, next_attempt_at)
        ) {$charset};";

        $carts_sql = "CREATE TABLE {$carts} (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            cart_key varchar(64) NOT NULL,
            cart_hash varchar(64) NOT NULL DEFAULT '',
            source varchar(20) NOT NULL DEFAULT 'php',
            last_activity datetime NOT NULL,
            created_at datetime NOT NULL,
            status varchar(20) NOT NULL DEFAULT 'open',
            abandoned_notified tinyint(1) NOT NULL DEFAULT 0,
            consent longtext NOT NULL,
            data longtext NOT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY cart_key (cart_key),
            KEY status_activity (status, last_activity)
        ) {$charset};";

        dbDelta($events_sql);
        dbDelta($carts_sql);
        update_option('cartgain_wc_db_version', CGW_VERSION, false);
    }

    public static function drop_tables()
    {
        global $wpdb;
        $events = self::events_table();
        $carts = self::carts_table();
        $wpdb->query("DROP TABLE IF EXISTS `{$events}`");
        $wpdb->query("DROP TABLE IF EXISTS `{$carts}`");
        delete_option('cartgain_wc_db_version');
    }
}
