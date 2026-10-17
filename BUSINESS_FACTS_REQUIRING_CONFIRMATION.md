# Business Facts Requiring Confirmation

This file lists every fact that appears in CartGain's legal/security surfaces but
**cannot be verified from the repository** and must be confirmed by the business
owner (and legally reviewed) before publication. Item numbers are referenced from
the DPA, Privacy Policy, Security Policy, Cookie Policy, and readiness doc.

> Rule: nothing below may be asserted as fact in customer-facing pages until
> confirmed.
>
> **2026-09-13 update:** the literal `[[CONFIRM ...]]` / `[[NOT RUNTIME-CONFIGURED]]`
> placeholder markers no longer render on the production legal pages — they were
> replaced with honest, non-overclaiming wording (e.g. "data region as selected
> in the project dashboard", "US (OpenAI processing)"). The open items below
> remain owner/lawyer confirmations and are tracked in this file; refine the
> published wording once the facts are confirmed.

## A. Legal entity & contact (pages: Privacy, Terms, DPA, Contact)

1. **Legal entity name** — pages use "CartGain" (informal). The legal drafts
   name "CartGain Technologies Private Limited". Confirm the exact registered
   legal name and whether it is incorporated (and if so, where).
   [ACTION REQUIRED]
2. **Registered / contact address** — "Street No. 3, Line Par, Shanker Garden,
   Bahadurgarh, Haryana - 124507" is live on `/contact` and all legal pages but
   is flagged `[ACTION REQUIRED — CONFIRM]` in `cartgain-legal/`. Confirm this is
   the correct, current business address.
3. **Privacy contact / DPA / grievance officer email** — all pages route to
   `support@cart-gain.com`. If a distinct privacy@ / legal@ / grievance-officer
   mailbox is used, update the pages. Confirm a Grievance Officer is nominated
   (DPDP Act requirement).
4. **Security contact** — Security Policy points to `security@cart-gain.com`.
   Confirm this mailbox exists and is monitored 72h-response.

## B. Sub-processors & data location (DPA §6, Security Policy, H7)

5. **Sub-processor agreements** — `cartgain-legal/documents/H7_*`: Razorpay ✅
   executed; MSG91 ⚠️ negotiating; OpenAI ⚠️ API terms + DPA requested; others
   (Vercel, Supabase, Upstash, Resend, Meta, Groq) need status confirmed.
6. **Data regions** — page has placeholders: Supabase region
   `[[CONFIRM DATA REGION]]`, Upstash region `[[CONFIRM DATA REGION]]`, OpenAI /
   Groq processing region `[[CONFIRM PROCESSING REGION]]`, Vercel
   `[[CONFIRM]]`. Get the region from the actual Supabase/Upstash project dashboards.
7. **International transfer safeguards** — Privacy Policy says SCCs / DPDP
   exemptions are relied on `[[CONFIRM TRANSFER SAFEGUARDS PER PROVIDER]]`.
   Confirm which legal bases actually underpin each provider transfer.

## C. Retention & backups

8. **Backup retention window** — DPA says personal data in hosting-provider
   backups is purged per provider retention `[[CONFIRM RETAINED BACKUP WINDOW]]`.
   Confirm Supabase's configured backup schedule/retention for this project.
9. **Logging retention** — access logs 180 days, cart PII 90 days, bargain
   sessions 90 days, verification tokens 7 days — verified in code
   (`src/app/api/jobs/data-retention/route.ts`) and consistent across pages.
   No confirmation needed.

## D. Runtime configuration reality

10. **Messaging/payment providers** — Resend (email), MSG91 (SMS), Meta
    WhatsApp, and Razorpay (billing) are **not runtime-configured** (env empty).
    Legal pages now say "not runtime-configured". Confirm before turning each on.
11. **CDN / bot protection** — Security Policy no longer claims Cloudflare.
    Confirm which edge/CDN the deployment actually uses (Vercel only) and whether
    any edge bot-protection is active before restating.

## E. Observations for the lawyer

12. **DPA breach notification** — committed at **72 hours** (matches
    `docs/incident-response.md`). Confirm 72h is acceptable for enterprise
    merchants vs the 48h/“without undue delay” formulations some purchasers ask for.
13. **`customers/data_request`** — acknowledged + audit-logged only; no
    programmatic export yet. Documented as TODO in the readiness doc. Decide on
    the delivery mechanism before App Store submission.
14. **GDPR/DPDP "alignment" language** — pages now say "designed to align with"
    / "to facilitate compliance with" rather than "we comply with". Confirm the
    tone with counsel before final publish.
15. **Governing law & dispute seat** — DPA/ToS choose India / Bahadurgarh seat
    (legal drafts). Confirm this matches the entity's incorporation and target
    merchant base (EU merchants may request an EU seat).

## F. External service configuration (must be done by the owner)

16. **Transactional email DNS (SPF / DKIM / DMARC)** — verification and
    password-reset emails only arrive if the FROM_EMAIL domain is verified with
    the provider. Required before launch:
    - Add the domain in the Resend dashboard and publish every DNS record it
      shows: **SPF** (TXT on `@`), **DKIM** (CNAMEs), and a **DMARC** TXT record
      on `_dmarc` (start with `p=none`, move to `p=quarantine` once aligned).
    - Confirm BOTH `RESEND_API_KEY` **and** (recommended) the SMTP fallback
      (`EMAIL_SERVER_HOST` / `EMAIL_SERVER_USER` / `EMAIL_SERVER_PASSWORD`) so a
      single-provider failure cannot stop verification mail.
    - The health endpoint reports `checks.email` (`resend`/`smtp`/`configured`)
      so a missing provider is visible rather than silent.
17. **Redis (`REDIS_URL`)** — optional locally, **required in production**.
    Without it, rate limiting and the background queue are in-process and
    per-instance, which multiplies the effective login/register rate limit by the
    instance count and loses queued jobs on cold start. Confirm a managed Redis
    (e.g. Upstash) is provisioned and `REDIS_URL` is set in Vercel.
18. **Shopify per-store webhook signing secret** — each Store row can carry its
    own `webhookSecret` (encrypted); when absent the app falls back to the app's
    `SHOPIFY_API_SECRET`. For custom/self-signed shops, set the per-store secret
    via the store settings (PATCH `/api/stores/current`) so cross-store replay is
    impossible. Confirm the signing secret used by each connected shop.
19. **2FA recovery** — enabling TOTP requires an account password (Google-only
    accounts must set one first), and OAuth sign-in is intentionally blocked for
    2FA-enabled accounts. Confirm the account-recovery/support path for a
    merchant who loses both their authenticator and password.