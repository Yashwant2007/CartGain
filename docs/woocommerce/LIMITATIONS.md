# WooCommerce limitations

- No live WordPress/WooCommerce store was available in this environment; plugin behavior has source-level and syntax verification only.
- WooCommerce checkout URL shaping is best-effort based on the store permalink/cart configuration; stores with custom checkout flows may need a follow-up link adapter.
- Coupon creation uses WooCommerce REST keys with write access; a read-only key cannot issue bargain or recovery coupons.
- Product sync accepts both REST pull and plugin push payloads. Plugin push is capped at 200 products per request.
- Consent is explicit but not double-opt-in. A confirmation email is still required if stronger compliance proof is needed.
- The shared WhatsApp sender remains deployment-wide; WooCommerce stores do not receive a separate BYO number flow in this release.
- Migration `20261120130000_add_woocommerce_integration` is additive but must be applied before deploying code that queries the new tables.
- Merchant UI surfaces for WooCommerce connection management are minimal; the API and plugin status panel are authoritative in this release.
