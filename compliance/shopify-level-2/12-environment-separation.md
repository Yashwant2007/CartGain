# 12 — Environment Separation

Code: `src/lib/env-separation.ts`, enforced by `src/lib/db.ts` before the Prisma
client is created.

## Data environments

| Runtime | Resolved data environment | Database |
|---|---|---|
| `NODE_ENV=production`, not Vercel preview | `production` | `DATABASE_URL` / `DIRECT_URL` |
| Vercel `preview` | `staging` | `TEST_DATABASE_URL` (or its own preview env) |
| `NODE_ENV=test` | `test` | `TEST_DATABASE_URL` |
| local development | `development` | `TEST_DATABASE_URL` |

`APP_DATA_ENV` can override the resolved environment, but not in a way that
points a non-production runtime at production.

## Guards

- A production runtime with `APP_DATA_ENV` set to anything other than
  `production` is a hard error.
- A non-production runtime whose database host is listed in
  `PRODUCTION_DB_HOSTS` is a hard error.
- A non-production runtime without `TEST_DATABASE_URL` logs a loud warning.
- A missing `DATABASE_URL` is still a startup error.
- Errors throw before any query; the app does not silently fall through to the
  production URL.

## Operator setup

Set in Vercel production:

```
APP_DATA_ENV=production
PRODUCTION_DB_HOSTS=<production supabase host>
```

Set in preview/development:

```
APP_DATA_ENV=development   # preview resolves to staging automatically
TEST_DATABASE_URL=<staging or local database>
PRODUCTION_DB_HOSTS=<production supabase host>  # keeps the guard meaningful
```

- ⚠️ Attach the Vercel environment screenshot showing production and preview
  variables are different.
- ⚠️ Confirm the preview database is a separate Supabase project/database, not a
  schema inside production.
- The guard is a safety net, not a substitute for separate credentials. Use
  different DB users/passwords per environment.
