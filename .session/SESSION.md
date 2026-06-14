# Session Log

## Last Session — June 14, 2026

### Completed
- Email sending (forgot-password, register, reset-password) via `sendEmail()`
- Live billing tab with Razorpay (`/api/subscription`, `RazorpayCheckout`)
- Shopify OAuth connect/callback with webhook registration
- Onboarding wizard (2-step) on campaigns page
- A/B testing modal + API route
- Notification feed on dashboard (queries existing tables)
- Campaign CRUD, analytics, duplicate, edit pages
- Pricing, forgot/reset-password pages
- RevenueChart component, auth-utils, rate-limit
- UX polish: dark theme fixes, hover states, transitions
- Cleanup of 1,200+ stale agent skill files
- Root `middleware.ts` (NextAuth withAuth), deleted `src/middleware.ts`
- Build & lint pass (zero errors)
- Git commit + push to `origin/master`

### Pending / Next
- Set real production env vars in Vercel
- Run full smoke test on deployed site
- Bug fixes to be reported by user after analysis

### Key Decisions
- Shopify OAuth = custom API routes (not NextAuth provider)
- No new DB models needed for notifications
- State param in Shopify OAuth = base64 `{storeId, userId}`

### Credentials Status
- `.env.local` has placeholders (test creds) — needs real values in Vercel
- `EMAIL_SERVER_USER`/`PASSWORD` — replace with real SendGrid/Brevo creds
- `SHOPIFY_API_KEY`/`SECRET` — replace with real Shopify app creds
- `NEXTAUTH_URL` — update to production URL in Vercel
