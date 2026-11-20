# WooCommerce security notes

## Transport and store validation

- All CartGain endpoints require HTTPS.
- Store URLs are normalized and validated against credentials, query strings, fragments, localhost, private IP ranges, and private DNS answers.
- HTTP redirects are disabled for plugin-to-CartGain requests and TLS verification is enabled.

## Credentials

- WooCommerce consumer key/secret are encrypted at rest using CartGain’s encryption helper.
- The plugin encrypts connection id, store id, webhook secret, consumer key, and consumer secret in WordPress options using OpenSSL.
- APIs return only key fingerprints and status metadata, never raw secrets.

## Connection code

- `ConnectionIntent` stores only a SHA-256 hash of the one-time code.
- Codes expire after 10 minutes and are consumed atomically.
- The plugin derives a proof from code + install id + normalized store URL; the server rejects mismatches.

## Signatures and replay protection

- Webhook HMAC: `sha256(timestamp + "." + rawBody)`.
- Plugin request HMAC: `sha256(timestamp + "." + storeId + "." + path)`.
- HMACs use the derived webhook secret, are compared in constant time, and accept only timestamps inside a 5-minute tolerance.
- `PlatformEvent` deduplicates by `(storeId, platform, eventId)`; `WebhookDelivery` records verification and processing outcomes.

## Consent and privacy

- Only explicit sources with a valid timestamp create consent flags.
- Consent payloads from the plugin may use nested `{ enabled, source, timestamp }` values; these are normalized server-side.
- The WordPress plugin stores a bounded local queue and prunes old delivered/failed rows.
- New database tables have Postgres RLS enabled with no public role policies.
