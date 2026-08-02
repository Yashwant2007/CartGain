# Email deliverability — Fix cart-gain.com (PRIORITY)

## Why forgot-password emails don't arrive

The API works (verified live: token created, Resend accepted the send, HTTP 200).
**The emails are being silently dropped by Gmail/Outlook** because `cart-gain.com`
is NOT set up for sending in DNS:

| Record | Status |
|---|---|
| Resend DKIM (`resend._domainkey.cart-gain.com`) | ❌ MISSING |
| Resend SPF (`include:spf.resend.com`) | ❌ MISSING (only Cloudflare mail routing SPF exists) |
| DMARC (`_dmarc.cart-gain.com`) | ❌ MISSING |

Result: emails sent via Resend fail SPF/DKIM → Gmail junk-folds or rejects them.

## Option A (recommended): Verify cart-gain.com in Resend

1. Login: https://resend.com/domains → **Add Domain** → `cart-gain.com`
2. Resend shows 3 DNS records. Add them in Cloudflare (domain is on Cloudflare: `amir.ns.cloudflare.com`):
   - **SPF TXT**: `v=spf1 include:spf.resend.com ~all` (merge with existing SPF: `v=spf1 include:_spf.mx.cloudflare.net include:spf.resend.com ~all`)
   - **DKIM TXT/CNAME** (usually `resend._domainkey` → Resend value)
   - **DMARC TXT**: `v=DMARC1; p=quarantine; rua=mailto:reports@cart-gain.com`
3. Click **Verify** in Resend. Status: `Verified` (takes up to 5 min for DNS propagation)
4. Confirm `FROM_EMAIL=noreply@cart-gain.com` in Vercel (or leave empty — code defaults to it)

## Option B: Use a verified SMTP relay (works immediately, no DNS wait)

Any SMTP provider whose domain you've verified (Brevo/Mailgun/Gmail SMTP).
Set in Vercel (Production):

```
EMAIL_SERVER_HOST=smtp-relay.brevo.com
EMAIL_SERVER_PORT=587
EMAIL_SERVER_USER=<your-smtp-username>
EMAIL_SERVER_PASSWORD=<your-smtp-password>
FROM_EMAIL=noreply@your-verified-domain.com
```

The app tries Resend first, falls back to SMTP automatically if Resend fails.

## Verify after fixing

```bash
# Request a reset (registered email → check spam too)
curl -X POST https://cart-gain.com/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"yashwantkaushik43@gmail.com"}'
```

Check with: https://dns.google/resolve?name=resend._domainkey.cart-gain.com&type=TXT
(or use mxtoolbox.com/spf).

*Notes: `send.cart-gain.com` has leftover Amazon SES records from an old setup — can be
cleaned up later; not blocking.*
