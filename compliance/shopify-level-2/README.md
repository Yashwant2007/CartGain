# CartGain — Shopify Level 2 Protected Customer Data Evidence Pack

Prepared: 2026-11-17 (Asia/Kolkata). App: CartGain public app
`gid://shopify/App/390792151041` (client id `67beb1794fab10553102c134b63e1277`).

This pack is the reviewer-facing index for Shopify protected customer data
(Level 2) access. It separates **verified repository evidence** from items that
only the operator or an external provider can confirm.

## Status legend

| Marker | Meaning |
|---|---|
| ✅ | Implemented in this repository and covered by code/tests |
| ⚠️ | Implemented, but production evidence must be attached by the operator |
| ⛔ | Blocked on Shopify / an external provider — not claimed as complete |

**Current submission state:** ⛔ The app is in App Store review, so Partner
Dashboard protected-data settings are read-only/hidden. Level 2 approval for
`AbandonedCheckout.abandonedCheckoutUrl` must be confirmed by Shopify Partner
Support before **2026-11-23**. Until then the code degrades safely (see
`14-level-2-evidence-request.md`).

## Documents

| # | Document | What it covers |
|---|---|---|
| 00 | [00-cover-and-status.md](00-cover-and-status.md) | Scope, deadlines, approval status, open blockers |
| 01 | [01-data-flow.md](01-data-flow.md) | End-to-end data flow and trust boundaries |
| 02 | [02-data-inventory-minimization.md](02-data-inventory-minimization.md) | Field-level inventory and minimization |
| 03 | [03-access-control-rbac.md](03-access-control-rbac.md) | Merchant isolation, roles, API keys, sessions |
| 04 | [04-encryption.md](04-encryption.md) | Transit, at-rest, secrets and recovery URLs |
| 05 | [05-dlp.md](05-dlp.md) | DLP rules, log redaction, no-token policy |
| 06 | [06-audit-logging.md](06-audit-logging.md) | `DataAccessLog`, scope, retention, gaps |
| 07 | [07-consent-opt-out.md](07-consent-opt-out.md) | Explicit consent, suppression, AI opt-out |
| 08 | [08-retention-deletion.md](08-retention-deletion.md) | Retention periods and deletion helpers |
| 09 | [09-privacy-webhooks.md](09-privacy-webhooks.md) | `shop/redact`, `customers/redact`, `customers/data_request` |
| 10 | [10-incident-response.md](10-incident-response.md) | Severity, notification, containment |
| 11 | [11-subprocessors.md](11-subprocessors.md) | Processors, regions and transfer safeguards |
| 12 | [12-environment-separation.md](12-environment-separation.md) | Production/staging/test guards |
| 13 | [13-mfa-passwords.md](13-mfa-passwords.md) | App TOTP, password policy, provider MFA |
| 14 | [14-level-2-evidence-request.md](14-level-2-evidence-request.md) | Exact Level 2 request and fallback behavior |
| 15 | [15-test-evidence.md](15-test-evidence.md) | Automated security/compliance tests |

## Non-negotiable rules followed

- No fabricated Shopify URLs or checkout resume links.
- Recovery URLs are persisted only AES-256-GCM encrypted and are never logged,
  exported, sent to AI, or returned to a browser.
- No customer data in logs/analytics; identifiers are hashed for correlation.
- No production data in development/preview by policy; a runtime guard rejects
  explicit host/config conflicts.
- No claim is marked complete without repository evidence or an attached
  external confirmation.
