# Data Loss Prevention Policy

RecoveryFlow limits collection, access, export, and retention of merchant and customer data to the minimum required to operate the service.

## Scope
- Production application data, logs, analytics, webhooks, emails, SMS, and support artifacts.
- All employees, contractors, and production systems that can access merchant or customer data.

## Controls
- Data minimization: collect only fields required for cart recovery, billing, support, and compliance.
- Access control: production data access is restricted to approved service accounts and a small operational group.
- Audit logging: sensitive reads and processing steps are recorded in `DataAccessLog`.
- Redaction: alerts, logs, and operational messages remove or mask names, emails, phone numbers, tokens, and checkout details.
- Export control: bulk exports of merchant/customer data are not enabled by default and require explicit operational approval.
- Environment separation: non-production systems use `TEST_DATABASE_URL` and must not point at production data.
- Retention: operational logs and export artifacts are retained only for the minimum period required for support and incident review.

## Prohibited Uses
- Exporting merchant or customer data to personal storage, unapproved cloud drives, or local unmanaged devices.
- Copying production data into ad hoc testing environments.
- Reusing production secrets in test or staging environments.

## Review Process
- Review privileged access quarterly.
- Review export requests before release and after each significant product change.
- Review audit logs for unusual access patterns and incident follow-up.

## Evidence for Shopify
- Screenshot or export of role assignments for production access.
- Sample `DataAccessLog` entries showing read activity and timestamps.
- Logs from a successful encrypted backup and restore test.
- Proof that test environments point to `TEST_DATABASE_URL`.
