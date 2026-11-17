# 07 — Consent and Opt-Out

## Recovery messaging

- Email requires an explicit `consentEmail` or a documented transactional
  Shopify cart/checkout basis, and is blocked by `OptOut`/suppression.
- WhatsApp always requires explicit `consentWhatsApp` **and** a consented
  identity phone. Consent is never inferred from Shopify marketing flags.
- Storefront capture and the checkout UI extension collect explicit checkboxes;
  the public `/api/recovery/opt-in` endpoint stores provenance and never sets
  consent for a channel the shopper did not select.
- `src/lib/recovery/eligibility.ts` is the fail-closed eligibility gate;
  `src/lib/opt-out.ts` is the canonical suppression layer.

## Opt-out

- STOP/unsubscribe persists an `OptOut` row for email and phone, cancels pending
  work and suppresses the identity on both channels.
- Suppression is checked before every send; opt-out records are retained while
  the merchant is active to keep honoring the choice.
- Inbound keywords are intentionally narrow (START/UNSTOP/SUBSCRIBE/OPTIN) so an
  ambiguous “yes” cannot be treated as marketing consent.

## AI decision opt-out

- “Skip AI, buy at full price” ends the negotiation and does not generate a
  discount.
- `aiPaused` / `emergencyPaused` controls can force the deterministic engine or
  stop new sessions.

## Data-subject requests

- `/api/recovery/opt-in` (public) and the merchant recipient page can record
  consent/opt-out with source and timestamp.
- `customers/redact` removes carts, messages, identities, opt-outs, bargain
  sessions, journeys and DSR exports for that customer. It now also matches by
  email/phone found on the customer's carts when Shopify omits them from the
  payload.
- `customers/data_request` produces a merchant-downloadable export.
