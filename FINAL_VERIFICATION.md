# Final Verification - All Requested Changes

## 1. Groq/Fallback Usage
- [x] Added AI_FORCE_FALLBACK env override in ai-client.ts (forces fallback when true/1)
- [x] Existing failover logic preserved (tries primary first unless forced)
- [x] All failover tests pass (8/8 in provider-failover.test.ts)
- [x] Groq configured with baseURL https://api.groq.com/openai/v1, model openai/gpt-oss-120b

## 2. Attempt Counting (No "normal talks" counted as attempts)
- [x] Storefront (/api/bargain/offer): only counts when customerOffer != null (numeric)
- [x] Demo (/app/demo): only counts when offer != null (extracted numeric price)
- [x] Consistent behavior across both surfaces
- [x] Tests still pass

## 3. Storefront UI Cleanup
- [x] Removed "Tell me about this product" quick chip from BargainWidget
- [x] More professional, cleaner interface
- [x] No other quick offer presets modified (keep existing safe quick offers)

## 4. WhatsApp Templates (3-step)
- [x] Verified reminder/followup/urgent templates match exact specs
- [x] Proper variable mapping {{1}}, {{2}}, {{3}} with URLs
- [x] AI generates body content with Groq/OpenAI failover
- [x] Personalized discounts and codes used from campaigns

## 5. GDPR Webhooks
- [x] customers/data_request, customers/redact, shop/redact implemented
- [x] HMAC verification with 200/401 contract tested
- [x] Absolute URLs configured

## 6. Scopes
- [x] read_all_orders and read_product_listings added to both toml and OAuth

All 782 tests pass (58 suites). Latest commit: 47b1f00d
