# Changelog

All notable changes to EggHub Rwanda. Format based on Keep a Changelog; this
project does not yet publish versioned releases.

## Unreleased — complete admin dashboard

The admin area could manage products, orders, promotions and customers, but it
had no user administration, no inventory history, and no way in from the site.

### Added — user management (`/admin/users`)

- Every account, customers and admins, with name, email, phone, registration
  date, role, status, order count and total spent. Search across name/email/
  phone, filter by role and by active state.
- Open an account for a profile with its ten most recent orders and lifetime
  totals. Edit name, email, phone, address and role.
- **Deactivate** an account: it keeps every record, but `POST /api/auth/login`
  now refuses it with a 403 after the password check (so the response cannot be
  used to discover which emails exist). Reactivating restores access.
- Delete an account — only when it has no order history, because orders are
  `ON DELETE RESTRICT`. The API explains that and points at deactivation rather
  than failing with a foreign-key error.
- Three guards against locking the shop: an admin cannot deactivate or demote
  themselves, and the last active admin cannot be demoted.

### Added — inventory (`/admin/inventory`)

- New `stock_movements` ledger (migration `0004`): direction, quantity, reason,
  source, note, optional order, who recorded it, when.
- **Stock in**: choose a listing, quantity, source, date (backdatable for a
  delivery recorded late) and note. **Stock out**: quantity and reason. Both
  change `products.stock` and write the ledger row in one transaction.
- Stock can never go negative — the decrement carries `stock >= quantity` in the
  `UPDATE` itself, so a concurrent request cannot slip past a stale read.
- Every other path that moves stock now writes the ledger too: a checkout
  records the sale, a cancellation records the return, creating a listing records
  its opening stock, and editing a listing's stock number records the difference
  as a correction. `backfillOpeningBalances()` gives pre-existing stock an
  opening balance once, so the totals start complete rather than at zero.
- Egg listings gained a `category` (chicken / duck / quail / other, free text).

### Added — the overview (`/admin`)

- Stat cards for users, listings, total eggs on hand, orders, eggs received,
  eggs out, collected revenue and ledger size.
- Stock health, a dependency-free 7-day revenue bar chart, a recent inventory
  activity feed and recent orders.

### Added — entry point

- `AdminAuthNav`: a sidebar on desktop that becomes a horizontally scrolling tab
  strip on a phone, shared by every admin screen.
- `/admin/login`: a separate staff sign-in page. A valid non-admin account is
  logged straight back out with "That account is not an administrator."
- The footer's EggHub column ends with an independent **Admin** link to
  `/admin/login` — its own list item, never inside a dropdown.

### Fixed

- **Duplicate-key handling was broken everywhere.** Drizzle wraps driver errors
  in `DrizzleQueryError`, so the `code === "23505"` checks in `register`,
  `orders` and `reviews` never matched and a duplicate registration returned 500
  instead of "email already in use". New `src/lib/db-errors.ts` unwraps
  `error.cause` (and nested causes) and all four call sites use it.
- **Creating a listing would have doubled its stock** once opening stock was
  recorded: the row was inserted with stock and then the ledger added it again.
  The insert now starts at 0 and the ledger applies the opening quantity.
- The test truncate helper now includes `stock_movements` and retries briefly —
  PGlite multiplexes one connection, so a route's deliberately-unawaited query
  could otherwise fail the next test with "Connection terminated unexpectedly".

### Tests

33 new: 13 inventory (stock in/out, the negative guard, backdating, the ledger,
admin-only), 14 user management (search, filters, edit, duplicate email,
deactivation blocking login, self-protection guards, delete rules, admin-only)
and 7 ledger invariants across products and orders.

## Unreleased — no admin entry point on the public site

- **Removed the footer admin portal.** `src/components/AdminPortal.tsx` and the
  footer's **Staff** column are gone, along with their CSS (`.admin-portal*`,
  `.footer-admin-note` and the phone overrides). The footer is back to three
  columns: brand, Shop and EggHub, stacking on a phone.
- The admin screens themselves are unchanged and still reachable at `/admin`
  for anyone with an admin session. They are simply not advertised: no link from
  any public page. Access control is unaffected — `src/app/admin/layout.tsx` and
  every `/api/admin/*` route still require the admin role.

## Unreleased — remove the home page hero image

- The halftone bowl-of-eggs illustration is gone from the top of the home page.
  The hero is now just the headline, paragraph and the two buttons, with even
  padding above and below. Its CSS (`.hero-media`, including the three
  breakpoint overrides) went with it.
- `public/images/hero-halftone.svg` is kept in the repo, unreferenced, so the
  artwork is still available if it is ever wanted back. The About page's own
  image is untouched.

## Unreleased — fix the build/deploy failure

CI failed at the **Build** step (lint, typecheck and all 130 tests passed), and
Vercel's deployment failed with the same root cause.

### Fixed

- **`src/db/index.ts` threw at import time when `DATABASE_URL` was missing.**
  `next build` imports every route to collect page data, so a build with no
  database configured — CI, a Vercel preview, or a fresh clone — crashed even
  though nothing was trying to connect. The pool and the Drizzle client are now
  created on first use (lazy proxies), so importing a route is free and the
  clear `DATABASE_URL is not set` message still appears the moment a query
  actually needs the database.

### Added

- CI now builds **twice**: once with no `DATABASE_URL` (mirroring a preview
  deploy) and once with one, so this cannot regress silently.
- `src/db/lazy.test.ts`: asserts the module imports without a database and that
  a real query still fails with the explanatory message.
- `docs/deployment.md`: what to set on Vercel (database, JWT secret, TLS,
  migrations, seeding) and a symptom table for the failures that are
  configuration rather than code.
- `vercel.json`: framework, install/build commands and a 30 s function budget.

## Unreleased — admin portal

Admins had to know that `/admin` existed. There was no link anywhere in the site.

### Added

- **Footer navigation**: Shop and EggHub columns (previously two paragraphs with
  no links), stacking on phones. *(The Staff column and its admin portal were
  later removed — see above.)*
- **Dashboard is a control centre**: every stat links to the screen that manages
  it, six capability cards, and two new panels — accounts by role
  (customers / admins / total) and **delivery vs pickup** with pickups still
  waiting at the counter.
- **Customer management**: `/admin/customers` can now issue a one-time password
  (the API already existed but was unreachable from the UI). Shows total spent.
- Three dashboard tests: role counts, delivery/pickup split (excluding cancelled),
  and admin-only access.

### Changed

- Dashboard "Customers" stat now sits beside a **Users** figure, so admins are
  counted too — the API previously counted customers only.

## Unreleased — delivery area and collection (EPR Karugira)

Delivery used to be unconditional: anyone in the country could check out, was
charged the flat 1,000 RWF fee, and expected a rider. Now the order is delivered
only inside a small area around EPR Karugira; everyone else collects.

### Added

- **Location confirmation at checkout**, step 1 of 3. `navigator.geolocation` with a
  manual latitude/longitude fallback (permission refused, no fix, older browser,
  or a customer who prefers to paste coordinates). The checkout states the verdict
  before payment: *delivery* or *pickup at EPR Karugira*, with distance, directions
  and opening hours.
- `src/lib/fulfilment.ts` — the pickup point, origin, radius (3.5 km), both fees and
  a Haversine `distanceKm()`, shared by the checkout and the order API.
- Order columns `fulfilment_method`, `latitude`, `longitude`, `distance_km`
  (migration `0003_order_fulfilment.sql`, plus a CHECK constraint on the method).
- 17 new tests: distance maths against real coordinates (Merez, Gikondo, Kicukiro
  Centre, Kimironko, Huye), the fail-safe for a missing location, the inclusive
  radius boundary, and four API tests including *refused order leaves stock untouched*.

### Changed

- **The server, not the form, decides the fee.** `POST /api/orders` recomputes
  delivery vs pickup from the submitted coordinates. An outside-the-area order
  without `pickupAcknowledged` returns **409** and writes nothing.
- Pickup orders pay a **500 RWF handling fee** instead of the 1,000 RWF delivery fee,
  and the button reads *Confirm pickup order*.
- The green site banner says **Ready for collection** for pickup orders instead of
  *Your order is coming*; the order page and invoice show the collection point, and
  cash reads *cash on collection*.
- Admin → Orders shows *Pickup — do not dispatch a rider* with the customer's distance.
- Home and About copy now describe the area and derive the number from the config.

### Fixed

- `errorResponse()` can carry extra fields (used to return the pickup decision with
  a 409) — previously only a `message`.

## Unreleased — responsive / mobile pass

The site already had a responsive layer; this pass makes it hold up on real
handsets and adds a way to prove it.

### Added

- **`/devices` — live device checker.** The real routes render inside phone frames
  (320, 360, 390, 430, 768px) as same-origin iframes, so the layout under test is the
  layout shipped. A probe measures `scrollWidth` inside each frame and names the
  offending elements; "Check every page" sweeps all 23 screens at all 5 widths (115
  combinations) and reports which fit. Results are measured per visit, not hard-coded.
- Short-landscape phone handling (e.g. 667×375) for the hero and the nav panel.

### Fixed

- **The mobile menu stayed open after tapping the page you were already on.** The
  menu closed by watching for a pathname change, which never happens in that case.
  It now closes on every link tap, on `Escape`, and on a tap on the dimmed backdrop
  (new), and the page behind it no longer scrolls while it is open.
- **Tables without a scroll container**: admin sales ("Most Ordered Products") and the
  invoice line items could widen the whole page; both now scroll inside `.table-wrap`.
- **Inline fixed widths** in admin toolbars (`260px` search, `200px` filter, `80px`
  stock input) are now flexible and full-width on phones.
- **`overflow-x: hidden` on `<body>`** was masking broken layouts and silently turning
  `<body>` into a scroll container (which breaks `position: sticky` on the header). It
  is now `overflow-x: clip` on `<html>` only, and genuinely overflowing pages are
  reported by `/devices` instead of being cropped.
- Tap targets: the burger is 44×44 and the delivery-banner close button grew from
  ~20px to 44×44. The header pill shrinks below 420px so the row stays on one line.
- Product image sizing is now explicit per component, so a slow-loading image cannot
  collapse its card.

### Changed

- `X-Frame-Options: DENY` → `SAMEORIGIN`, CSP `frame-ancestors 'none'` → `'self'`.
  Required by the same-origin device checker; external framing is still refused.
- Nav panel uses `dvh` so a mobile browser toolbar cannot hide the last link.

---

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
