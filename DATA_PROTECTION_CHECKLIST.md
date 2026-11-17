# CartGain Data Protection & Protected Customer Data Checklist

Status as of 2026-11-17. Full reviewer pack:
`compliance/shopify-level-2/README.md`.

## Legal and policy documents

- [x] `cartgain-legal/documents/H1_PRIVACY_POLICY.md` — controller/processor
  roles, data categories, DSRs, retention, checkout recovery URL.
- [x] `H2_TERMS_OF_SERVICE.md`
- [x] `H3_DATA_PROCESSING_AGREEMENT.md` — breach notification, subprocessors,
  security schedule, checkout recovery URL category.
- [x] `H4_COOKIE_POLICY.md`
- [x] `H5_ACCEPTABLE_USE_POLICY.md`
- [x] `H6_REFUND_CANCELLATION_POLICY.md`
- [x] `H7_SUBPROCESSOR_DISCLOSURE.md`
- [x] `H8_BREACH_RESPONSE_PLAN.md`
- [x] `DATA_RETENTION_POLICY.md`
- [x] Public `/privacy`, `/terms`, `/dpa`, `/security-policy`, `/cookies`

## Implemented technical controls

- [x] Explicit email/WhatsApp consent + opt-out suppression
- [x] 90-day cart PII/URL/items anonymization; message-body redaction
- [x] 90-day bargain-session deletion; 180-day audit/DSR retention
- [x] Customer redact by id **or** cart-derived email/phone
- [x] DSR export omits cart/checkout tokens
- [x] AES-256-GCM for Shopify tokens, webhook secrets, recovery URLs
- [x] HMAC verification + body/domain match for Shopify webhooks
- [x] Merchant read auditing (`cart_list`, timeline, recipients, sessions, DSR)
- [x] Log redaction by key and value; hashed token references
- [x] AI recovery facts exclude email/phone/address/tokens
- [x] Runtime production/test environment separation guard
- [x] Level 2 checkout URL isolation, per-cart status and safe fallback

## Remaining evidence (not code)

- [ ] Shopify Partner Support confirmation of Level 2 before 2026-11-23
- [ ] Dev Dashboard protected-data approval screenshot
- [ ] Supabase encryption-at-rest + backup/PITR statement
- [ ] Dated restore-test evidence
- [ ] Provider MFA enrollment proofs (Vercel, Supabase, Cloudflare, GitHub,
  Shopify, Resend, Meta, email)
- [ ] Vercel env screenshot showing production vs preview separation
- [ ] Fresh four-scope install + consent + recovery + billing smoke test
- [ ] Production retention-job run with non-zero anonymized rows
- [ ] DPIA / TIA records (provider DPAs exist; formal TIA records are not all
  attached)
- [ ] RLS coverage decision (`docs/security/rls-plan.md`) — currently partial;
  app relies on tenant scoping, disclose accurately
- [ ] Audit-log append-only DB role/WORM (application-level only today)

## Next steps

1. Attach the pending evidence above to the Level 2 request.
2. Apply `prisma/migrations/20261116120000_add_checkout_recovery_access` after
   approval; retention already tolerates the legacy schema.
3. Run the full Jest/tsc/lint/build suite and record counts in
   `compliance/shopify-level-2/15-test-evidence.md`.
