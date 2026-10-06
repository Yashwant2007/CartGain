# Shopify Billing - Managed Pricing (App Pricing) Verification

## Implementation Status
- [x] Using Shopify App Billing (Managed Pricing) via GraphQL Admin API
- [x] Creates app subscriptions with recurring charges + optional usage charges
- [x] Usage charges for revenue share (AppUsagePricing)
- [x] Handles test mode via SHOPIFY_BILLING_TEST env var
- [x] Syncs subscription status from Shopify
- [x] Supports INR and USD with explicit pricing (no auto-conversion)
- [x] Revenue share billing job processes and records usage

## Key Files
- src/lib/shopify-billing/client.ts - GraphQL client for Shopify Admin API
- src/lib/shopify-billing/subscriptions.ts - Subscription creation, status, usage recording
- src/lib/shopify-billing/plans.ts - Plan pricing/caps per currency
- src/lib/shopify-billing/service.ts - Billing service integration
- src/app/api/jobs/process-billing/route.ts - Cron job for revenue share
- src/lib/jobs/processRevenueShareBilling.ts - Usage charge calculation/recording

## Billing Model
- Recurring: Monthly/yearly charges for Growth/Pro plans through Shopify
- Usage-based: Revenue share recorded as capped usage charges (AppUsagePricing) 
- Shopify is merchant-of-record (bills through merchant's Shopify invoice)

All billing tests pass (19/19). Implementation follows Shopify App Pricing best practices.
