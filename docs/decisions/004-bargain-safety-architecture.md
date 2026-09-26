# ADR-004 — Bargain financial safety: the AI never sets prices

## Context
A storefront bargaining agent has real money consequences. Earlier iterations of
comparable products let the LLM "just negotiate", which invites prompt-injected
floor leaks, rounding breaches and discount stacking.

## Decision
The price pipeline is layered and the last word is always deterministic:

```
Customer → Bargain API → Session State → Product Context
  → Deterministic policy (floor / attempts / campaign / coupons / stock)
  → AI Negotiator (wording + tactic only)
  → validateOffer() + buildExecutablePrice()   ← HARD SAFETY, server-side
  → Response
```

- Prices are computed in **integer minor units** (paise/cents); the invariant
  `chargeMinor >= floorMinor` is enforced at accept time against the
  re-fetched, authoritative Shopify price.
- The merchant floor is never serialized to the browser and never interpolated
  into the AI prompt.
- Session lifecycle is a deterministic state machine
  (`active → accepting → accepted | rejected | expired | abandoned`) — invalid
  transitions are impossible by construction (`negotiation-state.ts`).
- Walk-out/quit phrasing is handled deterministically: the first is a retention
  event, only a second or an exhausted budget closes the session.

## Alternatives considered
- Trusting the LLM's suggested price directly — rejected (financial risk).
- Post-hoc validation without re-fetching Shopify — rejected: permits stale
  prices to be honored after merchant price changes.

## Consequences
- The floor can never leak or be breached by wording, rounding, bulk or coupon
  stacking; the property is covered by property tests (5000-deal fuzz).
- Slightly more work per accept (Shopify re-fetch) — worth it.

## Status
Accepted. Implemented in `src/lib/financial-safety.ts`, `offer-validation.ts`,
`negotiation-state.ts`.