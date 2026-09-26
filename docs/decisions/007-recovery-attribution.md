# ADR-007 — Recovery attribution is evidence-based

## Context
Marketing SaaS products commonly inflate recovery metrics by counting "message
sent" as "recovered". CartGain's revenue-share model means attribution must be
defensible.

## Decision
Recovery attribution requires **conversion evidence**, not intent:

- `Message.status` lifecycle: `pending → sent → delivered → failed`.
- A cart is only marked recovered when a conversion event links back to a
  delivered message inside the attribution window (`isMessageAttributable`).
- Refunds are netted out of recovered revenue (`computeRefundNetting`), so an
  order that is later refunded is de-attributed.
- Bargain goals attribute only on *locked deals* delivered as discount codes,
  and net refunds for the revenue share (`attributeBargainGoal`,
  `netBargainGoalRefund`).

## Alternatives considered
- "Click = recovered" — rejected (overshoot).
- "Message sent = recovered" — rejected (no evidence).
- No de-attribution on refunds — rejected (gamed/again inflated metrics).

## Consequences
- Metrics understate optimistic marketing but stand up to audit.
- Slightly more bookkeeping per event; the revenue-share ledger is the
  single source of truth for payouts.

## Status
Accepted. Implemented in `src/lib/attribution.ts`, `src/lib/bargain/goals.ts`.

### Correction noted in audit
My initial Phase-0 audit draft wrongly claimed WhatsApp webhook signature
verification was fail-open. Verified reading of the code: `verifyHubSignature`
returns `false` without an app secret, and the handler **rejects with 401**
(unsigned payloads never pass). The claim was retracted in the final audit.
This is precisely why "the code is the source of truth".