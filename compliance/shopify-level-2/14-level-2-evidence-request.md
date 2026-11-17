# 14 — Level 2 Request and Safe Fallback

## What Shopify requires

From **2026-11-23**, `AbandonedCheckout.abandonedCheckoutUrl` is Level 2
protected customer data. Without Level 2, the field returns `ACCESS_DENIED`.
Names/emails/phones already require Level 2 for this app.

## What to request

In Dev Dashboard → API access requests → Protected customer data, request:

1. **Protected customer data** for abandoned-cart recovery, AI price negotiation
   and privacy/data-subject compliance. Reads only; the only write is discount
   creation.
2. **Fields:** Name, Email, Phone, and the abandoned-checkout recovery URL.
   Do **not** request street address — the app does not persist it.
3. Point the reviewer to this pack, `/privacy`, `/dpa`, and
   `docs/security/shopify-review.md`.
4. Ask Partner Support explicitly: “Confirm Level 2 access for
   `AbandonedCheckout.abandonedCheckoutUrl` for app
   `gid://shopify/App/390792151041` before 2026-11-23.”

## Implemented fallback (works with or without approval)

- `fetchAbandonedCheckoutsDetailed` Query A never selects the URL. Query B is
  optional and requests only `id` + `abandonedCheckoutUrl`.
- On denial: `Store.abandonedCheckoutUrlAccess = ACCESS_DENIED` for 6 hours;
  core checkout data still syncs; an alert and audit entry record status counts
  only.
- On retrieval failure/invalid URL: status `RETRIEVAL_FAILED` /
  `EXPIRED_OR_INVALID`; no direct link is offered.
- Per-cart `Cart.recoveryUrlStatus` tells the link builder whether a safe resume
  link exists. If not, links stay in the recovery flow (`/cart/<id>`) and the
  cart page shows “Continue Shopping” to the merchant storefront.
- The full URL is AES-256-GCM encrypted, never logged/exported/sent to AI, and
  cleared by retention. If `ENCRYPTION_KEY` is missing it is not persisted.

## Current approval state

⛔ **Not confirmed.** The app is in App Store review, so the Dev Dashboard
protected-data page is unavailable. This is a Shopify-side blocker; do not claim
approval in the submission. Keep the fallback in place and attach Partner
Support's response when received.

## Evidence to attach when approved

- Dev Dashboard screenshot showing Level 2 access and the requested fields.
- One production log/DB row showing `abandonedCheckoutUrlAccess = AVAILABLE`
  and a cart with a safe checkout/resume link.
- One denial simulation or pre-approval row showing `ACCESS_DENIED` and the
  fallback CTA, proving no fabricated URL.
