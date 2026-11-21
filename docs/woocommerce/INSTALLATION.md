# WooCommerce plugin installation

## Requirements

- WordPress with WooCommerce active.
- Public HTTPS store URL; no credentials, ports, query strings, or private hosts.
- WooCommerce REST API key/secret with read/write access.
- OpenSSL available in PHP so credentials can be encrypted at rest.

## Install

1. Use the committed `cartgain-woocommerce.zip` from the repository root, or rebuild it from `plugins/cartgain-woocommerce/` with the same plugin version or higher.
2. In WordPress: Plugins → Add New → Upload Plugin → choose the ZIP → Install Now → Activate.
3. Open WooCommerce → CartGain (or CartGain in the admin menu).
4. In CartGain dashboard → Integrations, start a WooCommerce connection and copy the one-time connection code.
5. In the plugin connection form, paste the code, confirm the store URL, and enter the WooCommerce Consumer Key and Consumer Secret.
6. Save/connect. The plugin exchanges the code, verifies credentials, stores encrypted identifiers, and shows connection status.

## Recommended settings

- Enable cart tracking, checkout tracking, order tracking, and product sync.
- Enable explicit email/WhatsApp consent fields and enter the shared WhatsApp display number only if consent is collected.
- Saving one plugin settings tab preserves values saved on the other tabs.
- Use Action Scheduler when available for reliable queue processing; WP-Cron is the fallback.

## Verification

- Plugin status panel: connected, last sync, queue counts, webhook secret configured.
- CartGain `/api/integrations/woocommerce/status`: connection active, webhook configured, credential fingerprint present.
- Trigger a test cart update and confirm it appears in the CartGain cart list.
- Trigger a test order and confirm `PlatformOrder` is created and the matching cart is marked converted.
