# Hardening notes

Operator-facing summary of the production-hardening pass. Read this before you deploy.

---

## What changed, and what you must do

### 1. JWT signing secret is now env-only (P0)

**Before:** the app generated a signing secret, stored it in plaintext in a `settings`
table, and accepted every historical value plus `JWT_SECRET_FALLBACK` forever. A database
dump was enough to forge admin tokens. It also would happily adopt the `.env.example`
placeholder as the real key.

**Now:** `JWT_SECRET` from the environment, validated at startup (≥ 32 chars, not a known
placeholder). Rotation uses `JWT_SECRET_PREVIOUS`, which you remove once sessions expire.

**You must:**
- Set a real `JWT_SECRET` (`openssl rand -hex 32`). The app refuses to boot without it.
- Expect **all users to log in again** once. Old tokens were signed with a different key —
  that is the point.
- Delete `JWT_SECRET_FALLBACK` from your environment; it is no longer read.

**Rollback:** restoring the old code also restores the old secret-reading behaviour, but the
`settings` row is gone, so a new random secret is generated and everyone is logged out again.

---

### 2. Sessions are HttpOnly cookies (P0)

**Before:** the token was in `localStorage`, in a JS-set cookie with no `HttpOnly`, and sent
in two headers. Any XSS could steal a 7-day credential.

**Now:** one `HttpOnly; SameSite=Lax; Secure` cookie, 24 h, `iss`/`aud` claims. The client
never sees the token. Logout expires it server-side.

**You must:**
- Serve over HTTPS in production (the cookie is `Secure` there).
- If you have non-browser API clients, they can still use `Authorization: Bearer <token>` —
  they just need to read the cookie or call login and capture the header themselves. Login
  no longer returns the token in the body.

**Rollback:** old clients holding a `localStorage` token will keep working until it exceeds
24 h, then need to log in.

---

### 3. Demo mode is opt-in (P0)

**Before:** the login page printed `admin@egghub.rw / Admin1234` and offered one-click logins
to everyone, and `/api/setup` fell back to those credentials when the env was empty. The
advertised demo *customer* never existed, so that button always failed.

**Now:** the block renders only when `NEXT_PUBLIC_DEMO_MODE=true` (build-time). The demo
customer is seeded only with `DEMO_MODE=true`, and its password has no default.

**You must:**
- Leave both flags unset in production.
- Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` before running `/api/setup` or `npm run db:seed`, or
  setup returns 500 with an explanatory message.
- If migrating an existing deployment that used the default admin password, change it.

---

### 4. `totalSales` now means *collected* revenue (P0)

**Before:** the dashboard and sales API summed every order whose status was not `cancelled`,
regardless of `paymentStatus`. Combined with mock payments, the dashboard reported money that
was never received.

**Now:** two figures, explicitly labelled —
- **Collected** = `paymentStatus = 'paid'` and not cancelled
- **Awaiting payment** = `paymentStatus = 'pending'` and not cancelled

**You must:**
- Update any external report or spreadsheet that consumed `totalSales` from
  `GET /api/admin/dashboard`. The field name is unchanged but its meaning is narrower.
- Use `pendingSales` for the outstanding amount.
- Set `PAYMENT_MODE=real` for anything customer-facing. With `mock`, card and mobile-money
  orders are marked paid with no provider call; the dashboard now separates them from cash,
  but they are still fictional money.

---

### 5. Products with history are soft-deleted (P1)

`DELETE /api/products/:id` returns **409** and hides the product (`deleted_at`,
`is_available = false`) when it appears on any order or review. Unreferenced products are
still removed. Public product queries exclude soft-deleted rows.

**You must:** expect a 409 in the admin UI for old products; that is success, and the order
history is preserved. The message explains it.

---

### 6. Uploads are validated and still ephemeral (P1)

Only JPG/PNG/WebP, verified by magic bytes; SVG is rejected; filenames are random.
`public/uploads/` is **lost on redeploy** on most PaaS hosts.

**You must:** mount a persistent volume there, or swap the upload route for Cloudinary/S3
before go-live. `next.config.ts` already whitelists remote image hosts.

---

### 7. Rate limiting needs a real client IP (P1)

Login is limited to 5 attempts / 15 min per account and 20 per IP; registration to 5 / hour
per IP.

**You must:** set `TRUST_PROXY=true` when running behind a reverse proxy or load balancer,
otherwise every request is attributed to the same "direct" bucket. Do **not** enable it when
the app is directly exposed — then a spoofed `x-forwarded-for` would let an attacker rotate
identities.

---

## Migration order

```bash
# 1. back up first
pg_dump "$DATABASE_URL" --format=custom --file=pre-hardening.dump

# 2. apply the schema changes (drops `settings`, adds tables/indexes/FKs)
npm run db:migrate

# 3. deploy the new code with JWT_SECRET and ADMIN_* set
npm run build && npm start

# 4. verify
curl -s $APP_URL/api/health
```

The migrations are additive except for `DROP TABLE settings`, whose only content was the old
signing secret. Take the backup anyway.

## Rollback plan

| Change | Reversible? | How |
|--------|-------------|-----|
| Code (auth, checkout, reporting) | Yes | Redeploy the previous commit |
| Dropped `settings` table | Schema-wise yes; **sessions no** | Recreate the table from the dump if you truly need the old secret; otherwise everyone logs in again |
| Added tables/columns/indexes | Yes | `drizzle-kit` can generate a down-migration, or drop them by hand |
| Added FKs | Yes, but only after removing offending rows | They were added on a schema with no orphan data; verified by the test suite |
| Soft-deleted products | Yes | `UPDATE products SET deleted_at = NULL` |

## What the test suite proves

110 tests run against real PostgreSQL semantics (PGlite, from the committed migrations):

- checkout: happy path, corrupted client prices ignored, oversell refused, duplicate cart
  lines merged, idempotency replay, last-unit race, bad phone/huge instructions rejected
- cancellation: restock exactly once, terminal state, required reason, refund flag
- authorization: no token, garbage token, forged secret, forged admin claim, wrong owner
- auth: HttpOnly cookie, no token in body, enumeration-resistant login, rate limit, password
  change requires the current password, full reset cycle, admin temp password
- data: duplicate review rejected by a unique index, revenue split, UTC→Kigali buckets,
  admin-only `?all=true`, soft delete keeps history, non-numeric ids return 404
