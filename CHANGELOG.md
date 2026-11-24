# Changelog

All notable changes to EggHub Rwanda. Format based on Keep a Changelog; this
project does not yet publish versioned releases.

## Unreleased — production hardening

A pass that closes the gap between "works as a demo" and "safe in front of paying
customers". Ordered by severity.

### Security

- **JWT signing secret moved out of the database.** `src/lib/jwt-secret.ts` used to
  generate a secret, store it in plaintext in a `settings` table, accept every old
  value plus `JWT_SECRET_FALLBACK` forever, and happily persist the `.env.example`
  placeholder. A database dump was therefore enough to mint admin tokens. The secret
  now comes from `JWT_SECRET` only and is validated at startup (length + known
  placeholder list). The `settings` table is dropped. **This logs everyone out once.**
- **Session token is now an HttpOnly cookie.** The token was written to
  `localStorage`, to a cookie set from JavaScript with no `HttpOnly`, and sent twice
  per request. Any XSS could exfiltrate it. It is now `HttpOnly; SameSite=Lax; Secure`
  (in production), 24 h, with `iss`/`aud` claims. New `POST /api/auth/logout` expires it
  server-side; the custom `x-egghub-token` header is gone.
- **Rate limiting and enumeration protection.** New `src/lib/rate-limit.ts`
  (Postgres fixed-window counters): 5 login attempts / 15 min per account, 20 per IP,
  5 registrations / hour / IP, plus limits on password reset and contact. Unknown
  emails and wrong passwords now take the same time and return the same message.
  bcrypt cost raised 10 → 12.
- **Password changes require the current password.** `PUT /api/auth/profile` used to
  accept a new password with no re-authentication.
- **Password reset flow added** (forgot → token → reset, hashed single-use tokens,
  60 min expiry) plus an admin temporary-password endpoint. There was previously no
  way to recover an account at all.
- **Demo credentials removed from the production path.** The login page printed
  `admin@egghub.rw / Admin1234` and offered one-click logins. That block now renders
  only with `NEXT_PUBLIC_DEMO_MODE=true`. `/api/setup` refuses to run without explicit
  `ADMIN_EMAIL`/`ADMIN_PASSWORD` and rejects known demo passwords; it also takes an
  advisory lock so two calls cannot both create an admin.
- **Upload validation hardened.** `src/app/api/upload/route.ts` trusted the
  client MIME type and the filename extension, so an SVG/HTML polyglot could be served
  from our origin. Now magic-byte checked, restricted to JPG/PNG/WebP, random filename,
  extension derived from the detected type.
- **Security headers added** in `next.config.ts`: CSP, HSTS, `X-Frame-Options: DENY`,
  `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `poweredByHeader: false`, plus
  `sandbox`/`nosniff` on `/uploads/*`.
- **Open redirect on login fixed.** `?next=https://evil.example` no longer navigates
  off-site; only same-origin paths are accepted.
- **`?all=true` on `/api/products` is admin-only.** It exposed hidden and out-of-stock
  inventory to anonymous callers.

### Fixed

- **Checkout oversell and duplicate cart lines.** Products were read before the
  transaction and stock was written as `product.stock - qty` from stale values. Reads
  now happen inside the transaction with `FOR UPDATE`, plus a guarded
  `stock >= qty` update. Duplicate `productId` lines are merged before pricing, so one
  row and one decrement are produced.
- **Idempotent checkout.** `Idempotency-Key` is honoured and stored on the order; a
  retry returns the original order instead of creating a second one.
- **Cancelled orders restock.** Cancelling used to destroy inventory permanently. It
  now restocks inside a transaction, requires a reason, records who changed the status,
  and flags `refundRequired` when the order was already paid (payment status is never
  silently flipped).
- **Order status transitions are constrained.** `delivered → pending` and friends are
  rejected with 409; the UI only offers legal next states.
- **Order numbers can no longer collide.** `"EGG" + Date.now().slice(-6)` reused a
  1,000,000-value space every ~16.7 minutes. Replaced with a sequence-backed
  `EGG-YYYY-NNNNNN`.
- **Revenue reports counted unpaid orders.** Dashboard and sales summed every
  non-cancelled order regardless of `paymentStatus`, so mock payments looked like
  income. Now split into *collected* (paid) and *pending*, with cancelled excluded, and
  the mock gate honours `PAYMENT_MODE`.
- **7-day sales chart bucketed by UTC.** Orders placed 00:00–02:00 local time landed on
  the previous day. Now bucketed in `Africa/Kigali`.
- **`Number(id)` reached Postgres.** `/api/products/abc` produced
  `invalid input syntax for type integer`. New `parseId()` returns a clean 404.
- **Unhandled errors returned HTML.** ~10 routes had no `try/catch`; malformed JSON
  bodies threw before validation. New `withApi()` wrapper parses safely, maps errors to
  the `{ message }` contract, and logs with a correlation id.
- **Destructive product deletes.** Deleting a product with order history orphaned
  reviews and broke sales reports. Now soft-deleted (hidden from the storefront,
  history intact) with a 409 explaining why; unreferenced products still hard-delete.
- **Customer dashboard showed the wrong order's status.** The tracker used
  `activeOrder` while the number and links used `latest`, so one order's progress could
  be labelled with another order's number. Both now derive from one `focus` value.
- **Admin order deep-link was ignored.** `/admin/orders?id=N` from the dashboard now
  opens that order, and selecting one updates the URL.
- **Promotion selection was non-deterministic.** `limit(1)` with no `ORDER BY`; now the
  most generous active promotion wins, and overlapping active promotions are refused.
- **Corrupt `localStorage` crashed every page.** Unguarded `JSON.parse` in the cart and
  delivery notice, called from the navbar. New `safeRead` helper self-heals invalid data.
- **Missing hero images.** Both marketing pages referenced `/images/*.jpg` that did not
  exist. Halftone SVGs added under `public/images/`.
- **Contact form faked success.** It showed "we received your message" while sending
  nothing. Now posts to `POST /api/contact` and stores the message.

### Changed

- **Lists are paginated and aggregated in SQL.** Product search/sort/filter, admin
  orders, customers (grouped join with order counts), dashboard totals and the sales
  series all ran in JavaScript over full table scans.
- **Error boundaries added.** `error.tsx`, `global-error.tsx`, `not-found.tsx`.
- **Database module fails fast.** Missing `DATABASE_URL` throws a readable error instead
  of letting `pg` silently dial localhost; pool limits, idle timeout and TLS are
  configurable; idle-client errors are logged instead of crashing the process.
- **Health check reports detail.** `GET /api/health` returns `{ ok, checks: { db },
  uptimeSeconds, version }`.
- **`package.json`** renamed to `egghub-rwanda`, adds `engines`, `test`, `db:*` scripts.
- **Accessibility:** every previously unlabelled input now has `htmlFor`/`id`, the mobile
  nav toggle has `aria-expanded`/`aria-controls`, product thumbnails have real alt text,
  and error alerts are announced with `role="alert"`.

### Added

- `drizzle/` — committed migrations (initial schema, order-number sequence, settings
  cleanup) replacing `drizzle-kit push`.
- `drizzle.config.ts` reading `DATABASE_URL` from the environment.
- `src/db/seed.ts` — idempotent seed of products, admin and (opt-in) demo customer.
- Vitest suite: 110 tests, in-process PGlite, migrations applied from `drizzle/`.
- `.github/workflows/ci.yml` — lint, typecheck, test, build on every PR.
- `docker-compose.yml` for local PostgreSQL 16.
- `src/lib/api-handler.ts`, `parse-id.ts`, `validation.ts` (zod), `rate-limit.ts`,
  `pagination.ts`, `promotion-overlap.ts`, `client/storage.ts`.
- `/api/auth/logout`, `/api/auth/me`, `/api/auth/forgot-password`,
  `/api/auth/reset-password`, `/api/contact`, `/api/admin/contact-messages`,
  `/api/admin/customers/[id]/reset-password`.
- `/forgot-password` and `/reset-password` pages.

### Docs

- README rewritten for operators: complete environment table, auth design, password
  reset, API error contract and status codes, pagination, database/backup, go-live
  checklist, and a note that mock payments are not revenue and uploads are ephemeral.

### Upgrade notes

1. **Every session is invalidated** by the secret change — users log in once more.
2. **`JWT_SECRET` is now mandatory**; the app will not start without it.
3. **`ADMIN_EMAIL` / `ADMIN_PASSWORD` are mandatory** for `/api/setup` and `db:seed`.
4. **`totalSales` changed meaning** — it is now *collected* revenue, not order value.
5. Run `npm run db:migrate` **before** deploying the new code.
6. The `settings` table is dropped; its only content was the old signing secret.
