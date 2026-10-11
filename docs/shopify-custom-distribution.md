# CartGain — Custom Distribution app (replica of the public app)

This document is the runbook for running CartGain as a **Custom distribution**
Shopify app *in parallel* with the existing **public distribution** app, using
the same codebase. Nothing here modifies or deploys the public app.

Companion files:

| File | Purpose |
|---|---|
| `shopify.app.custom.toml` | App configuration for the custom app (`--config custom`) |
| `.env.custom.example` | Environment template for the custom app's deployment |
| `shopify.app.toml` | The **public** app — unchanged, never touched by this guide |

---

## ⚠️ Read this first: what custom distribution can and cannot do

Custom distribution is **not** "a public app without review". Shopify's rules
(2026):

1. **One merchant per custom app.** Shopify API Terms §2.3.20 forbid making a
   Custom Application available to more than one Merchant. Unrelated merchants
   each require their **own** custom app (own client id/secret).
2. **Store coverage.** A custom app installs on **one production store**, *or*
   on **multiple stores that belong to the same Shopify Plus organization**,
   plus transfer-disabled development stores. The "Allow multi-store installs"
   toggle is for a single Plus org only.
3. **No App Store review and no Shopify Billing API.** You cannot charge through
   Shopify for a custom app, so the custom app uses the **Razorpay "direct /
   custom-app track"** (`Subscription.provider = "razorpay"`, already implemented
   in this codebase).
4. **The distribution method is permanent.** You cannot switch a custom app to
   public distribution later.
5. **Expiring tokens** (mandatory for public apps created on/after 2026-04-01) do
   **not** apply to custom apps — but this codebase already requests per-user
   expiring tokens and refreshes them, so it is correct either way.
6. **Billing via the codebase stays identical** — only the provider differs
   (Razorpay instead of Shopify).

> **Bottom line for "onboard merchants early":** custom distribution works for a
> **small number of design-partner merchants (one app each)** or a **single Plus
> org**, while public review is pending. It is *not* a scalable path to many
> unrelated merchants — that remains the public app. See
> [Scaling beyond one merchant](#scaling-beyond-one-merchant).

---

## Architecture: two apps, one codebase

```
                    ┌─────────────────────────────┐
                    │        This repository       │
                    │  (single Next.js codebase)   │
                    └───────────────┬─────────────┘
            ┌───────────────────────┴────────────────────────┐
            │                                                 │
   ┌────────▼─────────┐                           ┌───────────▼──────────┐
   │  PUBLIC app       │                           │  CUSTOM app           │
   │  shopify.app.toml │                           │  shopify.app.custom   │
   │  client_id 67be…  │                           │  client_id 850b…      │
   │  cart-gain.com    │                           │  custom.cart-gain.com │
   │  Vercel: public   │                           │  Vercel: custom       │
   │  Shopify billing  │                           │  Razorpay billing     │
   └───────────────────┘                           └───────────────────────┘
```

- **Code**: identical. No source changes are required to run the custom app.
- **Shopify app registration**: separate (new client id/secret).
- **Host/deployment/env/database**: separate (so webhook signing and OAuth never
  cross-contaminate).
- **Extensions**: same `extensions/` directory; the CLI deploys them to whichever
  app `--config` selects. Extension `uid`s are source-defined and app-scoped, so
  they can be shared across both apps ([Shopify docs](https://shopify.dev/docs/apps/build/dev-dashboard/migrate-from-partners)).

---

## Prerequisites

- Shopify CLI 4.x (`shopify version`). Verified against `4.9.3`.
- Access to the CartGain **organization's Dev Dashboard**
  (<https://dev.shopify.com/dashboard/224514645> — the Dev Dashboard replaced the
  Partner Dashboard for app development).
- A host for the custom app. Recommended: a **new Vercel project** from this same
  repo, with its own env, on a subdomain such as `custom.cart-gain.com`.
- A **separate database** (see [Data isolation](#data-isolation--operations)).

---

## Step-by-step

### 1. Create the custom app — ✅ done

The app record was created via the Shopify CLI (logged in as
`cartgain192007@gmail.com`, org `CartGain` `224514645`):

```bash
shopify app init --name "CartGain Custom" --organization-id 224514645 \
  --template none
```

Result:

- App name: **CartGain Custom**
- Client ID: `850b64332c8925413d0d6d8d39ede515` — already set in
  `shopify.app.custom.toml`
- The CLI's throwaway scaffold was deleted; only the `client_id` was carried
  into this repo.

The **Client secret** is in the app's **Client credentials** in the Dev
Dashboard → set it as `SHOPIFY_API_SECRET` on the custom deployment.

> The CLI can create the app record but **cannot** set the distribution method
> (`shopify app init` has no distribution flag; the Dev Dashboard exposes it
> only in the UI). Step 2 must be done in the dashboard.

### 2. Select the distribution method

1. On the app's Home, find the **Distribution** card → **Select distribution
   method**.
2. Choose **Custom distribution** → confirm. (Permanent — you cannot change it.)
3. Enter the target store's `myshopify.com` (or `admin.shopify.com`) domain.
   For a single Plus org with several stores, leave **Allow multi-store installs
   for one Plus organization** checked.

### 3. Configure App setup (URLs)

In the app's **Configuration / App setup**:

| Setting | Value |
|---|---|
| **App URL** | `https://custom.cart-gain.com/api/shopify/install` |
| **Allowed redirection URL(s)** | `https://custom.cart-gain.com/api/shopify/callback` |

These mirror the public app exactly (only the host differs). They must match
`shopify.app.custom.toml`.

### 4. Scopes and protected customer data

- The scopes are pushed from `shopify.app.custom.toml` on deploy (identical to
  the public app):
  `read_checkouts,write_checkouts,read_orders,read_all_orders,read_customers,read_products,read_product_listings,read_discounts,write_discounts`.
- Because CartGain reads **customer and order** data, request **Protected
  customer data** access in the app's **API access** page (same as the public
  app). This is required even for custom apps.

### 5. Link the config locally — ✅ done

`client_id` is already filled in `shopify.app.custom.toml`. Verify the link:

```bash
shopify app info --config custom      # App name: CartGain Custom
shopify app config validate --config custom
```

(To re-link at any time: `shopify app config link --config custom` — it writes
the real `client_id` and adds an entry in `.shopify/project.json`. Both are safe
for the public app.)

### 6. Deploy the code to the custom host

Create a **second Vercel project** pointing at this repo (a separate project so
the public deployment is untouched). Set the environment from
`.env.custom.example`, with at minimum:

- `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` → the **custom** app's credentials
- `NEXT_PUBLIC_APP_URL` / `NEXTAUTH_URL` → `https://custom.cart-gain.com`
- `NEXTAUTH_SECRET`, `SHOPIFY_OAUTH_STATE_SECRET`, `ENCRYPTION_KEY`, `JOB_SECRET`
- `DATABASE_URL` / `DIRECT_URL` → the **custom** database
- `RAZORPAY_*` → custom-app billing
- `OPENAI_API_KEY`, WhatsApp/Email/Redis vars as needed

> The code reads only `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` for OAuth,
> callback verification, webhook HMAC and session tokens. `SHOPIFY_API_SCOPES`
> is unused at runtime (scopes come from `src/lib/shopify-oauth.ts`).

### 7. Deploy the app config + extensions to the custom app

```bash
shopify app deploy --config custom
```

- The **first** run should be interactive: the CLI maps the existing extensions
  (theme `storefront-bargain`, checkout `cart-gain-bargain`) to the custom app.
  Accept the prompts. The source-defined `uid`s are shared across apps, so no
  file changes are expected.
- For CI afterwards: `shopify app deploy --config custom --allow-updates`.

This also registers the webhooks declared in `shopify.app.custom.toml`
(functional + the three compliance topics). At install time the app additionally
registers the same webhooks at runtime via `setupShopifyWebhooks()` — both point
at `https://custom.cart-gain.com/api/webhooks/shopify`.

### 8. Install and verify

1. In the Dev Dashboard, **Distribution** card → **Manage custom install link** →
   generate the link for the target store.
2. Send it to the store owner. After they approve, they open the app; the app
   URL (`/api/shopify/install`) verifies the HMAC and starts OAuth, and the
   callback provisions the User + Store + free Subscription and lands them in the
   dashboard — exactly like the public app.
3. Verify:
   - `GET https://custom.cart-gain.com/api/health`
   - Complete one storefront bargain session and one abandoned-cart flow.
   - Send a test webhook from the Dev Dashboard and confirm `200` in the app's
     logs.

---

## Billing on the custom app (Razorpay track)

The codebase already supports two billing providers
(`prisma/schema.prisma` → `Subscription.provider`):

- `"shopify"` — App Store track (public app).
- `"razorpay"` — **direct / custom-app track** ← the custom app uses this.

No code change is required: the Shopify-billing-specific route/webhook
(`app_subscriptions/update`) simply never fires for a custom app. Checkout for
paid plans goes through the existing Razorpay endpoints
(`/api/payments/create-subscription`, `/api/payments/webhook`).

---

## Data isolation & operations

- **Use a separate database** for the custom app. Webhook routing is keyed on the
  shop domain (`prisma.store.findFirst({ where: { domain } })`) and `Store` has a
  unique `[userId, domain]` constraint. Sharing one database across both apps
  would let the same shop map to two different app installs and cross-route
  events. A separate DB (or at least a separate schema) avoids this entirely.
- **Separate Redis / queues** recommended for the same reason.
- **Separate `JOB_SECRET`** and cron configuration on the second Vercel project
  (`vercel.json` crons run per-project).
- **Rotate nothing on the public app.** The custom app has its own credentials;
  changing them never affects the public app.

---

## Running both apps side by side (cheat-sheet)

| Task | Public app | Custom app |
|---|---|---|
| Config file | `shopify.app.toml` | `shopify.app.custom.toml` |
| Dev | `shopify app dev` | `shopify app dev --config custom` |
| Deploy config+extensions | `shopify app deploy` | `shopify app deploy --config custom` |
| Validate config | `shopify app config validate` | `shopify app config validate --config custom` |
| Make a config default for shell | `shopify app config use` | `shopify app config use custom` |

> **Golden rule:** every CLI command for the custom app passes
> `--config custom`. A bare `shopify app deploy` targets the **public** app.

---

## Scaling beyond one merchant

Because one custom app = one merchant, onboarding N unrelated merchants means N
custom apps. For a **handful** of design partners that is manageable:

1. Create a second app in the Dev Dashboard (repeat Step 1–4).
2. Duplicate the config: `cp shopify.app.custom.toml shopify.app.<merchant>.toml`
   and set its `application_url`, redirect URL and (via
   `shopify app config link --config <merchant>`) its `client_id`.
3. Deploy with `shopify app deploy --config <merchant>`.

Each custom app needs its own set of credentials. You can serve several apps from
one deployment if you route by request host + verify against multiple secrets —
but that requires code changes and is deliberately **out of scope** here (it
risks the public app). The clean, low-risk shape is: one custom app → one
deployment/env.

For **many unrelated merchants**, the correct path is the **public app** (with
review). Custom distribution bridges the gap only for a few early partners.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `--config custom` errors immediately | `client_id` may have been reset. Run `shopify app config link --config custom` (or restore `850b64332c8925413d0d6d8d39ede515`). |
| Install link installs the app but nothing happens | The custom install link can carry `no_redirect=true`; after installing, open the app from the admin so `/api/shopify/install` runs OAuth. |
| Webhooks `401 Invalid signature` | `SHOPIFY_API_SECRET` on the custom deployment is not the custom app's secret (or has a trailing newline). Compare `secretFp` in logs against the app secret. |
| App opens but shows public app's data | Two deployments are pointing at the same database. Use a separate DB. |
| Extensions missing on the custom app | Run `shopify app deploy --config custom` interactively once to map extensions. |
| Cannot install on second merchant's store | Expected — one custom app per merchant. Create another custom app. |

---

## Reference

**Routes (unchanged across both apps)**
`/api/shopify/install` · `/api/shopify/callback` · `/api/shopify/connect` ·
`/api/shopify/session-token` · `/api/shopify/pending-install` ·
`/api/shopify/health` · `/api/webhooks/shopify`

**Webhooks**: `carts/update, checkouts/create, checkouts/update, orders/create,
orders/cancelled, refunds/create, app/uninstalled, app_subscriptions/update` +
compliance `customers/data_request, customers/redact, shop/redact`.

**Scopes**: see `src/lib/shopify-oauth.ts` (`SHOPIFY_OAUTH_SCOPES`) and
`shopify.app.custom.toml`.

**Extensions**: `extensions/storefront-bargain` (theme),
`extensions/cart-gain-bargain` (checkout UI).

**Env**: `.env.custom.example` (custom) vs `.env.example` (shared reference).
