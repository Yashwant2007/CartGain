# WooCommerce verification report

Automated verification after integration:

- `npx prisma validate` — pass.
- `npm run typecheck` — pass.
- `npm run lint -- --no-cache` — pass.
- `npm test -- --runInBand` — 239 suites, 2349 tests passed.
- `npm run build` — pass (production build compiles all WooCommerce routes; only pre-existing `PRODUCTION_DB_HOSTS is not set` warnings).
- `git diff --check` — pass.

Covered behavior:

- Public HTTPS/SSRF URL validation.
- Connection proof and webhook/plugin signature verification.
- Replay/dedupe claims and event status transitions.
- Cart, customer, consent, and order normalization, including plugin nested price/inventory shapes, customer-name fallbacks, subtotal/discount totals, and coupon lines from plugin `1.0.7` payloads.
- Explicit plugin consent sources with cart-contact fallback.
- Bargain floor resolution and catalog merge for WooCommerce products.
- WooCommerce coupon generation and recovery offer selection.
- Platform-aware checkout links for Shopify and WooCommerce, including prefixed platform order ids and quote-redemption attribution.
- WooCommerce paid/cancelled/refunded order attribution and refund netting against bargain sessions.
- Adaptive live-turn detection and rapid replies for random/joke/flattery/hesitation signals, with voice-driven emoji and humor caps.
- Automatic bargain widget output on classic and block themes (classic `woocommerce_single_product_summary` plus a deduplicated `wp_footer` fallback).
- Full catalog reconciliation: automatic on plugin connect, once daily, and on product create/update/delete hooks.
- Inline invitation handoff to a storefront negotiation drawer with origin-checked messages, live variation sync, and session-preserving close/reopen.

Not covered in this environment:

- Live WordPress/WooCommerce installation and activation outside the staging store used for manual verification.
- Real WooCommerce REST key exchange and credential verification outside the staging store used for manual verification.
- Real Store API cart/checkout/order events through Action Scheduler or WP-Cron.
- Live Shopify-regression checkout and discount flows.
- Local PHP syntax linting (`php` is unavailable in this environment); plugin changes are validated by source review and ZIP structure checks only.
- Production database migration/application and health checks.

Manual acceptance checklist:

1. Install ZIP on a public HTTPS staging store.
2. Connect using a fresh CartGain merchant session and fresh WooCommerce keys.
3. Open a published product page and confirm the CartGain bargain iframe appears (including on block themes).
4. Add to cart, reach checkout, identify customer, consent via checkbox, abandon.
5. Confirm CartGain cart, identity consent, and recovery eligibility.
6. Complete an order; confirm `PlatformOrder`, cart conversion, and recovery cancellation.
7. Start a bargain; confirm product facts, hidden floor, quick offers, coupon creation, and checkout URL.
8. Disconnect; confirm remote key revocation and local cleanup.
