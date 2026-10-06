# CARTGAIN DATA RETENTION POLICY

> **Version:** 2026.10.06 | **Effective:** 2026.10.06 | **Last Updated:** 2026.10.06
> **Owner:** Data Protection Lead | **Review Frequency:** Annual

---

## Purpose
Define retention periods and deletion procedures for personal data.

## Retention Schedule

| Data Category | Retention Period | Rationale | Deletion Method |
|---|---|---|---|
| Merchant Account Data | Account life + 3 years post-termination | Tax/compliance | Secure deletion/anonymization |
| Merchant Billing Data | 8 years | Tax law (India) | Secure deletion |
| Store Configuration | Store life + 90 days | Support transition | Secure deletion |
| Customer Contact Data (abandoned carts) | 90 days after cart abandonment | Cart recovery window (excessive retention avoided) | Anonymized or deleted |
| Cart & Order Data | 90 days (operational); Revenue events 8 years | Attribution + tax | Anonymized for analytics after 90d; financial records retained 8y |
| Communication Logs | 90 days (anonymized); Opt-out records: indefinite | Compliance proof | Anonymized after 90d; opt-outs preserved for suppression |
| AI Interaction Data | Session: 90 days; Anonymized training data: indefinite (no PII) | Improve service | PII stripped before anonymization |
| Technical/Access Logs | 180 days | Security monitoring | Rotated/deleted |
| Cookies/Consent | Consent: 1 year; Session: browser session | Compliance | Expiration + cleanup |
| Support/Legal Data | 3 years post-resolution; Legal holds until resolved | Legal defense | Secure deletion post-hold |

## Deletion Procedures
- Automated deletion jobs via scheduled tasks
- Manual deletion on verified DSRs
- Secure erasure from primary DB, backups (per backup retention), caches
- Verification of deletion

## Exceptions
Legal holds, ongoing investigations, regulatory requirements.

---

**Contact:** privacy@cart-gain.com
