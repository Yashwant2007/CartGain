<?php

if (!defined('ABSPATH')) {
    exit;
}

final class CartGain_WC_Queue
{
    private $credentials;
    private $http;
    private $scheduler;

    public function __construct($credentials, $http, $scheduler)
    {
        $this->credentials = $credentials;
        $this->http = $http;
        $this->scheduler = $scheduler;
        if (get_option('cartgain_wc_db_version') !== CGW_VERSION) {
            CartGain_WC_Database::create_tables();
        }
    }

    public function enqueue($event_type, $payload, $dedupe_key = '', $endpoint_path = 'api/webhooks/woocommerce')
    {
        if (!$this->credentials->is_connected()) {
            return false;
        }
        if (!preg_match('/^[a-z0-9_]{1,80}$/', $event_type)) {
            return false;
        }

        $dedupe_key = (string) $dedupe_key;
        $dedupe_transient = '';
        if ($dedupe_key !== '') {
            $dedupe_transient = 'cgw_ev_' . md5($event_type . '|' . $dedupe_key);
            if (get_transient($dedupe_transient)) {
                return false;
            }
        }

        global $wpdb;
        $event_id = cartgain_wc_uuid4();
        $now = current_time('mysql');
        $inserted = $wpdb->insert(
            CartGain_WC_Database::events_table(),
            array(
                'event_uuid' => $event_id,
                'event_type' => $event_type,
                'endpoint' => cartgain_wc_sanitize_error($endpoint_path),
                'payload' => cartgain_wc_json_encode($payload),
                'status' => 'pending',
                'attempts' => 0,
                'next_attempt_at' => $now,
                'created_at' => $now,
                'updated_at' => $now,
                'last_error' => '',
            ),
            array('%s', '%s', '%s', '%s', '%s', '%d', '%s', '%s', '%s', '%s')
        );
        if ($inserted === false) {
            return false;
        }
        if ($dedupe_transient !== '') {
            set_transient($dedupe_transient, 1, DAY_IN_SECONDS);
        }

        $this->scheduler->schedule_single('cartgain_wc_process_queue', array(), 5);
        return $event_id;
    }

    public function process_batch($limit = 10)
    {
        if (!$this->credentials->is_connected()) {
            return 0;
        }
        $limit = max(1, min(50, (int) $limit));
        global $wpdb;
        $table = CartGain_WC_Database::events_table();
        $now = current_time('mysql');
        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT * FROM `{$table}` WHERE status IN ('pending','failed') AND next_attempt_at <= %s ORDER BY id ASC LIMIT %d",
                $now,
                $limit
            ),
            ARRAY_A
        );
        if (empty($rows)) {
            return 0;
        }

        $secret = $this->credentials->signing_secret();
        $headers = $this->credentials->connection_headers();
        $processed = 0;

        foreach ($rows as $row) {
            $claimed = $wpdb->query(
                $wpdb->prepare(
                    "UPDATE `{$table}` SET status = 'processing', updated_at = %s WHERE id = %d AND status IN ('pending','failed') AND next_attempt_at <= %s",
                    current_time('mysql'),
                    (int) $row['id'],
                    $now
                )
            );
            if (!$claimed) {
                continue;
            }

            $payload = json_decode($row['payload'], true);
            if (!is_array($payload)) {
                $payload = array();
            }
            $event_id = (string) $row['event_uuid'];
            $endpoint = (string) $row['endpoint'];
            if (strpos($endpoint, 'sync/products') !== false) {
                $outbound = (object) $payload;
            } else {
                $outbound = array(
                    'eventId' => $event_id,
                    'type' => (string) $row['event_type'],
                    'occurredAt' => gmdate('c'),
                    'connectionId' => isset($headers['X-CartGain-Connection-Id']) ? $headers['X-CartGain-Connection-Id'] : '',
                    'data' => (object) $payload,
                );
            }

            $response = $this->http->request('POST', $endpoint, $outbound, $secret, $headers, $event_id);
            if (!is_wp_error($response)) {
                $wpdb->update(
                    $table,
                    array('status' => 'done', 'attempts' => (int) $row['attempts'] + 1, 'updated_at' => current_time('mysql'), 'last_error' => ''),
                    array('id' => (int) $row['id']),
                    array('%s', '%d', '%s', '%s'),
                    array('%d')
                );
                $processed++;
                continue;
            }

            $error_code = $response->get_error_code();
            $data = $response->get_error_data();
            $status = isset($data['status']) ? (int) $data['status'] : 0;
            $permanent = ($status >= 400 && $status < 500 && $status !== 408 && $status !== 429);
            $attempts = (int) $row['attempts'] + 1;
            $this->mark_failed((int) $row['id'], $attempts, $error_code, $permanent);
        }

        if ($processed > 0) {
            $this->credentials->touch_sync('events_delivered', time());
        }
        return $processed;
    }

    private function mark_failed($id, $attempts, $error_code, $permanent)
    {
        global $wpdb;
        $table = CartGain_WC_Database::events_table();
        $delay = ($permanent || $attempts >= 10) ? DAY_IN_SECONDS : $this->backoff($attempts);
        $next = date('Y-m-d H:i:s', current_time('timestamp') + $delay);
        $wpdb->update(
            $table,
            array(
                'status' => 'failed',
                'attempts' => $attempts,
                'next_attempt_at' => $next,
                'updated_at' => current_time('mysql'),
                'last_error' => cartgain_wc_sanitize_error($error_code),
            ),
            array('id' => $id),
            array('%s', '%d', '%s', '%s', '%s'),
            array('%d')
        );
    }

    private function backoff($attempts)
    {
        $exponent = max(0, min(16, (int) $attempts - 1));
        $seconds = 30 * pow(2, $exponent);
        return (int) min(21600, $seconds) + wp_rand(0, 5);
    }

    public function retry_failed()
    {
        global $wpdb;
        $table = CartGain_WC_Database::events_table();
        $updated = $wpdb->query(
            $wpdb->prepare(
                "UPDATE `{$table}` SET status = 'pending', next_attempt_at = %s, updated_at = %s WHERE status = 'failed' AND attempts < %d",
                current_time('mysql'),
                current_time('mysql'),
                10
            )
        );
        if ($updated) {
            $this->scheduler->schedule_single('cartgain_wc_process_queue', array(), 1);
        }
        return (int) $updated;
    }

    public function stats()
    {
        global $wpdb;
        $table = CartGain_WC_Database::events_table();
        $rows = $wpdb->get_results("SELECT status, COUNT(*) AS total FROM `{$table}` GROUP BY status", ARRAY_A);
        $stats = array('pending' => 0, 'processing' => 0, 'failed' => 0, 'done' => 0);
        if (is_array($rows)) {
            foreach ($rows as $row) {
                $key = isset($row['status']) ? sanitize_key($row['status']) : '';
                if (array_key_exists($key, $stats)) {
                    $stats[$key] = (int) $row['total'];
                }
            }
        }
        return $stats;
    }

    public function cleanup()
    {
        global $wpdb;
        $table = CartGain_WC_Database::events_table();
        $done_cutoff = date('Y-m-d H:i:s', current_time('timestamp') - 14 * DAY_IN_SECONDS);
        $failed_cutoff = date('Y-m-d H:i:s', current_time('timestamp') - 30 * DAY_IN_SECONDS);
        $stuck_cutoff = date('Y-m-d H:i:s', current_time('timestamp') - 15 * MINUTE_IN_SECONDS);
        $wpdb->query($wpdb->prepare("DELETE FROM `{$table}` WHERE status = 'done' AND created_at < %s", $done_cutoff));
        $wpdb->query($wpdb->prepare("DELETE FROM `{$table}` WHERE status = 'failed' AND created_at < %s", $failed_cutoff));
        $wpdb->query($wpdb->prepare("UPDATE `{$table}` SET status = 'pending', next_attempt_at = %s WHERE status = 'processing' AND updated_at < %s", current_time('mysql'), $stuck_cutoff));
    }
}
