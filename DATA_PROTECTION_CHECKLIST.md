# CartGain Data Protection & Protected Customer Data - Checklist

## What We Have
- [x] H1_PRIVACY_POLICY.md - Comprehensive privacy policy (documents roles: Controller/Processor/Joint Controller, data tables, DSRs, retention)
- [x] H2_TERMS_OF_SERVICE.md - Terms covering data protection, liability
- [x] H3_DATA_PROCESSING_AGREEMENT.md - DPA with breach notification (72hrs), subprocessors, liability
- [x] H4_COOKIE_POLICY.md - Cookie policy
- [x] H5_ACCEPTABLE_USE_POLICY.md - Acceptable use
- [x] H6_REFUND_CANCELLATION_POLICY.md - Refund/cancel
- [x] H7_SUBPROCESSOR_DISCLOSURE.md - Subprocessor list with DPA status (tracking table)

## What We Need (Based on Concept 3)
- [ ] Breach Response Plan (H8 or similar) - documented runbook, roles, escalation, templates
- [ ] Data Retention Policy (separate doc or expand) - detailed per data type, deletion procedures
- [ ] Data Protection Impact Assessment (DPIA) template/records
- [ ] Transfer Impact Assessment (TIA) records for international transfers (OpenAI, Resend, Vercel)
- [ ] Evidence of encryption at rest/in transit (documentation)
- [ ] Data Breach Response templates (notification to authorities/customers)
- [ ] Record of Processing Activities (RoPA) - Article 30/GDPR equivalent
- [ ] Consent management documentation (how consent is collected, stored, verified)
- [ ] Justification for each PII field (data minimization documentation)

## Implementation Notes
- Privacy policy mentions encryption in transit (TLS) and at rest (Supabase encrypts)
- Breach notification mentioned but no full runbook doc
- Subprocessor disclosure has TIA/DPA tracking
- Need to ensure published URLs are set in Partner Dashboard (privacy policy, ToS)

## Next Steps
1. Create H8_BREACH_RESPONSE_PLAN.md with detailed runbook
2. Create DATA_RETENTION_POLICY.md
3. Document encryption controls (technical)
4. Prepare DPIA templates
5. Update privacy policy with exact company details if needed (currently marked ACTION REQUIRED)
