# Storefront Bargain — Architecture (Drawer Upgrade)

*Status: authoritative. Documents the storefront mechanism before and after the
drawer-phase upgrade (themes, controller JS, and the widget's `view=drawer`
mode). Policy/safety (floors, attempts, offers) lives in the Bargain API and is
unchanged by this doc.*

## 1. Mechanism at a glance

Bargaining never runs inline on the theme. The storefront renders a **native CTA**
and a small controller. The actual negotiation UI is the widget at
`https://cart-gain.com/bargain/embed`, hosted in an **iframe**.

```
Shopify theme
 ├─ Theme App Extension "storefront-bargain" (extension uid a5c5cb13…)
 │   ├─ blocks/product-bargain.liquid   (product page CTA + variant map)
 │   ├─ blocks/cart-bargain.liquid      (cart page CTA)
 │   ├─ blocks/bargain-embed.liquid     (fallback floating launcher, app embed)
 │   └─ assets/bargain.js               (shared drawer controller)
 │   └─ assets/bargain.css              (drawer/sheet > theme, safely scoped)
 └─ bargain.js renders a fixed drawer that hosts:
      https://cart-gain.com/bargain/embed?…&view=drawer   (Next.js widget)
```

`extensions/cart-gain-bargain/` is a **checkout** UI extension
(purchase.checkout.block.render + thank-you) and is unrelated to the storefront
mechanism. The storefront always negotiates **before** checkout via a real
Shopify discount code issued by the Bargain API.

## 2. Why a drawer (design) vs the old embedded panel

| Concern | Old (inline iframe panel) | New (drawer / sheet) |
|---|---|---|
| Product page layout | iframe injected into theme block flow, height-driven | page untouched; overlay drawer |
| Mobile | squeezed an in-flow iframe into a column | full-screen sheet, safe-area padded |
| Session | iframe persisted on the page | same iframe **kept alive** on close (hidden) → session survives reopen |
| Theme dependence | needed `cg_resize` height negotiation (clamped 60–2400) | widget simply fills 100% of the drawer; no height protocol in drawer mode |
| Variant changes | manual/absent | optional `cg_product_update` from `data-cg-variants` map |

Requirements honored by the upgrade (per the 63-section spec):

- **No parallel injection mechanism.** The same Theme App Extension
  (`storefront-bargain`) is upgraded in place; no new embed/script path.
- **Floor secrecy preserved.** Liquid serializes only public Shopify product
  data (id, listed price, image). Floors/margins live only in the server's
  session state machine — they never reach HTML, JS, the iframe URL, storage,
  analytics, or logs. `bargain.js` pushes only variant id/price/image.
- **Accessible & theme-safe.** Esc, scrim click, launcher focus return, reduced
  motion, tiny z-index scale (10000/10001) that stays above theme content; all
  styles are `.cg-bargain-*` scoped; safe-area insets on mobile.

## 3. Controller protocol (local, the only cross-origin surface)

The iframe is `sandbox="allow-scripts allow-same-origin allow-forms
allow-popups"` with an `origin` referrer policy. Messages are namespaced `cg_*`;
anything else is ignored by both sides.

| Direction | type | Meaning |
|---|---|---|
| widget → parent | `cg_resize` | proposed iframe height (ignored in drawer mode) |
| widget → parent | `cg_empty` | no active store / invalid params → controller hides the block + closes drawer |
| widget → parent | `cg_close` | drawer close button (or end-of-flow) pressed |
| parent → widget | `cg_get_height` | (kept for non-drawer embeds) |
| parent → widget | `cg_product_update` | `{variantId, price?, image?}` selected on the theme page |

`cg_product_update` is pushed (a) immediately on open and again ~450 ms later
(so a first-time iframe load still binds the pre-selected variant), and (b)
when the controller observes a variant change on the page (debounced 250 ms,
best-effort, theme-agnostic selectors). The widget applies it to its product
context and, if the session hasn't started yet, starts negotiation from it.

## 4. Widget `view=drawer` behavior

- Root fills 100% of its host; scroll/visibility are owned by the theme
  controller, not the widget.
- Session start is deferred ≤500 ms or until the first `cg_product_update`
  arrives, so a variant chosen before open is bound into the START call.
- The widget's close button posts `cg_close` (controller hides the drawer,
  restores page scroll, returns focus); because the same iframe stays mounted,
  React state and the session survive close → reopen. Opening a *different*
  product block re-points `iframe.src` and reloads (a per-product session).

## 5. Add-to-cart (unchanged, server-authoritative)

Accepting a deal hits the Bargain `accept` route, which applies a Shopify
`DiscountCode` bound to the store + discount ownership (customer fingerprint /
cart token / email). The widget shows the code and a "go to cart" link. No
price is ever committed client-side; the server returns the final price/code.

## 6. File map

| File | Role |
|---|---|
| `extensions/storefront-bargain/blocks/product-bargain.liquid` | product CTA, `data-cg-src/variant/variants`, build widget src (public Liquid data only) |
| `extensions/storefront-bargain/blocks/cart-bargain.liquid` | cart CTA, anchors first cart line |
| `extensions/storefront-bargain/blocks/bargain-embed.liquid` | floating launcher (app-embed fallback), position settings |
| `extensions/storefront-bargain/assets/bargain.js` | drawer lifecycle, variant observer, message handling, scroll/focus restore |
| `extensions/storefront-bargain/assets/bargain.css` | CTA, launcher, drawer/sheet, safe-area, reduced-motion |
| `extensions/storefront-bargain/locales/en.default.json` | theme-editor labels |
| `src/app/bargain/embed/page.tsx` | widget host; resolves store + config; decodes theme-encoded params; `view` passthrough |
| `src/components/bargain/BargainWidget.tsx` | widget controller (`view` prop, `cg_product_update`, `cg_close`) |
| `src/components/bargain/BargainPrimitives.tsx` | extracted presentational widgets |
| `src/lib/bargain/api-types.ts` | typed cross-frame + API message contract |
| `src/lib/bargain/offers.ts` | floor-safe quick-offer chips (`QUICK_OFFER_DISCOUNTS`) |
| `src/lib/bargain/intent.ts` | deterministic shopper-intent/objection/budget classifier (WHAT they want) |
| `src/lib/bargain/behavior.ts` | deterministic social-signal classifier (HOW they talk): self-shared name, greeting, tone (terse/verbose/polite), emotion (frustrated/skeptical/hesitant/apologetic/playful/excited), urgency, enthusiasm, ALL-CAPS, demands, question, re-asks |

Deployable output is a **theme app extension**: `npx shopify app build`/
`deploy` regenerates `.shopify/deploy-bundle/<uid>/` (gitignored). The tracked
canonical source is `extensions/storefront-bargain/`.

### Conversation-warmth layer (how replies stop being "blunt")

Before every `negotiateStep`, the system prompt is enriched — alongside the
intent/strategy blocks — with a **SOCIAL SIGNALS** block from `behavior.ts`:

- A name (`"I'm Rahul"`, `"my name is Priya"`, `"this is Dev"`, `"call me Meera"`,
  plus earlier-in-session names) becomes a one-line instruction to greet/use it
  warmly once, never invent names, and use it ≤2 times per exchange.
- Active signals each emit one mirroring rule (short reply for terse shoppers,
  acknowledge frustration before the number, de-escalate ALL-CAPS/demands,
  reassure the hesitant, address re-asks directly, match politeness/warmth).
- Detection is 100% deterministic and runs BEFORE the LLM (like intent) — the
  model is told what to read and how to respond, it never decides the read.
  Neutral messages add zero bytes to the prompt. Name/emotion detection
  respected product/store/stopword exclusions so "this is Gold…" on a Gold
  product is never read as a name.

## 7. Test coverage

- `src/components/bargain/__tests__/primitives.test.tsx` (jsdom): customer
  offer bubble, FINAL OFFER labeling, "never render a price the server didn't
  send", state card actions, product context, cart badge, disabled chips,
  keyboard/typing states.
- `src/lib/bargain/__tests__/offers.test.ts`: floor-safe quick chips.
- `src/lib/bargain/__tests__/behavior.test.ts`: name detection honesty
  (introductions yes, "this is amazing"/negations/product words no), tone and
  emotion reads, urgency/caps/demands/re-asks, and that the prompt block only
  emits mirroring rules for signals that are really present.
- `src/lib/bargain/__tests__/` (API/negotiation suites): server-price
  authority, financial-safety fuzz.

## 8. Known constraints

- The full negotiation/financial-safety policy is documented in
  `docs/decisions/004-bargain-safety-architecture.md`; the drawer changes no
  policy — only surface it.
- The drawer's variant observer is best-effort across themes; when a theme
  exposes no recognizable variant state, the widget negotiates the default
  variant (single-product-catalog accuracy unchanged).
- `jsx: preserve` (Next) means ts-jest needs a separate transform config for
  `.tsx` tests (`tsconfig.jest.json`, wired in `jest.config.js`).
- `.shopify/deploy-bundle` is build output; always deploy via the Shopify CLI
  so the bundle matches `extensions/storefront-bargain/`.