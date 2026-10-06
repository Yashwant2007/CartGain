# Shopify Scopes Analysis for CartGain

## Current Configuration
**shopify.app.toml access_scopes:**
- scopes = "read_checkouts,write_checkouts,read_orders,read_customers,read_products,read_discounts,write_discounts"
- optional_scopes = []
- OAuth (shopify-oauth.ts) matches exactly

## Required vs Current

| Scope | Status | Purpose | Notes |
|---|---|---|---|
| read_products | ✓ | Display products in bargain widget | Present |
| read_product_listings | ✗ MISSING | Access product listings (for markets, multi-currency contexts) | Often needed if using ProductListing API or certain admin APIs |
| read_orders | ✓ | Detect purchases and attribute recovery | Present |
| read_all_orders | ✗ MISSING | Access all orders (including older/completed beyond filtered sets) | Required on some setups; Shopify Plus sometimes needs this. Also for comprehensive order history. |
| read_customers | ✓ | Link cart abandonment to customer contact info | Present |
| write_discounts | ✓ | Create bargain discount codes | Present |
| read_discounts | ✓ | Read/manage discount codes | Present |
| read_checkouts | ✓ | Detect abandoned checkouts | Present (key for recovery) |
| write_checkouts | ✓ | Modify/update checkouts via REST | We have this; may be needed for certain flows |

## Webhooks (Current)
✓ checkouts/create, checkouts/update, carts/update, orders/create, orders/paid, orders/cancelled, refunds/create, app/uninstalled, app_subscriptions/update + compliance webhooks all configured.

## Themes/Script Tags
- We use Theme App Extensions (extensions/storefront-bargain/) - preferred approach. So we do NOT need write_script_tags.
- read_themes/write_themes: NOT needed for theme app extensions. Only needed if programmatically injecting via Asset API. Skip.

## Recommendation
Add:
1. `read_product_listings` - safe, often required by modern Shopify Admin GraphQL/REST patterns for product visibility
2. `read_all_orders` - ensures we can read all orders for attribution regardless of filters

These are read-only scopes, minimal expansion, won't trigger major review concerns.
