# Mandatory GDPR Webhooks - Implementation Status

## Requirements (Concept 4)
Shopify requires three mandatory webhooks for apps touching customer data:
1. customers/data_request - merchant requests customer's data → must email it within 30 days
2. customers/redact - customer wants to be forgotten → delete their data  
3. shop/redact - merchant uninstalled 48 hours ago → delete all their data

## Implementation Status ✅

### Webhook Handler (src/app/api/webhooks/shopify/route.ts)
- [x] Handles all three topics: `customers/data_request`, `customers/redact`, `shop/redact`
- [x] Verifies HMAC signature first (returns 401 on invalid)
- [x] Acknowledges immediately with 200, processes async via waitUntil()
- [x] Route registered with absolute URI: `https://cart-gain.com/api/webhooks/shopify` (fixed from relative path issue)
- [x] Both app.toml (`compliance_topics`) and runtime registration cover them

### Data Export (src/lib/data-export.ts)
- [x] `collectCustomerData()` - collects carts, customers, bargain sessions, opt-outs with normalization
- [x] `normalizeCustomerId()` - handles Shopify GID formats (`gid://shopify/Customer/...`)
- [x] `createCustomerDataExport()` - persists export row
- [x] `deliverCustomerDataExportToMerchant()` - emails export to store owner
- [x] Handles both raw and normalized customer IDs

### Data Deletion (src/lib/data-deletion.ts)
- [x] `purgeStoreData()` - deletes all store-scoped data on shop/uninstall redact
- [x] `redactCustomer()` - deletes customer-specific data, normalizes IDs, handles opt-outs
- [x] Proper scoping by storeId, payment models keyed by merchantId handled
- [x] Tests verify ID normalization and opt-out deletion

### Tests (All Passing)
- [x] handler-contract.test.ts - 14 tests covering all three topics: 200 for valid signed, 401 for forged/missing/tampered, 401 if secret missing, 200 for unknown store
- [x] signature.test.ts - HMAC verification tests (9 passed)
- [x] compliance.test.ts - config/runtime parity tests
- [x] data-deletion.test.ts - 2 tests for purge and redact logic
- [x] Total: 782 tests passed, 58 suites

## Verified in Production Context
- Live curl tests confirm forged HMACs return 401
- Route-level tests prove 200/401 contract as Shopify expects
- Both app.toml and runtime registration use absolute HTTPS URL

All requirements satisfied. Ready for Shopify review.
