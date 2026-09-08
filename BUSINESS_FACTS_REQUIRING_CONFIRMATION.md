# Business Facts Requiring Confirmation

This file lists every fact that appears in CartGain's legal/security surfaces but
**cannot be verified from the repository** and must be confirmed by the business
owner (and legally reviewed) before publication. Item numbers are referenced from
the DPA, Privacy Policy, Security Policy, Cookie Policy, and readiness doc.

> Rule: nothing below may be asserted as fact in customer-facing pages until
> confirmed. Everything is phrased with `[[CONFIRM ...]]` placeholders or honest
> caveats in the pages.

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