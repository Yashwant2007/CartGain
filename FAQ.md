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

## 6. Vercel Cron (Replaces Redis)

Added to `vercel.json` — no Redis needed:

```json
"crons": [{
  "path": "/api/jobs/process-carts",
  "schedule": "*/5 * * * *"
}]
```

Runs cart processing every 5 minutes via Vercel Cron (Pro plan). No Redis URL required in env vars.
