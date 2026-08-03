# Staff Access Policy — CartGain

## Who has access

| System | Access | Reason |
|---|---|---|
| Vercel (deploy, env vars) | Yashwant only | Sole operator |
| Supabase (DB, SQL editor) | Yashwant only | Database administration |
| Cloudflare (DNS, WAF) | Yashwant only | DNS + security |
| Resend / Shopify Partner / Razorpay / WhatsApp | Yashwant only | Provider dashboards |
| GitHub repo | Yashwant + invited collaborators | Code |

## Rules

1. **Minimum privilege**: grant read-only access by default; write access only when required.
2. **2FA required** on all production dashboards: Vercel, Supabase, Cloudflare, Resend, Shopify, Razorpay, Google.
3. **Strong passwords**: minimum 8 characters incl. uppercase + number (enforced app-side on signup, set-password, change-password, reset-password).
4. **No shared accounts**: every staff member gets their own login. No shared passwords.
5. **Staff changes**: revoke access within 24 hours of departure; rotate any secrets the person knew.
6. **Data access**: any staff access to merchant customer data is logged (DataAccessLog) and reviewed weekly.
7. **Remote access**: production DB access only via Vercel server functions or the single admin CLI; never expose the DB publicly.

## If staff grows beyond 1 person

- Add individual Vercel/Supabase team memberships with least-privilege roles.
- Add per-person API keys via `/api/keys` instead of shared service-role keys.
- Introduce a code-review requirement before deploy.
