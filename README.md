# 🥚 EggHub Rwanda (egg-net)

**Fresh Eggs. Easy Ordering. Reliable Delivery.**

EggHub Rwanda is a full-stack egg-selling platform. **Customers** browse products, order, pay (demo flow), track deliveries and review. **Admins** manage products, stock, orders, customers, promotions and sales analytics.

**Stack:** Next.js 16 (App Router, React 19) · PostgreSQL + Drizzle ORM · JWT auth (HttpOnly cookie + Bearer fallback) · Tailwind base + hand-written CSS design system · Vitest (unit + real-database integration tests) · GitHub Actions CI.

---

## Quick start (any OS — no PostgreSQL install needed)

```bash
npm install
cp .env.example .env        # Windows: copy .env.example .env

npm run db:local            # terminal 1: embedded PostgreSQL on port 5433
npm run seed                # terminal 2: migrations + admin + sample products
npm run dev                 # terminal 2: http://localhost:3000
```

Default local logins (development only):

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@egghub.rw` | `Admin1234` (or your `ADMIN_PASSWORD`) |
| Customer | `demo@egghub.rw` | `Demo1234` |

> Already have PostgreSQL installed? Point `DATABASE_URL` in `.env` at it and use
> `npm run db:migrate && npm run seed` instead of `db:local`.

## Scripts

| Script | What it does |
|--------|--------------|
| `npm run dev` | Start the dev server |
| `npm run build` / `start` | Production build / serve |
| `npm run check` | Lint + typecheck + all tests (what CI runs) |
| `npm test` | Unit tests + API integration tests on a real embedded PostgreSQL |
| `npm run db:local` | Run a local embedded PostgreSQL (data in `.pgdata/`) |
| `npm run db:generate` | Generate SQL migrations from `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` |
| `npm run db:studio` | Drizzle Studio (DB browser) |
| `npm run seed` | Migrate + create first admin, demo customer (dev) and sample products |

---

## Deploying to Vercel (production)

The app is serverless-ready: images are stored **in the database** (not on disk),
sessions use a signing secret from env or the DB, and the pool is small with SSL.

1. **Create a Postgres database.** Easiest: Vercel dashboard → Storage → add
   **Neon** (free tier works). Copy the **pooled** connection string.
2. **Import the repo** in Vercel (framework preset: Next.js — no extra config).
3. **Set environment variables** in Vercel → Project → Settings → Environment Variables:

   | Variable | Value |
   |----------|-------|
   | `DATABASE_URL` | pooled Neon connection string (`...-pooler...neon.tech/...?sslmode=require`) |
   | `JWT_SECRET` | long random string — `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
   | `ADMIN_EMAIL` | your admin email |
   | `ADMIN_PASSWORD` | strong password, min 8 chars (**required** in production) |
   | `SETUP_SECRET` | another random string (protects the setup endpoint) |
   | `NEXT_PUBLIC_ENABLE_DEMO` | `false` (set `true` only for a throwaway demo) |

4. **Deploy**, then run migrations + setup **once** from your machine:

   ```bash
   DATABASE_URL="<your neon url>" npm run db:migrate
   curl -X POST https://YOUR-APP.vercel.app/api/setup -H "x-setup-secret: <SETUP_SECRET>"
   ```

   (Or run `npm run seed` with `DATABASE_URL` pointed at Neon — it migrates and
   sets up in one step.)
5. **Verify:** open `https://YOUR-APP.vercel.app/api/health` → `{"ok":true,"db":"up"}`.

> **Why the old deployment showed "No products yet":** `/api/health` returned
> `{"ok":false}` — the Vercel project had no reachable `DATABASE_URL`, so every
> query failed. Steps 1–4 above are the fix.

---

## Features

**Customer** — register/login · browse/search/sort · product pages with reviews ·
cart (localStorage) · checkout with delivery details · server-calculated totals ·
order history & live status tracking · printable invoice · profile management ·
reviews after delivery.

**Admin** — dashboard (sales, orders, customers, low stock, pending) · product
CRUD with image upload · quick stock edits & availability toggles · order
management with status/payment updates (cancel restores stock) · customers list ·
sales analytics (7-day chart, top products) · store-wide promotions.

## Security & correctness

- bcrypt password hashing; password changes require the current password
- JWT in an **HttpOnly cookie** (+ Bearer fallback for embedded previews); secrets rotatable without logging everyone out
- Role checks on **every** admin API; registration can never create an admin
- One-time setup endpoint protected by `SETUP_SECRET` + advisory lock; no default password in production
- Rate limiting on login/register/setup; constant-time login for unknown emails
- Checkout: prices, discounts, delivery and stock computed **server-side**; product rows locked (`FOR UPDATE`) + atomic stock updates → **no overselling** under concurrent orders
- Order numbers from a DB sequence (no collisions); cancelling an order restores stock
- Uploads validated by magic bytes (JPEG/PNG/WebP/GIF only), stored in Postgres, served with immutable caching — works on read-only serverless filesystems
- Input validation + length caps on every route; parameterized SQL everywhere (Drizzle)
- Security headers (`nosniff`, referrer policy), `robots.txt`, custom 404/error pages

## Payments (demo mode)

No real provider is connected yet. `src/lib/payments.ts` is the single seam:
Mobile Money/Card are marked `paid` by a **labelled mock**; Cash on Delivery stays
`pending` until the admin marks it paid. To go live, implement `processPayment()`
with your provider (e.g. MTN MoMo Collections) and add a webhook route that
updates `orders.paymentStatus`.

## Project structure

```
src/
├── app/
│   ├── (public pages)           home, about, contact, products, login, register
│   ├── (customer pages)         cart, checkout, dashboard, orders, profile
│   ├── admin/                   dashboard, products, orders, customers, sales, promotions
│   └── api/                     REST endpoints (the "backend")
│       ├── auth/                register, login, logout, profile
│       ├── products/            public list/detail + admin CRUD
│       ├── orders/              create/list/detail + admin status updates
│       ├── admin/               dashboard, customers, orders, sales (SQL aggregates)
│       ├── reviews/             create + per-product list
│       ├── promotions/          admin CRUD + public active promotion
│       ├── upload/ + images/    DB-backed image upload & serving
│       ├── setup/               one-time admin creation
│       └── health/              readiness probe (app + DB)
├── components/                  Navbar, Footer, ProductCard, forms, tracker, …
├── db/                          schema.ts (tables), index.ts (pool)
└── lib/
    ├── auth.ts                  hashing, JWT, cookies, requireUser/requireAdmin
    ├── jwt-secret.ts            env-first signing secret with rotation support
    ├── pricing.ts               delivery fee + discount rules (server-only)
    ├── payments.ts              payment provider seam (mock, clearly labelled)
    ├── setup.ts                 shared setup logic (API + seed script)
    ├── rate-limit.ts            in-memory limiter for sensitive endpoints
    ├── validate*.ts             input validation (unit-tested)
    └── client/                  api helper, cart, notices, React store hooks
drizzle/                         generated SQL migrations
scripts/                         dev-db.mjs (embedded PG), seed.ts
tests/                           unit + real-DB integration tests
.github/workflows/ci.yml         lint + typecheck + test + build on every push
```

## API overview

| Method | Route | Who |
|--------|-------|-----|
| POST | `/api/auth/register` | public (creates customer) |
| POST | `/api/auth/login` / `logout` | public |
| GET / PUT | `/api/auth/profile` | logged in |
| GET | `/api/products` (`?search=`, `?inStock=`), `/api/products/:id` | public (`?all=true` admin) |
| POST / PUT / DELETE | `/api/products`, `/api/products/:id` | admin |
| POST | `/api/upload` → `/api/images/:id` | admin / public |
| POST / GET | `/api/orders` | customer (admin sees all) |
| GET | `/api/orders/:id` | owner or admin |
| PUT | `/api/orders/:id/status` | admin |
| GET | `/api/admin/dashboard`, `/customers`, `/orders`, `/sales` | admin |
| POST | `/api/reviews` | customer (delivered orders only) |
| GET | `/api/reviews/product/:productId` | public |
| GET | `/api/promotions/active` | public |
| GET / POST / PUT / DELETE | `/api/promotions`, `/api/promotions/:id` | admin |
| POST | `/api/setup` | one-time; `x-setup-secret` when configured |
| GET | `/api/health` | public readiness probe |

Auth: session cookie is set automatically; APIs also accept `Authorization: Bearer <token>`.

## Testing the app manually

| Step | What to do |
|------|------------|
| Register | Create a customer account → logged in |
| Admin | Login as admin → Dashboard |
| Products | Admin → Products → add/edit, upload image, toggle availability |
| Cart & checkout | Add to cart → checkout → place order (stock drops immediately) |
| Tracking | Admin → Orders → change status; customer order page shows the tracker |
| Cancel | Admin cancels an order → stock is restored |
| Invoice | Order → View Invoice → Print / Save as PDF |
| Reviews | After status = Delivered, customer can review from the order page |
| Promotions | Admin → Promotions → create 10% active today → discount shows in cart & checkout |

## Future improvements

Real Mobile Money & card payments · SMS/email notifications · delivery zones & fees ·
Cloudinary/S3 image storage · distributed rate limiting (Upstash) · advanced analytics.
