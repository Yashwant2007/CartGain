# Revenue Engine — Canonical Attribution Model & Financial Safety Invariants

**Sprint:** Day 8–10 Revenue Engine Adversarial Testing & Financial Safety
**Status:** Implemented in `src/lib/attribution.ts` and `src/lib/financial-safety.ts`
**Applies to:** every "recovered cart / recovered revenue" number and every bargain discount code.

---

## 1. Attribution model

A purchase is credited as a CartGain recovery **only when evidence shows CartGain caused or
materially contributed to it**. When it cannot, it is **not** attributed — never "same customer
bought something later." Every condition below is mandatory.

### 1.1 Eligibility (all must hold)

| # | Condition | Evidence in code |
|---|-----------|------------------|
| 1 | An order for **exactly this cart** (token binding `store.cartId == order token`) | `processOrderCreate` in `src/app/api/webhooks/shopify/route.ts` |
| 2 | Cart tree appears in both **token families** (`data.token` checkout token preferred, `data.cart_token` fallback) so a single abandonment is caught whichever webhook recorded it | token-fallback logic in `processOrderCreate` |
| 3 | A recovery message was **sent** (`status ∈ {sent, delivered}`) to that cart | `isMessageAttributable` |
| 4 | Message sent **before** the order (`sentAt <= orderCreatedAt`) | `isMessageAttributable` |
| 5 | Message sent **within `ATTRIBUTION_WINDOW_HOURS` (72h)** before the order | `isMessageAttributable` + `ATTRIBUTION_WINDOW_HOURS` in `src/lib/payment.ts` |
| 6 | Same store (cross-tenant never matches; carts keyed `(storeId, cartId)`) | cart lookup scope |
| 7 | Order **never credited before** — one credit per `shopifyOrderId` (unique index) | `@@unique([shopifyOrderId])` on `RecoveredCart` |

**Explicitly NOT attributed:**
- A purchase from a *different* cart (different token) — even for the same customer.
- An order created before the recovery message was sent.
- A cart converted within the window but with **no** sent/delivered message (e.g. the customer
  returned before any campaign message went out).
- Orders from other stores or a store the app was uninstalled from.

### 1.2 Revenue definition

```
recoveredRevenue  = netRevenue                     = max(0, grossOrderTotal − orderDiscounts)
recognizedRevenue = max(0, netRevenue − cumulativeRefunded)
```

- `recoveredValue` on `RecoveredCart` = gross order total (what the order rang up).
- **Reporting (`Analytics.revenueRecovered`) credits `netRevenue`** — what the merchant actually
  collects, excluding tax/shipping-adjacent gross inflation and excluding order discounts.
- A `refunds/create` or `orders/cancelled` webhook **nets** the day's recognized revenue by the
  gross amount returned to the customer. A full reversal also decrements `cartsRecovered` by one.
  (Both clamped ≥ 0; the day decremented is the day the refund is *recorded* — documented,
  position-style metric.)

### 1.3 Netting invariants (pure, unit-tested)

`computeRefundNetting` (`src/lib/attribution.ts`) is deterministic and idempotent:

1. `newTotalRefunded = min(recoveredValue, prevTotalRefunded + refund)` — never refund more than recovered value.
2. `recognizedNet = max(0, netRevenue − newTotalRefunded)` — never negative revenue.
3. Full reversal → `analyticsCartsDelta = −1`; partial → `0`.
4. **Revenue-share reversal only when uninvoiced** (`invoiceId == null`). Invoiced events are
   frozen; they raise an ops alert for manual billing reconciliation rather than silently
   mutating closed books.

---

## 2. Financial safety layer (bargain engine)

The merchant minimum price is a **hard mathematical constraint outside the AI's authority**.
`src/lib/financial-safety.ts` is the single implementation of every money rule; the bargain
routes and discount generator are thin callers.

### 2.1 Invariants (unit + property-tested)

| # | Invariant | Enforcement |
|---|-----------|-------------|
| M1 | All money compared in **integer minor units** (`toMinorUnits` = `Math.round(x*100)`) — no float drift can hide a breach | `financial-safety.ts` |
| M2 | Charged unit price **≥ merchant floor**: `chargedUnitPriceMinor(original, percent) ≥ floorMinor` | `buildExecutablePrice`, `isAtOrAboveFloor` |
| M3 | **Below-floor agreements are REJECTED, never silently clamped up-stream** (stale merchant price ⇒ `409`) — the customer is never charged more than agreed without consent | accept route `below_floor → 409` |
| M4 | Discount **percent is exact** (`exactPercentOff`, ≤ 2 decimals). Integer rounding (the old `Math.round`) could drop the charged price below the floor — the fuzz test proves the exact-percent path cannot | `exactPercentOff` |
| M5 | **Bulk-negotiated price is quantity-bound** via `minimumSubtotal = originalPrice × bulkQuantity`. A 5-unit floor price can't be used on 1 unit, undercutting the single-unit floor | `buildExecutablePrice.minSubtotalMinor` |
| M6 | Accept **re-fetches the authoritative Shopify price**; the floor is derived from the *current* price, not the stale start snapshot | accept route (`fetchShopifyProductPrice`) |
| M7 | **Only real AI counters are accept-able.** AI messages with `decision: 'chat'` never persist an `offeredPrice`, and the accept route filters `decision ∈ {accept, counter}` — a chat reply can't unlock the floor | offer route + accept route |
| M8 | Order-level (whole-cart) codes are **depth-clamped to the featured product's margin floor** so a ₹1-attack can't become 99%-off-everything | `clampOrderPercentForProduct`, checkout-accept route |
| M9 | One deal metered once — **atomic CAS** (`status: active → accepting → accepted`) prevents concurrent double-accept from double-metering or dual codes | accept route |
| M10 | The discount generator **re-derives the exact percent and re-verifies the floor in minor units**; it never trusts a caller-supplied rounded percent | `discount.ts` |

### 2.2 Known residuals (documented)

- **checkout-accept** (Checkout UI Extension) cannot carry a bargain session, so its owner
  binding is passive. It is protected by M2/M6/M8 + per-shop rate limiting (250 codes/hour).
  If Shopify's price can't be verified it refuses (`503`) — it never falls back to a
  client-supplied price (that would defeat the floor).
- **Refund netting on already-invoiced revenue share** is frozen (see 1.3.4) — surfaced by alert.
- **Existing stores** must have `orders/cancelled` + `refunds/create` webhooks subscribed. The
  subscription list now includes them for new installs; existing stores need a re-run of
  `setupShopifyWebhooks` (or re-install) for those topics to start arriving.

---

## 3. Files

- `src/lib/financial-safety.ts` — money rules + invariants M1–M8, M10.
- `src/lib/__tests__/financial-safety.test.ts` — 28 tests incl. 5,000-deal fuzz + 2,000 below-floor fuzz.
- `src/lib/attribution.ts` — attribution eligibility + refund netting (1.1–1.3).
- `src/lib/__tests__/attribution.test.ts` — eligibility boundaries + netting accumulation/identity.
- `src/lib/__tests__/discount.test.ts` — discount generator never breaches floor, exact-percent.
- `src/app/api/bargain/accept/route.ts` — M3, M4, M6, M7, M9.
- `src/app/api/bargain/offer/route.ts` — M7 (chat fix).
- `src/app/api/bargain/checkout-accept/route.ts` — M2, M6, M8.
- `src/lib/bargain/discount.ts` — M4, M5, M10.
- `src/app/api/webhooks/shopify/route.ts` — attribution + refund netting handlers.
- `src/lib/jobs/processAbandonedCarts.ts` — same-batch customer dedupe.
- `prisma/schema.prisma` — `bargainFloor`, `bulkQuantity`, `refundStatus`, `totalRefunded`,
  `@@unique([shopifyOrderId])`.