# Deploying to Vercel

The app builds and runs without a database only as far as `next build`. At
runtime every API route needs a real PostgreSQL server: **Vercel's filesystem is
ephemeral and has no database.** Uploads written to `public/uploads` are also
lost between deployments.

## Why a deploy fails

| Symptom | Cause |
| --- | --- |
| Build fails: `DATABASE_URL is not set` | No database variable in the Vercel project. Fixed for the *build* step (the check is now lazy), but runtime still needs it. |
| Deploy "succeeds", every API route returns 500 | `DATABASE_URL` points at `localhost` — that is the build machine, not the function. |
| Login works, then "please log in" on every page | `JWT_SECRET` missing or shorter than 32 characters. Tokens cannot be signed. |
| Tables missing: `relation "users" does not exist` | Migrations were never applied to that database. |
| Cannot log in at all | No admin was ever seeded (`ADMIN_EMAIL` + `ADMIN_PASSWORD` are required), or the seed ran against a different database. |
| Uploads vanish after a redeploy | `public/uploads` is on the ephemeral filesystem. Use a volume or object storage (S3/R2) and change the upload route. |

## Steps

1. **Create the database.** Vercel Postgres, Neon, Supabase or any managed
   PostgreSQL 16. Copy its connection string. If it requires TLS, plan to set
   `DATABASE_SSL=true`.

2. **Set environment variables** in the Vercel project (Settings → Environment
   Variables), for Production *and* Preview:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | the managed connection string (not localhost) |
   | `JWT_SECRET` | `openssl rand -hex 32` — 32+ characters, not a placeholder |
   | `DATABASE_SSL` | `true` for most managed providers |
   | `PAYMENT_MODE` | `real` unless you deliberately want mock payments |
   | `ADMIN_EMAIL` / `ADMIN_PASSWORD` | only needed for the one-time seed |
   | `DEMO_MODE` / `NEXT_PUBLIC_DEMO_MODE` | leave unset in production |

3. **Apply the schema**, from your machine, against the production database:

   ```bash
   DATABASE_URL="<production url>" npm run db:migrate
   DATABASE_URL="<production url>" \
     JWT_SECRET="<same secret>" \
     ADMIN_EMAIL="you@example.com" ADMIN_PASSWORD="<real password>" \
     npm run db:seed
   ```

   The seed is idempotent; it creates the admin once and never resets an existing
   password.

4. **Redeploy**, then check `GET /api/health` — it returns `{"ok":true,` with
   `checks.db = "ok"`. If `ok` is false, the database is unreachable from the
   function.

## Using the app locally instead

Vercel is optional. `docker-compose.yml` starts PostgreSQL 16 and the rest runs
with `npm run build && npm start` (see README > Quick start). That is the only
configuration verified end to end so far.
