Encrypted Backups — RecoverFlow

Goal
- Provide automated, encrypted, verifiable backups of production Postgres data and retained logs as evidence for Shopify review.

Overview
- Frequency: daily full backups + WAL archive retention as needed.
- Encryption: backups are encrypted before transport using GPG symmetric encryption (or public-key encryption to a secured keyring) and stored in an access-controlled S3-compatible bucket (or Supabase Storage).
- Retention: 90 days by default; older backups rotated and securely deleted.
- Verification: weekly restore test to a staging database; checksums validated.

What this repository provides
- `scripts/backup/pg_backup_encrypt.sh`: example script to create, compress, and encrypt a `pg_dump` backup.
- `.github/workflows/backup.yml`: scheduled GitHub Actions workflow demonstrating automated encrypted backup and upload to S3.

Required secrets (examples)
- `DATABASE_URL` or `PROD_DATABASE_URL` — production DB connection string.
- `BACKUP_PASSPHRASE` — GPG symmetric passphrase (store in secrets manager).
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` and `S3_BUCKET` — target storage.

Evidence to collect for Shopify
- Screenshots or config snippets from the backup provider showing "enforced encryption at rest" and rotation settings.
- GitHub Actions run logs showing successful backup, checksum and upload.
- GPG public key fingerprint used for encryption (or KMS key ARN).
- Restore test log showing successful restore to staging database.

Operational notes
- Prefer using provider-managed encrypted backups (e.g., Supabase snapshots or cloud-provider managed snapshots) and retain provider proof.
- For self-managed backups: use `pg_dump` + GPG + signed manifests and store in an immutable object store with lifecycle rules.

Next steps
1. Add provider-specific enablement steps (Supabase, AWS RDS, DigitalOcean) and attach screenshots.
2. Configure scheduled backup workflow in production CI/CD or a dedicated backup runner.
3. Run a restore test and save logs as evidence.
