# WooCommerce deployment

## Web app

1. Apply `prisma/migrations/20261120130000_add_woocommerce_integration/migration.sql` to the target Postgres database through the normal Prisma migration flow.
2. Deploy the Next.js app. Vercel runs `prisma generate && next build`.
3. Confirm no new required environment variables were introduced. Reuse the existing app URL, encryption, job auth, email, and WhatsApp settings.
4. Verify health and that the WooCommerce routes are reachable.

## Plugin package

Generate `cartgain-woocommerce.zip` from the plugin source:

```bash
python - <<'PY'
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
src = Path('plugins/cartgain-woocommerce')
out = Path('cartgain-woocommerce.zip')
with ZipFile(out, 'w', ZIP_DEFLATED) as z:
    for path in sorted(src.rglob('*')):
        if path.is_file():
            z.write(path, Path('cartgain-woocommerce') / path.relative_to(src))
PY
```

The ZIP root must contain a single `cartgain-woocommerce/` directory.

## Post-deploy checks

- Run the manual acceptance checklist in `TESTING.md`.
- Confirm the new tables are RLS-enabled and not reachable through the Supabase Data API with anon/authenticated roles.
- Confirm a fresh four-scope Shopify install still works; WooCommerce changes are additive and must not alter Shopify OAuth or Billing.
- Confirm existing bargain and recovery jobs still run on their normal schedules.
