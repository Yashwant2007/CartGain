# ADR-005 — AI boundaries in CartGain

## Context
CartGain uses an LLM for recovery copy, bargain replies, coaching/ROI content
and product answers. Some of those touch financial or compliance-relevant
decision making.

## Decision
The LLM is allowed to decide **what it says**, within a server-side frame; it is
never allowed to decide **numbers, entitlements, state transitions or access**.

| Decision | Owner |
|----------|-------|
| Reply wording, persona, persuasion, product-value arguments | LLM |
| Michnian: counter-offer amount / accept / reject decisions | Deterministic policy + flooring + session rules |
| Deal state (accepted / rejected / expired / abandoned) | Server state machine |
| Merchant floor, discount cap, campaign windows, coupon stacking, stock | Server business rules |
| AuthZ / merchant isolation / webhook identity | Server (sessions, HMAC, ownership checks) |

The LLM prompt carries hidden-floor warnings and a DEAL-STATE rule; its output
passes through the abuse firewall (prompt-injection / jailbreak / exfiltration
detection) before it reaches the customer. Structured output and deterministic
validation guard any numeric fields the model may emit.

## Alternatives considered
- Full trust in model output — rejected.
- Dropping the LLM entirely — rejected: generic copy kills conversion; the
  point is safe delegation.

## Consequences
- A "clever" model cannot lock a below-floor deal, leak the floor, or end a
  session.
- Non-determinism is bounded to copy; money math is reproducible and testable.

## Status
Accepted. Implemented across `src/lib/bargain/*` and the offer/accept routes.