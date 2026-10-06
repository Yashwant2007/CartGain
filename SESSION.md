# CartGain Session Summary

## Current State
- Branch: master
- Latest commit: 38267678 (health: make Shopify keys required and warn on padded envs)
- Tests: 782 passed, 58 suites
- Bargain tests: 463 passed, 21 suites

## What We've Done
- Shopify webhook fix: absolute URIs (resolved /api/shopify/install/api/webhooks/shopify 404)
- Compliance webhooks (customers/data_request, customers/redact, shop/redact) with correct HMAC verification
- HMAC hardened (trimmed secrets on all paths, better diagnostics, preimage-resistant fingerprinting)
- Health checks: Shopify API keys required, warn on padded envs (names never leaked to unauthenticated clients)
- Unified storefront/demo negotiation through shared engine (src/lib/bargain/engine.ts)
- Floor-safe negotiation (hidden floors never leaked; exact-floor leaks fixed)
- Provider failover (OpenAI → Groq) working; tests confirm same-request failover
- Attempt accounting: only count numeric offer turns (customerOffer != null). Chat/greetings don't consume attempts
- Demo: fixed attempt counting to only increment when a numeric price (offer) is extracted
- Final-offer acceptance at floor when attempts exhausted (deterministic)

## Recent Changes
- src/app/demo/demo-content.tsx: isOfferTurn logic; attempts only increment when numeric offer present
- src/app/api/health/route.ts: Shopify keys required; padding warnings
- src/app/api/health/__tests__/route.test.ts: env reporting tests
- src/app/api/webhooks/shopify/__tests__/signature.test.ts: trim + fingerprint diagnostics
- src/lib/shopify*.ts, OAuth/callback/install routes: trimmed secrets

## Key Files
- src/app/api/bargain/offer/route.ts (storefront attempt logic, abuse handling)
- src/app/api/bargain/demo/route.ts (demo API, uses shared negotiateStep)
- src/app/demo/demo-content.tsx (demo UI)
- src/lib/services/bargain.ts (negotiateStep, chatFallback, degradation logging)
- src/lib/bargain/engine.ts (deterministic negotiation logic)
- src/lib/ai-client.ts (provider config, trimming, fallback client)

## Notes
- "Groq never used" - provider failover tests all pass (8/8); negotiateStep uses getAiClient() which falls back to Groq on primary quota/401. If primary is healthy and has quota, it will be used; fallback triggers only on failure as designed.
- Attempt counting definition: storefront uses extractPrice() to determine numeric offer; demo now mirrors this. Text-only bargaining without extractable price is treated as chat until a numeric price appears.

## Groq/Fallback Status
- All provider failover tests pass (8/8)
- negotiateStep() uses getAiClient() which tries primary (OpenAI) first; on quota/401 it trips breaker and falls back to Groq
- Both storefront (/api/bargain/offer) and demo (/api/bargain/demo) go through negotiateStep() - so failover works for both
- Groq client is configured with baseURL https://api.groq.com/openai/v1 and model openai/gpt-oss-120b when fallback is used
