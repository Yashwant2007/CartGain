<?php

if (!defined('ABSPATH')) {
    exit;
}

final class CartGain_WC_CLI
{
    private $credentials;
    private $queue;
    private $products;

    public function __construct($credentials, $queue, $products)
    {
        $this->credentials = $credentials;
        $this->queue = $queue;
        $this->products = $products;
        if (defined('WP_CLI') && WP_CLI) {
            WP_CLI::add_command('cartgain', $this);
        }
    }

    public function sync_products($args = array(), $assoc = array())
    {
        if (!$this->credentials->is_connected()) {
            WP_CLI::error('CartGain is not connected.');
        }
        $queued = $this->products->full_sync(0);
        WP_CLI::success(sprintf('Queued %d products for sync.', $queued));
    }

    public function queue_process($args = array(), $assoc = array())
    {
        $processed = $this->queue->process_batch(50);
        WP_CLI::success(sprintf('Processed %d events.', $processed));
    }

    public function status($args = array(), $assoc = array())
    {
        $public = $this->credentials->get_public();
        $stats = $this->queue->stats();
        WP_CLI::line('Connected: ' . ($public['connected'] ? 'yes' : 'no'));
        WP_CLI::line('Store ID: ' . ($public['store_id'] !== '' ? $public['store_id'] : 'n/a'));
        WP_CLI::line('Store URL: ' . $public['store_url']);
        WP_CLI::line(sprintf('Queue: pending=%d failed=%d delivered=%d', $stats['pending'], $stats['failed'], $stats['done']));
    }
}
