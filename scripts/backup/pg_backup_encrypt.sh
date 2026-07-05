#!/usr/bin/env bash
set -euo pipefail

# Usage: pg_backup_encrypt.sh <output-prefix>
# Requires env: DIRECT_URL or DATABASE_URL
# Requires env: BACKUP_PASSPHRASE
# Optionally uploads to S3 (requires S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)

OUT_PREFIX=${1:-"recoverflow-backup"}
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
FILENAME="${OUT_PREFIX}-${TIMESTAMP}.sql.gz"
ENC_FILENAME="${FILENAME}.gpg"

# Determine connection string for pg_dump.
# Prefer DIRECT_URL (direct connection, no pgBouncer) — pg_dump cannot work through pgBouncer.
# Falls back to DATABASE_URL, then individual PG_* vars.
if [[ -n "${DIRECT_URL:-}" ]]; then
  pg_dump --dbname="$DIRECT_URL" | gzip > "/tmp/${FILENAME}"
elif [[ -n "${DATABASE_URL:-}" ]]; then
  pg_dump --dbname="$DATABASE_URL" | gzip > "/tmp/${FILENAME}"
else
  export PGPASSWORD="${PG_PASSWORD:-}"
  pg_dump -h "${PG_HOST:-localhost}" -p "${PG_PORT:-5432}" -U "${PG_USER:-postgres}" "${PG_DATABASE:-postgres}" | gzip > "/tmp/${FILENAME}"
fi

# Encrypt (symmetric) — prefer using a public key in production
if [[ -z "${BACKUP_PASSPHRASE:-}" ]]; then
  echo "ERROR: BACKUP_PASSPHRASE not set" >&2
  exit 2
fi

gpg --batch --no-tty --yes --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" -c "/tmp/${FILENAME}"
mv "/tmp/${FILENAME}.gpg" "/tmp/${ENC_FILENAME}"
shred -u "/tmp/${FILENAME}"

# Upload to S3
if [[ -n "${S3_BUCKET:-}" ]]; then
  aws s3 cp "/tmp/${ENC_FILENAME}" "s3://${S3_BUCKET}/${ENC_FILENAME}"
  echo "Uploaded s3://${S3_BUCKET}/${ENC_FILENAME}"
else
  echo "BACKUP created at /tmp/${ENC_FILENAME} — S3 not configured" >&2
fi

# Cleanup local encrypted file
shred -u "/tmp/${ENC_FILENAME}" || rm -f "/tmp/${ENC_FILENAME}"

echo "Backup completed: ${ENC_FILENAME}"
