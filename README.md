# 🥚 EggHub Rwanda

**Fresh Eggs. Easy Ordering. Reliable Delivery.**

EggHub Rwanda is an online egg-selling and management platform. The **admin** manages egg products, orders, customers, promotions and sales. **Customers** browse products, add them to a cart, checkout, and track their orders.

> **Note on the stack:** this project was built inside a Next.js + PostgreSQL environment, so it uses
> **Next.js (React) + API routes + PostgreSQL (Drizzle ORM)** instead of Vue + Express + MongoDB.
> The structure is kept deliberately close to the original plan: the same REST endpoints
> (`/api/auth`, `/api/products`, `/api/orders`, `/api/admin`, `/api/reviews`, `/api/promotions`),
> the same two roles, the same pages, plain CSS classes, and small commented files.

---

## Features

**Customer**: register, login, browse/search/sort products, product details with reviews, cart (localStorage), checkout with delivery info + payment method, order confirmation, order history, status tracking, printable invoice, profile management, password reset, product reviews after delivery.

**Admin**: dashboard (revenue collected vs pending, orders, customers, products, low stock, pending orders), add/edit/delete products, image upload (local), stock & availability management, low-stock warnings, orders list + status/payment updates with cancellation reasons, customers list + temporary password reset, sales statistics with a simple chart, discounts & promotions.

**Security**: bcrypt password hashing (cost 12), JWT auth in an **HttpOnly cookie**, role checks on every admin API, server-side recalculation of prices / discounts / delivery / stock at checkout, per-account and per-IP rate limiting on login/register, input validation shared between client and server, parameterised SQL everywhere, security headers (CSP, HSTS, same-origin framing only).

**Responsive**: one layout that works from a 320px phone to a wide desktop, with the mobile menu, stacked grids, scrolling tables and a built-in device checker at [`/devices`](http://localhost:3000/devices).

---

## Account types

| Role | How it's created | Can do |
|------|------------------|--------|
| `admin` | once, via `POST /api/setup` or `npm run db:seed` (needs `ADMIN_EMAIL` + `ADMIN_PASSWORD`) | everything under `/admin` |
| `customer` | public Register page | shop, order, track, review |

Public registration **always** creates a customer. There is no way to choose "admin" from the browser.

### Demo accounts

Demo accounts are **off by default** and only appear when you explicitly enable demo mode:

```bash
DEMO_MODE=true                    # seeds the demo customer (server side)
NEXT_PUBLIC_DEMO_MODE=true        # shows the demo block on the login page
DEMO_CUSTOMER_PASSWORD=...        # required when DEMO_MODE=true
DEMO_CUSTOMER_EMAIL=demo@egghub.rw
NEXT_PUBLIC_DEMO_ADMIN_EMAIL=...  # optional: only pre-fills the login form
NEXT_PUBLIC_DEMO_ADMIN_PASSWORD=...
NEXT_PUBLIC_DEMO_CUSTOMER_EMAIL=...
NEXT_PUBLIC_DEMO_CUSTOMER_PASSWORD=...
```

With `NEXT_PUBLIC_DEMO_MODE` unset, the login page shows **no credentials and no demo buttons**.
**Never enable demo mode on a public deployment.**

---

## Quick start (Docker for the database)

The fastest path on any OS: bring up PostgreSQL with Docker, then migrate and run.

```bash
git clone <repo> && cd egg-net
npm install

# 1. Start PostgreSQL 16 (see docker-compose.yml)
docker compose up -d

# 2. Configure the environment
cp .env.example .env
# Generate a signing secret - there is no default on purpose
printf 'JWT_SECRET=%s\n' "$(openssl rand -hex 32)" >> .env
# Set the first admin (required - setup refuses to run without it)
#   ADMIN_EMAIL=you@example.com
#   ADMIN_PASSWORD=<a real password>

# 3. Build the schema and seed sample data
npm run db:migrate
npm run db:seed

# 4. Run
npm run dev            # http://localhost:3000
```

Open http://localhost:3000 and log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

### Without Docker (local PostgreSQL)

1. Install Node.js 20–22 and PostgreSQL 14+.
2. `CREATE DATABASE app_db;`
3. Point `DATABASE_URL` at it in `.env`.
4. `npm run db:migrate && npm run db:seed && npm run dev`
5. If you prefer the one-time HTTP bootstrap instead of the seed script:
   `curl -X POST http://localhost:3000/api/setup` (requires `ADMIN_EMAIL` and a non-default `ADMIN_PASSWORD`).

### Windows (PowerShell)

```powershell
copy .env.example .env
# edit .env: DATABASE_URL, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npx drizzle-kit migrate     # or: npm run db:migrate
npm run db:seed
npm run dev
```

### Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest (unit + API integration) |
| `npm run test:coverage` | Coverage report |
| `npm run db:generate` | Generate a migration from `src/db/schema.ts` |
| `npm run db:migrate` | Apply committed migrations |
| `npm run db:studio` | Drizzle Studio |
| `npm run db:seed` | Idempotent seed (products + admin + optional demo customer) |

---

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | **yes** | PostgreSQL connection string. The app refuses to start without it. |
| `JWT_SECRET` | **yes** | Signs login tokens. Minimum 32 characters; the app refuses to start if it is missing or is a known placeholder. |
| `JWT_SECRET_PREVIOUS` | no | Only while rotating: the old secret is accepted for existing sessions. Remove it once every session has expired (24 h). |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | for setup/seed | First admin account. `/api/setup` returns 500 unless both are set and the password is not a known demo value. |
| `ADMIN_PHONE` | no | Phone stored on the seeded admin (default `0788000000`). |
| `DEMO_MODE` | no | `true` seeds the demo customer. Development only. |
| `NEXT_PUBLIC_DEMO_MODE` | no | `true` shows the demo block on the login page. Build-time value. |
| `DEMO_CUSTOMER_EMAIL` / `DEMO_CUSTOMER_PASSWORD` | with `DEMO_MODE` | Demo customer credentials. Password has no default. |
| `NEXT_PUBLIC_DEMO_*` | no | Optional pre-fill for the demo buttons (admin and customer). |
| `PAYMENT_MODE` | no | `mock` (default in `.env.example`) marks Mobile Money / Card orders paid immediately. `real` leaves every order pending until an operator confirms. |
| `PAYMENT_API_KEY` | no | *Future* — real payment provider. Not read yet. |
| `TRUST_PROXY` | no | `true` when behind a reverse proxy that sets `x-forwarded-for`. Without it, rate limiting uses the direct connection. |
| `DATABASE_SSL` | no | `true` for managed Postgres that requires TLS. |
| `DATABASE_POOL_MAX` | no | Pool size (default 10; tests use 1). |
| `APP_URL` | no | Base URL used in password-reset links. Falls back to the request origin. |
| `CLOUDINARY_*` | no | *Future* — remote image hosting. Not read yet. |

---

## How authentication works

* The login token is delivered **only** as a cookie named `egghub_token`, with
  `HttpOnly; SameSite=Lax; Secure` in production, valid for **24 hours**.
* Because it is `HttpOnly`, page scripts cannot read it — an XSS bug cannot steal a session.
  `localStorage` holds only a *display* copy of the profile (name, email, role) and is never
  used to grant access.
* `Authorization: Bearer <token>` is still accepted for API clients.
* The role is always read from the database, never from the token, so a demoted user loses
  admin access immediately.
* `POST /api/auth/logout` expires the cookie server-side.
* **Rotating the secret logs everyone out.** Generated secrets are not stored in the database
  (an earlier version stored one in a `settings` table, which meant a database dump handed an
  attacker the ability to mint admin tokens). The first deploy of this version invalidates all
  existing sessions — that is intentional.

### Password reset

`POST /api/auth/forgot-password` always answers 200 and never reveals whether an account exists.
The reset link is currently **written to the server log** (email delivery is out of scope) —
replace the `console.log` in `src/app/api/auth/forgot-password/route.ts` with your provider call.
Tokens are single-use, expire after 60 minutes, and only their SHA-256 hash is stored.

An admin can also issue a temporary password for a locked-out customer from
`POST /api/admin/customers/:id/reset-password`; the customer must change it at next login.

---

## API overview

All responses are JSON. Errors are `{ "message": string }`.

| Method | Route | Who |
|--------|-------|-----|
| POST | `/api/auth/register` | public (creates customer) |
| POST | `/api/auth/login` | public (sets cookie) |
| POST | `/api/auth/logout` | logged in |
| GET / PUT | `/api/auth/profile` | logged in |
| GET | `/api/auth/me` | logged in (401 otherwise) |
| POST | `/api/auth/forgot-password` | public |
| POST | `/api/auth/reset-password` | public (needs token) |
| GET | `/api/products`, `/api/products/:id` | public |
| POST / PUT / DELETE | `/api/products`, `/api/products/:id` | admin |
| POST | `/api/upload` | admin |
| POST / GET | `/api/orders` | customer (admin sees all) |
| GET | `/api/orders/:id` | owner or admin |
| PUT | `/api/orders/:id/status` | admin |
| GET | `/api/admin/dashboard`, `/customers`, `/orders`, `/sales` | admin |
| POST | `/api/admin/customers/:id/reset-password` | admin |
| GET | `/api/admin/contact-messages` | admin |
| POST | `/api/reviews` | customer (delivered orders only) |
| GET | `/api/reviews/product/:productId` | public |
| GET | `/api/promotions/active` | public |
| GET / POST / PUT / DELETE | `/api/promotions`, `/api/promotions/:id` | admin |
| POST | `/api/contact` | public |
| GET | `/api/health` | public |
| POST | `/api/setup` | one-time admin creation |

Send the token as `Authorization: Bearer <token>`. Browsers authenticate automatically via the cookie.

### Status codes

| Code | Meaning |
|------|---------|
| 400 | Validation failed — the message is safe to show the user |
| 401 | Not logged in, or bad credentials |
| 403 | Logged in but not allowed (non-admin, or another customer's order) |
| 404 | Not found, **including non-numeric IDs** |
| 409 | Conflict: stock, order-status transition, overlapping promotion, soft-deleted product |
| 429 | Rate limited (check `Retry-After`) |
| 500 / 503 | Server-side failure — a correlation id is logged, never returned |

### Pagination

List endpoints accept `?page=` and `?pageSize=` (default 50, max 200) and return
`{ ...items, total, page, pageSize }`.

---

## Where we deliver, and where you collect

Delivery is not available everywhere. The checkout asks each customer to confirm
their location **before** they can pay, and that location decides the whole order:

| Distance from EPR Karugira | What happens | Fee |
| --- | --- | --- |
| Up to **3.5 km** | Delivered to the address | 1,000 RWF |
| Further than 3.5 km | **Collection only** at EPR Karugira, Kigarama, Kicukiro | 500 RWF handling |
| Location not shared / refused | **Collection only** (fails safe) | 500 RWF handling |

A customer outside the area must tick *"I understand this order will not be
delivered"* before the Place Order button enables. The server refuses the order
with **409** if that confirmation is missing, and it calculates the fee itself —
a forged request cannot buy a 1,000 RWF delivery to anywhere in the country.

**Where the rule lives.** `src/lib/fulfilment.ts` holds the pickup point, the
origin coordinates, the radius and both fees. The checkout page and
`POST /api/orders` import the same file, so the screen can only ever show what the
server will charge. To widen the area, change `DELIVERY_RADIUS_KM` there; to move
the collection point, change `PICKUP`. Nothing else hard-codes either.

**What is stored.** Each order keeps `fulfilment_method` (`delivery` / `pickup`),
the customer's `latitude` / `longitude`, and `distance_km`, so an operator can see
exactly why an order was redirected. Existing orders keep `delivery` and their
original fee — migration `0003_order_fulfilment.sql` does not re-price history.

**For staff.** Admin → Orders shows a red *Pickup — do not dispatch a rider* panel
with the customer's distance. Pickup orders still move through the normal status
steps; `delivered` means "handed over at the counter".

Customer-facing surfaces that change: the green banner says **Ready for
collection** instead of *Your order is coming*, the order page and invoice show the
collection point instead of a delivery address, and the cash payment option reads
*cash on collection*.

---

## How payments work right now

**No real payment provider is connected.** With `PAYMENT_MODE=mock` (the `.env.example`
default), Mobile Money / Card orders are marked `paid` immediately; Cash on Delivery stays
`pending` until an admin marks it paid.

> ⚠️ **Mock payments are not revenue.** The admin dashboard labels its figures explicitly:
> *Collected revenue* counts only `paymentStatus = 'paid'`, *Awaiting payment* counts pending
> orders, and cancelled orders are excluded from both. A demo deployment therefore cannot
> report money that was never collected — but you should still set `PAYMENT_MODE=real` for
> anything customer-facing.

To go live: integrate your provider in the `TODO(payments)` block in
`src/app/api/orders/route.ts`, add a webhook route that sets `orders.paymentStatus`, then set
`PAYMENT_MODE=real`.

---

## How images work right now

Uploads are saved to `public/uploads/` and served as `/uploads/<file>`. Only JPG, PNG and WebP
are accepted, verified by **magic bytes** rather than the browser-supplied MIME type, and named
with a random component. SVG is rejected because it can carry script.

⚠️ `public/uploads/` is **ephemeral** on most hosts (Vercel, Railway, Fly, Heroku): files are
lost on redeploy. For production, swap `src/app/api/upload/route.ts` to Cloudinary/S3 and return
that URL — `next.config.ts` already allows remote image hosts.

---

## Database

Schema lives in `src/db/schema.ts`; migrations are committed in `drizzle/`.
Never edit the database by hand — change the schema and run `npm run db:generate`.

* Foreign keys: `order_items → orders/products`, `orders → users`, `reviews → users/products/orders`.
* Indexes on `customer_id`, `status`, `created_at`, `product_id`.
* Order numbers come from a Postgres sequence (`EGG-YYYY-NNNNNN`), generated by
  `next_order_number()` — never `Date.now()`.
* **Products with order history are soft-deleted** (`deleted_at`), never removed, so invoices
  and reviews keep pointing at something real.

### Backup and restore

```bash
# backup
pg_dump "$DATABASE_URL" --format=custom --file=egghub-$(date +%F).dump

# restore into an empty database
pg_restore --clean --if-exists --dbname="$DATABASE_URL" egghub-2026-01-31.dump
```

Test a restore before you need one.

---

## Testing

```bash
npm test              # unit + API integration
npm run test:coverage # coverage report
```

The suite boots an **in-process PostgreSQL (PGlite)** from the committed migrations, so no
database server or Docker is needed. It covers the pricing math, authorization, checkout
(oversell, duplicate cart lines, idempotency), cancellation restock, reviews, promotions,
revenue aggregation, password reset, and the rate limiter.

CI (`.github/workflows/ci.yml`) runs `lint → typecheck → test → build` on every pull request.

---

## Responsive layout and the device checker

The site is designed mobile-first in width terms: it never needs a separate mobile
version. The whole responsive layer is plain CSS in `src/app/globals.css`.

| Width | What changes |
| --- | --- |
| 320–380px | Two-column header (brand + burger), compact buttons, smaller invoice padding, narrower table minimum |
| ≤ 560px | Product/feature grids go to one column, two-column forms stack, cart rows move totals to their own line |
| ≤ 640px | 16px form fields (stops iOS zooming on focus), 44px quantity buttons, card grids tighten |
| ≤ 900px | Desktop nav links become the hamburger panel; 4- and 3-column grids become two; two-column page layouts stack; tables scroll inside `.table-wrap` |
| 901px+ | Full horizontal navigation and the original multi-column layouts |

**Mobile navigation.** Below 900px the links move into a panel under the header. It
opens with the burger, closes with the burger, the ✕, `Escape`, a tap on the dimmed
page behind it, or a tap on any link. The page behind it cannot scroll while it is
open. Every link and the logout button are at least 44px tall.

**Checking it yourself — `/devices`.** A phone frame on the page loads the *real*
routes in an iframe at a real device width (320, 360, 390, 430 and 768px), so what
you see is the site, not a mock-up. Two checks run in the visitor's own browser:

- the open page is measured for horizontal overflow as you switch pages and devices;
- **Check every page** walks all 23 screens at all 5 widths (115 combinations) one
  at a time and fills in the results table.

Nothing is hard-coded: a row shows "✓" only if that page actually fitted that width
in a browser. On a very narrow screen the frame is scaled down and the page says so.

To allow the same-origin frames, `X-Frame-Options` is `SAMEORIGIN` and the CSP says
`frame-ancestors 'self'`. External sites still cannot frame the app.

---

## Go-live checklist

- [ ] `JWT_SECRET` is a real 32+ character random string (not the `.env.example` value).
- [ ] `NEXT_PUBLIC_DEMO_MODE` and `DEMO_MODE` are unset.
- [ ] The admin password is not a known demo value; `ADMIN_EMAIL` is a real inbox.
- [ ] `PAYMENT_MODE=real` (or a real provider wired in with a webhook).
- [ ] Uploads moved off local disk, or a persistent volume is mounted at `public/uploads`.
- [ ] `npm run db:migrate` has been run against the production database.
- [ ] Automated backups are configured and a restore has been tested.
- [ ] A monitor is polling `GET /api/health` and alerting on non-200.
- [ ] `TRUST_PROXY=true` if (and only if) you are behind a proxy — otherwise rate limiting
      will lump every user together.
- [ ] `DATABASE_SSL=true` for managed Postgres.

---

## Future improvements

Real Mobile Money & card payments · real delivery tracking · SMS / email / WhatsApp notifications
· QR-code receipts · advanced analytics · campaign scheduling · multiple delivery zones/fees ·
automatic low-stock alerts.
