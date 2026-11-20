=== CartGain for WooCommerce ===
Contributors: CartGain
Tags: woocommerce, cart recovery, bargain, abandoned cart, consent
Requires at least: 6.0
Tested up to: 6.8
Requires PHP: 7.4
WC requires at least: 7.0
WC tested up to: 9.0
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Send WooCommerce cart, product, order and consent events to CartGain and embed the CartGain bargain widget without editing theme files.

== Description ==

CartGain for WooCommerce is a connector. It does not send messages itself and it does not calculate recovery discounts. CartGain's servers own inactivity, recovery timing, offers and negotiation rules.

The plugin:

* Tracks carts through PHP hooks and Store API-compatible JavaScript (classic cart/checkout and Cart/Checkout Blocks).
* Captures explicit, independent email and WhatsApp consent with a source and timestamp.
* Syncs products, variations, prices, images, categories, inventory and attributes to CartGain.
* Sends order created, paid, cancelled and refunded events using WooCommerce CRUD, so HPOS is supported.
* Renders the bargain widget with `[cartgain_bargain]` or automatically on product pages behind a setting.
* Queues signed events with UUIDv4 ids, HMAC signatures, timestamps, retries and exponential backoff.
* Encrypts connection credentials at rest with OpenSSL AES-256-CBC and HMAC-SHA256 derived from WordPress salts.

== Installation ==

1. Upload the `cartgain-woocommerce` folder to `/wp-content/plugins/` or install the ZIP through Plugins → Add New.
2. Activate the plugin. It requires WooCommerce; a notice is shown if WooCommerce is inactive.
3. In CartGain, create a WooCommerce connection and copy the one-time connection code.
4. In WordPress, go to CartGain → Connection.
5. Generate a WooCommerce REST API key with Read/Write permissions and paste the Consumer Key and Consumer Secret. The store URL is auto-filled from WordPress and must be HTTPS.
6. Click Connect. The plugin proves the request with an HMAC derived from the connection code and stores the returned connection id, store id and webhook secret encrypted.
7. Go to CartGain → Products & bargain and queue a full product sync.
8. Enable the bargain widget and either use the shortcode or turn on automatic product-page injection.

No theme file edits are required.

== Configuration ==

* CartGain → Connection: connection status, store identifier, product sync/last sync, cart tracking, bargain, recovery summary, consent summary, event queue and disconnect.
* CartGain → Tracking & consent: cart tracking, local inactivity check, inactivity threshold, email/WhatsApp opt-ins and recovery status display.
* CartGain → Products & bargain: product sync, widget enablement, automatic product-page injection and full sync.
* CartGain → Troubleshooting: scheduler, HPOS, encryption, queue counts and failed-event retry.

Shortcodes:

* `[cartgain_bargain]` — renders the bargain iframe on a product page. Use `[cartgain_bargain product_id="123"]` on a non-product page.
* `[cartgain_consent]` — renders independent email/WhatsApp opt-in checkboxes.

WP-CLI:

* `wp cartgain sync-products` — queue a full product sync.
* `wp cartgain queue-process` — process a batch of queued events.
* `wp cartgain status` — print connection and queue status.

== Hooks used ==

Activation/deactivation: `register_activation_hook`, `register_deactivation_hook`, `register_uninstall_hook`.
WooCommerce compatibility: `before_woocommerce_init` with `FeaturesUtil::declare_compatibility('custom_order_tables', ...)`.
Carts: `woocommerce_add_to_cart`, `woocommerce_after_cart_item_quantity_update`, `woocommerce_cart_item_removed`, `woocommerce_cart_item_restored`, `wp` for checkout detection.
Customers: `woocommerce_checkout_update_customer`, `woocommerce_checkout_fields`, `woocommerce_checkout_posted_data`.
Products: `woocommerce_new_product`, `woocommerce_update_product`, `woocommerce_delete_product`, `woocommerce_new_product_variation`, `woocommerce_update_product_variation`, `woocommerce_delete_product_variation`.
Orders: `woocommerce_new_order`, `woocommerce_order_status_completed`, `woocommerce_payment_complete`, `woocommerce_order_status_cancelled`, `woocommerce_order_status_refunded`, `woocommerce_refund_created`.
Bargain: `woocommerce_single_product_summary` when automatic injection is enabled.
Scheduling: Action Scheduler when available, otherwise WP Cron (`cartgain_wc_process_queue`, `cartgain_wc_inactivity_check`, `cartgain_wc_cleanup`).
REST: `GET /wp-json/cartgain/v1/health` (HMAC-signed), `POST /wp-json/cartgain/v1/events`, `POST /wp-json/cartgain/v1/consent` (nonce + rate limit).

== Network endpoints ==

* `POST https://cart-gain.com/api/integrations/woocommerce/exchange` — one-time connection exchange.
* `POST https://cart-gain.com/api/webhooks/woocommerce` — signed event envelope.
* `POST https://cart-gain.com/api/integrations/woocommerce/sync/products` — product/variation sync.
* `GET https://cart-gain.com/api/integrations/woocommerce/status` — recovery status summary.
* `POST https://cart-gain.com/api/integrations/woocommerce/disconnect` — remote disconnect.

Every request uses HTTPS, a timestamp header, and `X-CartGain-Signature: sha256=<hmac>`. Event deliveries also carry `X-CartGain-Event-Id` for idempotency.

== Privacy ==

* Consumer Key, Consumer Secret, connection id, store id and webhook secret are encrypted at rest using keys derived from WordPress salts. They are never rendered except as a masked suffix, and never stored in browser storage.
* Cart state used by the local inactivity check is stored in `wp_cartgain_carts` and pruned after 30 days; converted carts are pruned after 7 days. Queued events are pruned after 14 days (delivered) or 30 days (failed).
* Customer email/phone is only attached when WooCommerce has legitimately provided it (checkout/order) or when the shopper explicitly submits it. A billing phone never implies WhatsApp consent.
* The plugin does not log event bodies, secrets or personal data. Error text stored for a failed delivery is a sanitized error code only.
* Uninstalling the plugin deletes its options, encrypted credentials and local tables. Deactivation only stops scheduled jobs.

== FAQ ==

= Does the plugin decide who is abandoned? =
No. Update events never mark abandonment. An optional local inactivity check can enqueue `cart_abandoned` only for consented carts after a configured quiet period; CartGain owns recovery decisions.

= Does it work with HPOS? =
Yes. The plugin declares HPOS compatibility and uses WooCommerce CRUD methods for orders.

= Does it work with Cart and Checkout Blocks? =
Yes. PHP hooks cover server-side state and the bundled Store API-compatible JavaScript subscribes to `wc/store/cart` for cart tokens, quantities and totals.

= Are WhatsApp messages sent from WordPress? =
No. The plugin only sends consent and cart/order data. CartGain's recovery engine sends messages.

= Where are floors and negotiation rules? =
On CartGain servers. The iframe only receives public product data and a cart token.

== Changelog ==

= 1.0.0 =
* Initial production release.
