# CartGain FAQ — WhatsApp, OpenAI & Shopify Partners

## 1. Meta WhatsApp Templates

**Two templates needed in Meta Business Manager:**

| Template | Category | Body |
|---|---|---|
| `abandoned_cart_reminder` | Marketing | `Hi {{1}}, you left items in your cart! Total: {{2}}. Complete your order: {{3}}` |
| `cart_discount_offer` | Marketing | `Hi {{1}}, here's {{2}}% off! Use code {{3}}. Shop now: {{4}}` |

**Steps:**
1. Go to https://business.facebook.com → WhatsApp Manager → Template Manager → Create Template
2. Category: Marketing
3. Name must match exactly (`abandoned_cart_reminder`)
4. Add body with `{{1}}` placeholders, "View Cart" URL button
5. Submit — approval takes 24-72 hours

---

## 2. OpenAI Billing

**Model**: `gpt-4o-mini` — $0.15/1M input, $0.60/1M output tokens

| Volume | Monthly cost | Credit to add |
|---|---|---|
| 3,000 carts (Growth) | ~₹48/mo | **$10** (lasts 8+ months) |
| 10,000 carts | ~₹160/mo | **$25** |

**Setup**: https://platform.openai.com/account/billing → "Add to credit balance" → no subscription needed, it draws down per-token.

**Note**: When credits run out, CartGain falls back to heuristic text (no crashes, no AWS bills).

---

## 3. WhatsApp API — Actual Cost

**Only pay per conversation. No platform fee, no template fee, no monthly fee.**

| Category | India rate (Meta wholesale) |
|---|---|
| Marketing (your templates) | ₹0.78/conversation |
| Utility | ₹0.12-0.35/conversation |
| Service (customer replies) | Free |

**At Growth tier (3,000 carts, ~900 get WhatsApp):**
- 900 × ₹0.78 = **₹702/month** at worst
- If classified as Utility: 900 × ₹0.12 = **₹108/month**
- Your plan charges merchant ₹2,999 — ample margin

---

## 4. WhatsApp Phone Number — How It Works

**You need a dedicated business number.** Your personal WhatsApp number used during sandbox testing won't work in production.

| Option | Cost | How |
|---|---|---|
| New Jio/Airtel SIM (recommended) | **₹199 one-time** | Buy SIM, never install WhatsApp on it; use only for SMS verification |
| Virtual number (Twilio) | ~₹85-170/mo | Auto-verifiable via API |
| Existing landline | Free | Must receive verification SMS/call |

**Steps:**
1. Buy ₹199 SIM → insert in any phone → receive SMS
2. In Meta Business Manager → WhatsApp Manager → Phone Numbers → Add Number
3. Enter number, receive verification code → done
4. Set `WHATSAPP_PHONE_NUMBER_ID` in Vercel env vars

---

## 5. Shopify Partners App — Why It's Necessary

The app you created in Shopify Partners is the **OAuth bridge** between CartGain and every merchant's store.

Without it:
- No abandoned checkout data (can't call Shopify API)
- No webhooks (can't know when a cart is abandoned)
- No App Bridge for Shopify embed
- No API tokens at all

**One app in Partners = all merchants connect through it.** It's invisible to the merchant — they just click "Install" and CartGain gets access.

---

## 6. Cart sweep scheduling (Replaces Redis)

Cart processing runs every 5 minutes. On Vercel **Pro** add it to `vercel.json`:

```json
"crons": [{ "path": "/api/jobs/process-carts", "schedule": "*/5 * * * *" }]
```

Vercel auto-attaches `Authorization: Bearer $CRON_SECRET` to cron requests (or
`JOB_SECRET`, both are accepted by the route).

On the **Hobby** plan Vercel refuses sub-daily crons, so the sweep is driven by
`.github/workflows/process-carts.yml` instead (GitHub Actions `*/5 * * * *`,
manual `workflow_dispatch` also available). It needs a repository secret
`JOB_SECRET` matching the production env var. GitHub can run a few minutes late
and disables schedules after 60 days of repository inactivity — re-enable it if
recovery goes quiet.

### Primary scheduler: Supabase `pg_cron` (no Vercel Pro needed)

Vercel **Hobby** refuses any cron that runs more than once a day, and GitHub's
scheduler is best-effort (it can skip hours). The production Supabase database
therefore calls the sweep directly every 5 minutes:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('<JOB_SECRET>', 'cartgain_job_secret');

create or replace function public.cartgain_sweep() returns bigint
language plpgsql security definer set search_path = public, net, vault as $$
declare token text; req bigint;
begin
  select decrypted_secret into token from vault.decrypted_secrets
   where name = 'cartgain_job_secret' limit 1;
  select net.http_get(
    url := 'https://cart-gain.com/api/jobs/process-carts',
    headers := jsonb_build_object('Authorization', 'Bearer ' || token),
    timeout_milliseconds := 120000) into req;
  return req;
end $$;

select cron.schedule('cartgain-sweep', '*/5 * * * *', 'select public.cartgain_sweep()');
select cron.schedule('cartgain-net-cleanup', '25 3 * * *',
  $$delete from net._http_response where created < now() - interval '2 days'$$);
```

The secret never appears in `cron.job`. Both this job and the GitHub workflow
call the same endpoint; whichever runs first claims a 4-minute Redis slot and
the other returns `status: "skipped"`, so the sweep runs once per slot no matter
how many triggers exist. Inspect it with
`select * from cron.job_run_details order by start_time desc limit 5;` and
`select status_code, content from net._http_response order by id desc limit 5;`.

No Redis URL is required for either option.
## 7. Email delivery receipts (Resend webhook)

"Sent" means Resend accepted the message; "delivered" comes only from Resend's
own receipt. Wire it once:

1. resend.com → **Webhooks** → **Add Endpoint**
2. URL: `https://cart-gain.com/api/webhooks/email`
3. Events: `email.delivered`, `email.bounced`, `email.complained`
   (`email.delivery_delayed` and the rest are ignored safely)
4. Copy the endpoint's **Signing Secret** (`whsec_…`) into Vercel as
   `RESEND_WEBHOOK_SECRET` (Production) and redeploy.

`GET /api/health` lists it under optional env; the route answers `401` to
unsigned requests by design. Delivery, bounce and spam-complaint events then
flip the matching `Message` row (matched on `Message.providerId` = Resend
`email_id`) to `delivered` or `failed`. Nothing is guessed at send time.

Now here's the pitch as if you're selling to your first merchant
"You're leaving money on the table every single hour."

70% of people who add items to their cart never come back to buy. Not because they don't want your products — because life got in the way.

CartGain brings them back — automatically.

Here's exactly how it works:

1. A customer adds products to cart on your Shopify store, then leaves
2. CartGain detects it instantly
3. Within minutes, we send them a personalized reminder via email and WhatsApp — whichever channel converts best
4. They click the link, return to their cart, and complete the purchase

The result: You recover ~15-25% of sales you were otherwise losing to thin air.

For a store doing ₹5L/month in revenue with 70% cart abandonment, that's ₹70,000-1,17,000/month recovered.
You pay ₹2,999/month (Growth plan).

Your net gain: ₹67,000-1,14,000/month.

Setup takes 5 minutes. Click "Install" → connect WhatsApp → done. We handle everything from there — the AI writes the messages, the cron runs every 5 minutes, the analytics show you exactly what's working.

You don't need a marketing team. You don't need to write a single email. You don't need to know any of the tech — the Shopify Partners app, OAuth, webhooks, cron jobs — that's all invisible to you.

You just get more sales. Simple.