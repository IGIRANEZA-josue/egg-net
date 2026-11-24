# Prompt: Harden and complete EggHub Rwanda (`egg-net`)

> **How to use this prompt:** paste everything below into your coding agent. It is self-contained — it assumes the agent can read the repository but has no other context about the review that produced it. Work the items **in order**, one commit per item, and run the verification commands after each one.

---

## 1. Role and mission

You are a senior full-stack engineer doing a production-hardening pass on **EggHub Rwanda**, an e-commerce app for selling eggs in Rwanda. The codebase already works end-to-end for a demo; your job is to close the gap between "demo" and "safe to put in front of paying customers."

**You are not rewriting the app.** Preserve the existing routes, page structure, CSS class names, design language, and API response shapes. Fix the specific defects below, add the missing tests and tooling, and update the documentation. Every change should be explainable to a reviewer in one sentence.

## 2. Repository snapshot

- **Framework:** Next.js `16.2.6` (App Router, `src/app`), React `19.2.6`, TypeScript `5.9.3` strict-ish config.
- **Data:** PostgreSQL via Drizzle ORM `0.45.2` + `pg` `8.20.0`. Schema in `src/db/schema.ts`; connection pool in `src/db/index.ts`.
- **Auth:** `bcryptjs` `^3.0.3` password hashing, `jsonwebtoken` `^9.0.3` JWT.
- **Styling:** `src/app/globals.css` ("printed catalogue" design system) + Tailwind v4 via PostCSS. Do **not** migrate components to Tailwind utility classes.
- **Scripts:** `dev`, `build`, `start`, `lint` (`eslint .`), `typecheck` (`tsc --noEmit`). **No `test` script.**
- **Missing entirely:** `.github/`, `drizzle/` migrations, `src/app/error.tsx`, `src/app/not-found.tsx`, `src/app/global-error.tsx`, `middleware.ts`, `public/` directory, `docker-compose.yml`.
- **Tables:** `users`, `products`, `orders`, `order_items`, `reviews`, `settings`, `promotions` — all defined in `src/db/schema.ts` with **no foreign keys** and no indexes beyond `users.email` and `orders.order_number`.
- **Roles:** `admin` and `customer`. Public registration always forces `customer`.
- **Money:** integer RWF. Flat delivery fee `1000` in `src/lib/pricing.ts`. Product-level `discount` is a percentage; promotions are store-wide `percentage` or `fixed`.

## 3. Ground rules

1. **Do not rename routes, files, exported functions, or CSS classes** unless an item below explicitly says to.
2. **Keep error responses in the existing shape:** `{ "message": string }` via `errorResponse()` from `src/lib/auth.ts`. Keep the existing user-facing copy style (second person, plain language, no stack traces, no internal identifiers).
3. **Never trust the client** for prices, discounts, delivery fees, stock, roles, or order status. Preserve the existing principle that the server recalculates all totals at checkout.
4. **One item = one commit**, with a message like `fix(orders): atomic stock decrement and duplicate-line merge`. Do not bundle unrelated changes.
5. After every item run: `npm run lint && npm run typecheck`. They must both pass. After Phase A, also run `npm test && npm run build`.
6. Add no new runtime dependencies without stating why in the commit message. `zod`, `vitest`, and a rate-limiting library are pre-approved.
7. Do not commit `.env`, `node_modules`, `.next`, or `public/uploads/*`.
8. If an item is ambiguous, prefer the **smaller** change that removes the risk, and note the trade-off in the commit body.

## 4. Work order

Items are grouped into phases with a hard dependency order. Do not start a phase until the previous one is green.

| Phase | Theme | Items |
|-------|-------|-------|
| **A** | Foundations: migrations, schema, test harness, CI | 1, 2, 3 |
| **B** | Auth and access control | 4, 5, 6, 7, 8 |
| **C** | Money and inventory correctness | 9, 10, 11, 12, 13 |
| **D** | API robustness and performance | 14, 15, 16, 17 |
| **E** | Frontend correctness and polish | 18, 19, 20, 21, 22 |
| **F** | Documentation and DX | 23, 24, 25 |

---

# Phase A — Foundations

## Item 1 — Replace `drizzle-kit push` with committed migrations, driven by the environment

**Priority:** P0 (blocks almost everything else)
**Files:** `drizzle.config.json` → `drizzle.config.ts`, new `drizzle/` directory, `package.json`, `README.md`

**Problem:** The Drizzle config is JSON with a **hardcoded** `postgresql://postgres:postgres@127.0.0.1:5432/app_db` URL. Changing `DATABASE_URL` therefore has no effect on schema operations, and there is no migration history at all — the README's setup step is `npx drizzle-kit push`, which silently diffs and applies whatever it finds. Nothing can be reviewed, rolled back, or run in CI.

**Required change:**
1. Create `drizzle.config.ts` that reads `process.env.DATABASE_URL` (load it with the already-present `dotenv` dev dependency via `dotenv/config`) and **throws a clear error at startup if it is unset**.
2. Delete `drizzle.config.json`.
3. Add scripts: `"db:generate": "drizzle-kit generate"`, `"db:migrate": "drizzle-kit migrate"`, `"db:studio": "drizzle-kit studio"`, `"db:seed": "tsx src/db/seed.ts"`.
4. Generate an initial migration from the current schema and commit `drizzle/`.
5. Add `src/db/seed.ts`: idempotent seeding of the five sample products currently inlined in `src/app/api/setup/route.ts`, plus a **demo customer** (`demo@egghub.rw` / `Demo1234`) and the demo admin, all read from env with no shared defaults in production (see Item 8).
6. Update the README setup flow to `db:migrate` + `db:seed` instead of `drizzle-kit push`.

**Done when:** a fresh database can be brought up with `npm run db:migrate && npm run db:seed`, `git status` is clean afterwards, and the schema comes purely from `drizzle/`.

---

## Item 2 — Add a real test harness

**Priority:** P0
**Files:** `package.json`, new `vitest.config.ts`, new `src/**/__tests__/*.test.ts`, new `src/test/helpers.ts`

**Problem:** There is not a single test file, no test runner, and no `test` script. The riskiest logic in the app — discount math, stock decrement, authorization — is completely uncovered.

**Required change:**
1. Add `vitest`, `@vitest/coverage-v8`, and `supertest`-free route testing via direct handler invocation (Next route handlers are plain functions — call `POST(request)` with a constructed `Request`).
2. Add `"test": "vitest run"`, `"test:watch": "vitest"`, `"test:coverage": "vitest run --coverage"` to `package.json`.
3. Use a **separate test database** (`DATABASE_URL_TEST`, default `postgresql://postgres:postgres@127.0.0.1:5433/app_db_test`), migrated in a `globalSetup` that runs the Drizzle migrator. Truncate tables between tests.
4. Write the following tests. Assert behavior, not implementation details.

   **Pure unit tests (`src/lib/pricing.ts`):**
   - `calculateDiscount`: percentage rounds to nearest integer; `fixed` never exceeds subtotal; zero/negative subtotal returns 0; `null` promotion returns 0; 100% percentage returns full subtotal.
   - `effectivePrice`: 0/undefined discount returns the original price; 10% on `1500` returns `1350`; result is a whole number.
   - `readProductBody` / `readPromotionBody` (in `src/lib/validate-*.ts`): reject negative stock, non-integer package size, price `0`, percentage `> 100`, end date before start date; accept a date-only end date and confirm it expands to `23:59:59`.

   **Auth (`src/lib/auth.ts`):**
   - `requireAdmin` returns 403 for a valid customer token.
   - `requireUser` returns 401 with no token and 401 with a garbage token.
   - A token signed with a secret that is **not** in the verification list is rejected.

   **Checkout (`src/app/api/orders/route.ts`):**
   - Happy path: creates order, `order_items`, and decrements stock by exactly the ordered quantity.
   - Oversell: ordering more than `stock` returns 400/409 and **does not** decrement stock.
   - **Duplicate lines:** cart `[{id:1,qty:2},{id:1,qty:3}]` with `stock: 10` produces **one** `order_items` row with quantity 5 and stock `5` — not two rows and not stock `7`.
   - Unavailable product (`isAvailable: false`) is rejected.
   - Client-supplied prices are ignored: posting a fake `price: 1` still charges the DB price.
   - Cache/stock isolation: two sequential orders for the last unit — the second fails.

   **Cancellation (`src/app/api/orders/[id]/status/route.ts`):**
   - `→ cancelled` restores stock exactly once.
   - Calling cancel twice does **not** double-restock.
   - `delivered → pending` is rejected (400).

   **Reviews (`src/app/api/reviews/route.ts`):**
   - Rejected before delivery; accepted after; second review of the same product for the same order is rejected.

**Done when:** `npm test` runs green from a clean checkout with a Postgres available, and coverage of `src/lib/pricing.ts` and `src/lib/auth.ts` is above 80%.

---

## Item 3 — Add CI

**Priority:** P1
**Files:** new `.github/workflows/ci.yml`

**Problem:** No CI. Lint and typecheck scripts exist but nothing enforces them, and there is no protection against a broken build reaching `main`.

**Required change:** a workflow on `pull_request` and `push: main` that runs on Node 22 with a `postgres:16` service container, then:
`npm ci` → `npm run lint` → `npm run typecheck` → `npm test` → `npm run build`, with `DATABASE_URL` pointed at the service. Cache `~/.npm`. Fail the job on any step failure. Add a `concurrency` group that cancels superseded runs.

**Done when:** the workflow file is valid YAML, all steps are named, and a deliberately broken typecheck fails the job locally (verify with `act` if available, otherwise confirm the command chain by running it).

---

# Phase B — Auth and access control

## Item 4 — Move the JWT signing secret out of the database, and delete the fallback/acceptance machinery

**Priority:** P0 — highest single risk in the repo
**Files:** `src/lib/jwt-secret.ts`, `src/lib/auth.ts`, `.env.example`, `README.md`, `src/db/schema.ts`

**Problem:** `src/lib/jwt-secret.ts` generates a signing secret, stores it **in plaintext in the `settings` table**, and reuses it forever. It also:
- accepts `JWT_SECRET_FALLBACK` indefinitely as a verification secret;
- accepts every historical row named `jwt_secret_accept_*` indefinitely via `addAcceptedSecret()`;
- **will happily persist the literal string from `.env.example`** (`change-me-to-a-long-random-string`) as the production signing key, because it only checks whether `process.env.JWT_SECRET` is truthy;
- caches a **promise** (`let cached: Promise<Secrets>`), so if the first `load()` rejects — DB down, or two cold starts racing on the `settings` primary key insert — every subsequent request in that process returns 503 until restart.

A database dump therefore hands an attacker the ability to mint valid admin tokens, and the schema carries secrets it has no business carrying.

**Required change:**
1. Rewrite `src/lib/jwt-secret.ts` to read `process.env.JWT_SECRET` only. Throw a descriptive error at module load if it is missing, shorter than 32 characters, or exactly equals any value in a small `KNOWN_PLACEHOLDERS` list (include the `.env.example` default).
2. Delete `getVerificationSecrets()` and `addAcceptedSecret()`. Replace with a single `getSigningSecret(): string` and one verification call. If you want rotation, implement it as `JWT_SECRET_PREVIOUS` that is **removed** once rotation is complete — no DB rows.
3. Update `src/lib/auth.ts` to verify against exactly one secret.
4. Drop the `settings` table from `src/db/schema.ts` (it has no other consumer — confirm with `grep -rn "settings" src/`) and generate a migration that drops it. **Preserve existing sessions is impossible by design — state this explicitly in the migration description and the README.** Note in the commit body that all users will need to log in again once.
5. Generate a `.env.example` that includes a `JWT_SECRET=` line with `# required — generate with: openssl rand -hex 32` and no usable default.

**Done when:** `grep -rn "jwt_secret\|JWT_SECRET_FALLBACK\|addAcceptedSecret" src/` returns nothing, and starting the app without `JWT_SECRET` fails fast with a readable message rather than minting a random secret.

---

## Item 5 — Stop storing the token in `localStorage` and in a non-HttpOnly cookie

**Priority:** P0
**Files:** `src/lib/client/api.ts`, `src/app/api/auth/login/route.ts`, `src/app/api/auth/register/route.ts`, `src/lib/auth.ts`, `src/components/Navbar.tsx`, `src/app/admin/layout.tsx`, all pages calling `getSavedUser()`

**Problem:** The same token is written to `localStorage`, to a cookie via `document.cookie` with **no `HttpOnly` and no `Secure`** (`src/lib/client/api.ts` ~L53–56 — it sets it twice, once with `samesite=none; secure` and once without), and sent on every request in **two** headers (`Authorization` **and** a custom `x-egghub-token`). Any XSS exfiltrates a 7-day credential, and logout only clears client storage while the token stays valid server-side.

**Required change:**
1. `/api/auth/login` and `/api/auth/register` set the token via `NextResponse.cookies.set("egghub_token", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60*60*24*7 })`.
2. `/api/auth/logout` (**new route**, `POST`) clears the cookie server-side. `Navbar` calls it before redirecting.
3. `src/lib/client/api.ts`: remove `localStorage` token storage, remove `writeCookie`, remove the `x-egghub-token` header, and set `credentials: "same-origin"` on `fetch`. The client no longer needs to know the token exists.
4. `getSavedUser` / `saveAuth` keep only the non-sensitive user profile (`id`, `name`, `email`, `role`) and can stay in `localStorage` for UI rendering — but **never** gate access on it. `src/app/admin/layout.tsx` must call `GET /api/auth/profile` and only then render children, rather than trusting `getSavedUser().role`.
5. `src/lib/auth.ts`: `getTokenFromRequest` reads the cookie first, then `Authorization: Bearer` (keep Bearer for API clients). Delete the custom-header branch.
6. Shorten token lifetime to `24h` and add `iss`/`aud` claims.

**Done when:** `document.cookie` appears nowhere in `src/`, `localStorage` holds no token, and a manual login → refresh → logout cycle works with the cookie alone.

---

## Item 6 — Add rate limiting, constant-time login, and user enumeration protection

**Priority:** P0
**Files:** `src/app/api/auth/login/route.ts`, `src/app/api/auth/register/route.ts`, new `src/lib/rate-limit.ts`, new `middleware.ts` (optional)

**Problem:** No throttling anywhere. Unlimited password guesses against bcrypt cost 10, unlimited account creation, and `"Email already registered."` reports exactly which addresses exist. The login page literally advertises the admin email, so the first guess is `admin@egghub.rw`.

**Required change:**
1. Create `src/lib/rate-limit.ts` with a Postgres-backed counter table (`rate_limits(key text, window_start timestamptz, count int, primary key(key, window_start))`) and a fixed-window `check(key, limit, windowSeconds)` helper that runs a single atomic upsert. Add a migration.
2. Login: 5 attempts per 15 minutes per `ip+email` and 20 per 15 minutes per IP. Return **429** with `"Too many attempts. Please try again in a few minutes."` Never reveal which of the two limits tripped.
3. Register: 5 per hour per IP.
4. Compute the dummy bcrypt compare on unknown emails so the response time does not distinguish "no such user" from "wrong password", and change the duplicate-email message to a neutral one (`"If this email is available, your account has been created."` is dishonest for a synchronous flow — instead return the same generic `"Could not create your account. Please check your details."` with a 409 status and log the real reason server-side).
5. Raise bcrypt cost from `10` to `12` in `src/lib/auth.ts`.
6. Trust `x-forwarded-for` only when `TRUST_PROXY=true`, otherwise use the socket address the platform provides.

**Done when:** an automated test fires 6 bad logins in a row and the 6th returns 429; an unknown email and a wrong password produce indistinguishable responses and comparable timings.

---

## Item 7 — Require the current password to change it; add a reset path

**Priority:** P1
**Files:** `src/app/api/auth/profile/route.ts`, `src/app/profile/page.tsx`, new `src/app/api/auth/forgot-password/route.ts`, new `src/app/api/auth/reset-password/route.ts`, `src/db/schema.ts`

**Problem:** `PUT /api/auth/profile` accepts a new `password` with **no re-authentication**, so a stolen session (see Items 4–5) becomes a permanent account takeover. There is also **no password reset flow of any kind** — a customer who forgets their password is locked out forever, and there is no admin-side reset endpoint either.

**Required change:**
1. Require `currentPassword` when `body.password` is present; verify it with bcrypt; return 400 `"Your current password is incorrect."` on mismatch.
2. Raise the minimum from 6 to 8 characters, and reject passwords equal to the email or a list of the ten most common ones.
3. Add `password_reset_tokens(id, user_id, token_hash, expires_at, used_at)` with a migration. `POST /api/auth/forgot-password` always returns 200 (no enumeration), generates a 32-byte token, stores **only its SHA-256 hash**, expires in 60 minutes, and logs the reset URL server-side (email delivery is out of scope — leave a `TODO` with the exact integration point).
4. `POST /api/auth/reset-password` accepts `token` + `newPassword`, marks the token used atomically, invalidates all other outstanding tokens for that user, and returns 200.
5. Add `POST /api/admin/customers/[id]/reset-password` (admin only) that generates a temporary password and returns it once.

**Done when:** changing a password without the current one returns 400, and a full forgot → reset → login cycle works.

---

## Item 8 — Remove hardcoded demo credentials from the production path; either seed the demo customer or drop the buttons

**Priority:** P0 (credential exposure) / P1 (broken UX)
**Files:** `src/app/login/page.tsx` (~L68–84), `src/app/api/setup/route.ts`, `.env.example`, `README.md`

**Problem:** The login page prints `admin@egghub.rw / Admin1234` and wires it to a one-click button; `/api/setup` falls back to those exact credentials when the env vars are unset. Separately, the page advertises a **demo customer** (`demo@egghub.rw / Demo1234`) that **nothing ever creates** — `/api/setup` creates only the admin and five products — so "Login as demo customer" always fails with "Invalid email or password."

**Required change:**
1. Wrap the whole demo block in `{process.env.NEXT_PUBLIC_DEMO_MODE === "true" && ...}`. When the flag is off, render nothing.
2. `/api/setup` must refuse to run unless `ADMIN_EMAIL` **and** `ADMIN_PASSWORD` are set and the password is not in a small deny-list (`Admin1234`, `password`, `changeme`). Return 500 with a clear operator-facing message otherwise.
3. Seed the demo customer in `src/db/seed.ts` (Item 1) and gate its creation on the same `DEMO_MODE` flag.
4. `/api/setup` must run inside a transaction and take a row-level lock (or use an advisory lock) so two simultaneous calls cannot both create an admin.
5. Add a one-time "You are using a demo password — change it now" banner for the seeded admin, visible only when the seeded password is still in use (store a `must_change_password` boolean on `users`).

**Done when:** with `NEXT_PUBLIC_DEMO_MODE` unset, the login page shows no credentials and no demo buttons; with it set, both demo logins work.

---

# Phase C — Money and inventory

## Item 9 — Make checkout idempotent

**Priority:** P0 (double charges, duplicate orders)
**Files:** `src/app/api/orders/route.ts`, `src/db/schema.ts`, `src/app/checkout/page.tsx`

**Problem:** There is no idempotency key. The checkout button is only disabled for the in-flight request, so a network retry, a double click on a slow connection, or a browser back-and-resubmit creates a **second order and a second stock decrement**. Under the mock payment this looks harmless; with a real payment provider it is a double charge.

**Required change:**
1. Add `orders.idempotency_key text unique` (nullable, for backwards compatibility) and a migration.
2. `POST /api/orders` reads `Idempotency-Key` from the request. If a row exists with that key **and** the same `customerId`, return the existing order with **200** instead of creating a new one.
3. `src/app/checkout/page.tsx` generates `crypto.randomUUID()` once per checkout attempt (on mount, reset after success) and sends it as the header.
4. Return **409** if the same key is reused with a different payload.

**Done when:** posting the same key twice yields one order row, one stock decrement, and two 2xx responses.

---

## Item 10 — Atomic stock decrement, merged duplicate lines, and correct transaction boundaries

**Priority:** P0
**Files:** `src/app/api/orders/route.ts` (~L33–100)

**Problem:** Three defects in one flow:
1. Products are read **before** `db.transaction()`, and stock is written as `product.stock - line.quantity` from those stale values. Two concurrent checkouts both pass validation and oversell; even inside the transaction this is a blind overwrite, not a guarded decrement.
2. If the cart contains the same `productId` twice, two `order_items` rows are written and the second `set({ stock })` overwrites the first using the **original** stock minus only that line. Result: under-decrement, plus a subtotal that may double-count.
3. Validation errors are returned from inside `try`, but non-validation failures collapse to the generic `"Failed to place order."`, which hides which product failed.

**Required change:**
1. Move the product read **inside** `db.transaction(async (tx) => ...)`, selecting with `for("update")` (Drizzle: `.for("update")`) on the specific ids.
2. Merge duplicate `productId`s **before** pricing: build a `Map<number, qty>`, validate each merged quantity against stock, and emit one `order_items` row per product.
3. Decrement with an atomic guard:
   ```ts
   const [updated] = await tx.update(products)
     .set({ stock: sql`${products.stock} - ${qty}`, updatedAt: new Date() })
     .where(and(eq(products.id, id), gte(products.stock, qty)))
     .returning();
   if (!updated) throw new InsufficientStockError(name);
   ```
   Keep `for("update")` as the primary mechanism; the guard is defence in depth.
4. Catch a typed `InsufficientStockError` and return **409** with `Only ${stock} of ${name} left in stock.` Any other error → log with a correlation id and return the generic 500.
5. Cap cart lines at 50 and quantity at 1000 to bound the transaction.

**Done when:** the Item 2 tests for the oversell and duplicate-line cases pass, and a manual concurrency test (`seq | xargs -P 10 curl`) against the last unit produces exactly one 201.

---

## Item 11 — Restock on cancellation and constrain status transitions

**Priority:** P0 (silent inventory loss)
**Files:** `src/app/api/orders/[id]/status/route.ts`, `src/db/schema.ts`

**Problem:** Setting `orderStatus: "cancelled"` restores **nothing** — the units are gone from inventory forever. The same endpoint allows `delivered → pending`, `cancelled → paid`, and every other nonsense transition, with no reason field and no record of who changed what. It also has **no `try/catch`** and no `Number(id)` validation.

**Required change:**
1. Define an explicit transition table:
   ```
   pending → confirmed | cancelled
   confirmed → preparing | cancelled
   preparing → out_for_delivery | cancelled
   out_for_delivery → delivered | cancelled
   delivered → (terminal)
   cancelled → (terminal)
   ```
   Reject anything else with **409** `"This order cannot move from X to Y."`
2. Perform the update **and** the restock in one `db.transaction`, with the order row locked (`for("update")`) and the current status re-read **inside** the transaction. Restock each `order_items` line with an atomic `sql` increment. Because the transition table makes `cancelled` terminal, double-restock is impossible — assert it in a test anyway.
3. Add `status_changed_by integer` (references `users.id`) and `status_changed_at timestamptz` to `orders`, plus `cancellation_reason text`. Return these in the admin order detail response.
4. Require a `reason` when cancelling (`"Customer refused delivery"`, etc.); 400 if missing.
5. Do **not** touch `paymentStatus` implicitly. Cancelling a paid order should surface a refund-needed flag (`refund_required boolean default false`) rather than silently flipping payment to `failed`.

**Done when:** the restock tests from Item 2 pass and an invalid transition returns 409 without touching stock.

---

## Item 12 — Deterministic promotion selection, and prevent overlapping active promotions

**Priority:** P1
**Files:** `src/lib/pricing.ts`, `src/lib/validate-promotion.ts`, `src/app/api/promotions/[id]/route.ts`

**Problem:** `getActivePromotion()` selects every active in-range promotion with **no `orderBy` and no `limit`**, then returns `rows[0]`. PostgreSQL is free to return them in any order, so when two promotions overlap (nothing forbids it) the customer's discount can change from request to request. Promotions are also store-wide with no per-product scoping.

**Required change:**
1. Add `.orderBy(desc(promotions.value), desc(promotions.createdAt)).limit(1)` and document the tiebreak in a comment: the most generous active promotion wins.
2. Add `.for("update")`-free but serializable overlap validation in the create/update handlers: reject a new active promotion whose `[startDate, endDate]` intersects an existing **active** promotion with **409** `"Another promotion is already active for these dates."` Alternatively enforce it with a Postgres exclusion constraint (`tstzrange` + `EXCLUDE USING gist`) — preferred if you are comfortable with the constraint.
3. Validate `value` is an integer for `fixed` and that `percentage` discounts produce a whole-RWF result (rounding already happens in `calculateDiscount` — assert it).
4. Add a `product_id` nullable column to `promotions` and apply product-scoped promotions in `effectivePrice`; keep store-wide behavior when `product_id` is null. Update `readPromotionBody` accordingly.

**Done when:** creating two overlapping active promotions is refused, and a test asserts the same promotion is chosen across 100 calls.

---

## Item 13 — Fix the order-number generator

**Priority:** P1
**Files:** `src/app/api/orders/route.ts` (L70), `src/db/schema.ts`

**Problem:** `"EGG" + Date.now().toString().slice(-6)` gives a 1,000,000-value space that recycles roughly every 16.7 minutes, backed by a `UNIQUE` constraint. Two orders in the same millisecond throw inside the transaction and surface as the generic failure message.

**Required change:** use a Postgres sequence-backed number, e.g. `EGG-${year}-${paddedSequence}` via a `nextval` on a dedicated sequence (add it in a migration), or a random 8-character base32 suffix with a unique-violation retry. Whichever you pick, wrap the insert in a retry loop (max 3) for `23505` on `order_number`.

**Done when:** a test inserts 500 orders in a loop with no collisions, and the format is documented in the schema comment.

---

# Phase D — API robustness

## Item 14 — One error-handling wrapper, safe JSON parsing, and validated IDs

**Priority:** P0 (crash surface)
**Files:** new `src/lib/api-handler.ts`, `src/lib/parse-id.ts`, and every route under `src/app/api/**`

**Problem:** Roughly ten handlers have no `try/catch`, so a DB blip returns Next's default HTML 500 instead of `{ message }` JSON. `await request.json()` is unguarded in about ten places — a malformed body throws before validation runs. Every `[id]` route does `Number(id)` with no check, so `/api/products/abc` raises `invalid input syntax for type integer` **inside Postgres** rather than returning a clean 404.

**Required change:**
1. `src/lib/api-handler.ts` exporting `withApi(handler, options)` that: parses JSON safely (400 `"Invalid request body."` on failure), catches all errors, maps a small set of typed errors to status codes, logs `{ correlationId, route, method, error }` server-side, and returns the generic `errorResponse` shape with the correlation id **never** exposed in production.
2. `src/lib/parse-id.ts`: `parseId(value): number | null`, returns null unless the value is a positive integer ≤ `Number.MAX_SAFE_INTEGER`. Every dynamic route uses it and returns 404 on null.
3. Refactor **all** API routes onto the wrapper. Do not change their response bodies.
4. Add `src/app/error.tsx`, `src/app/global-error.tsx`, and `src/app/not-found.tsx` with the existing design language (`.page.container`, `.alert.alert-error`) and a "Try again" button calling `reset()`.

**Done when:** `grep -rn "request.json()" src/app/api` shows only calls inside the wrapper, and `/api/products/abc` returns `{ "message": "Product not found." }` with status 404.

---

## Item 15 — Add foreign keys, indexes, and stop hard-deleting referenced products

**Priority:** P1
**Files:** `src/db/schema.ts`, `src/app/api/products/[id]/route.ts`, migration

**Problem:** `order_items.order_id`, `order_items.product_id`, `reviews.*`, and `orders.customer_id` are plain integers with no `references()`. `DELETE /api/products/:id` hard-deletes rows still referenced by order history and reviews, so reviews attach to nothing and sales reports group by a ghost id. There are no indexes on `customer_id`, `order_id`, `product_id`, or `created_at`, so every list and join is a sequential scan.

**Required change:**
1. Add references:
   - `orderItems.orderId → orders.id` `onDelete: "cascade"`
   - `orderItems.productId → products.id` `onDelete: "restrict"`
   - `orders.customerId → users.id` `onDelete: "restrict"`
   - `reviews.customerId → users.id`, `reviews.productId → products.id`, `reviews.orderId → orders.id` — all `"restrict"` or `"cascade"` as appropriate, and add a unique `(orderId, productId, customerId)`.
2. Add indexes on `orders.customer_id`, `orders.order_status`, `orders.created_at`, `order_items.order_id`, `order_items.product_id`, `reviews.product_id`, `promotions.active`.
3. Because existing data may violate these, the migration must include a data-cleanup step (or be written as `NOT VALID` + a follow-up `VALIDATE`) — document the approach in the migration comment.
4. Change `DELETE /api/products/:id` to **soft-delete** (`is_available = false`, `deleted_at = now()`) when the product appears in any `order_items` or `reviews` row; hard-delete only when unreferenced. Return 409 with `"This product has order history and cannot be deleted. It has been marked unavailable instead."` and an idempotent boolean `softDeleted: true` so the UI can explain it.
5. Public product queries must exclude `deleted_at IS NOT NULL`.

**Done when:** deleting a product with order history keeps the order intact, hides the product from the storefront, and returns the explanatory 409. Deleting an unreferenced product still hard-deletes.

---

## Item 16 — Push filtering, sorting, and aggregation into SQL; add pagination

**Priority:** P1 (scalability)
**Files:** `src/app/api/products/route.ts`, `src/app/api/orders/route.ts` (GET), `src/app/api/admin/dashboard/route.ts`, `src/app/api/admin/sales/route.ts`, `src/app/api/admin/customers/route.ts`, `src/app/api/admin/orders/route.ts`, `src/app/api/reviews/product/[productId]/route.ts`, plus the admin pages that consume them

**Problem:** Every list endpoint loads the **entire table** into memory and filters, sorts, or aggregates in JavaScript — including the 7-day sales chart and per-customer order counts. `products` search/sort is also done client-side. This is fine at 50 rows and fails at 50,000. There is no pagination anywhere.

**Required change:**
1. `GET /api/products`: `ilike` search on name/description, `where` on `is_available`/`stock > 0`, `orderBy` for the four sort options, and `limit`/`offset` (default 50, max 200) with a `total` count.
2. **Fix a real access bug while you're here:** `?all=true` on `/api/products` is currently **unauthenticated** and exposes unavailable/zero-stock inventory to any anonymous caller. Make that branch call `requireAdmin` and return 401/403 otherwise.
3. `GET /api/orders` and `GET /api/admin/orders`: `where` on status, `orderBy desc(createdAt)`, pagination, and a `total`. Keep the response shape `{ orders, total, page, pageSize }` and update the two pages.
4. `admin/customers`: replace the "load every order, filter per customer" pattern with a `leftJoin` + `groupBy` + `count`.
5. `admin/dashboard`: use `count(*)` and `sum(total)` queries (`sql<number>`) instead of reducing arrays. Keep the existing JSON field names exactly.
6. `admin/sales`: compute top products with `groupBy(productId)` + `sum(quantity)` + `limit(5)`, and the 7-day series with a `date_trunc('day', created_at)` group-by (fill missing days in JS). Fix the timezone: the current `toISOString().slice(0,10)` buckets by UTC days, which is wrong for Rwanda (UTC+2) — use `Africa/Kigali` consistently.
7. `review/product`: paginate and compute the average with `avg(rating)` in SQL.

**Done when:** no handler calls `.select().from(x)` without a `where`/`limit` except documented small reference tables, and the admin pages still render correctly with 5,000 seeded orders.

---

## Item 17 — Bound the checkout payload and validate delivery fields properly

**Priority:** P2
**Files:** `src/app/api/orders/route.ts`, `src/lib/validation.ts` (new)

**Problem:** Delivery fields are only checked for non-emptiness. There is no length cap, no Rwandan phone format check, and a 10 MB `instructions` string will be written to the database.

**Required change:** create `src/lib/validation.ts` (prefer `zod` — pre-approved) with a shared schema for `fullName` (2–80 chars), `phone` (`^(\+?250|0)?7[2389]\d{7}$` after stripping spaces — accept the common Rwandan formats), `province`/`district`/`sector` (1–60), `address` (5–200), `instructions` (≤ 500), and `items` (1–50 lines, integer quantity 1–1000). Return field-specific messages that match the existing copy style. Reuse it on the client for inline validation.

**Done when:** a 1 MB `instructions` value returns 400 with a friendly message, and a malformed phone number is refused before the transaction starts.

---

# Phase E — Frontend

## Item 18 — Fix the dashboard showing the wrong order's status

**Priority:** P1 (customer-facing misinformation)
**Files:** `src/app/dashboard/page.tsx` (~L37–75)

**Problem:** `latest = orders[0]` but `activeOrder = orders.find(status !== delivered && !== cancelled)`. The card header switches to "On its way" and the tracker renders `activeOrder.orderStatus`, while the order number, "View order" link, and invoice link all point at **`latest`**. If the newest order is delivered but an older one is still out for delivery, the customer sees an older order's progress labelled with the newest order number.

**Required change:** derive both the tracker subject and the links from a **single** variable (`const focus = activeOrder ?? latest`). Header text should reflect `focus`. If there are multiple active orders, show the newest active one and a "You have N orders in progress" line linking to `/orders`.

**Done when:** with a delivered newest order and an out-for-delivery older order, the tracker, order number, and links all refer to the same (older, active) order.

---

## Item 19 — Make the admin order deep-link work

**Priority:** P2
**Files:** `src/app/admin/page.tsx` (L65), `src/app/admin/orders/page.tsx`

**Problem:** The dashboard links to `/admin/orders?id=<id>`, but the orders page never reads `id` from the URL, so the click lands on an unselected list. The admin then has to hunt for the order they just clicked.

**Required change:** read `searchParams` on mount and, if `id` is present and valid, select that order (fetch it via `/api/orders/:id` even if it is outside the current filter's page). Wrap the component in `<Suspense>` if `useSearchParams` requires it under Next 16's static rendering. Update the URL when an order is selected manually so the link is shareable.

**Done when:** clicking an order number on the dashboard opens that order's detail panel.

---

## Item 20 — Fix the missing hero images and the client-side crash surface

**Priority:** P1 (broken visuals) / P1 (crash)
**Files:** `src/app/page.tsx` (L44), `src/app/about/page.tsx` (L8), `src/lib/client/cart.ts`, `src/lib/client/notice.ts`, `src/components/Navbar.tsx`

**Problem A — images:** there is **no `public/` directory in the repo at all** (`.gitignore` even anticipates `public/uploads/.gitkeep`, which does not exist). Both marketing pages reference `/images/hero-halftone.jpg` and `/images/delivery-halftone.jpg`, so the landing page renders alt text instead of its centrepiece.

**Problem B — crash:** `getCart()` is `JSON.parse(localStorage.getItem(KEY))` with **no try/catch and no shape validation**, and `Navbar` calls `cartCount()` in a `useEffect` on every page. One malformed value (an object instead of an array, a truncated write, a schema change) throws on every route — combined with the missing `error.tsx` (Item 14), the user gets a blank page sitewide. `getDeliveryNotice()` has the same defect.

**Required change:**
1. Commit real assets to `public/images/` (grayscale halftone style to match the design system), plus `public/uploads/.gitkeep`. If you cannot source photography, generate a CSS/SVG halftone placeholder **and** keep the `<img>` markup so the swap is trivial.
2. Add `safeRead<T>(key, validate): T | null` to `src/lib/client/storage.ts`; validate `CartItem[]` element-by-element, discard invalid entries, and clear the key when parsing fails. Use it in `cart.ts` and `notice.ts`.
3. Refresh the cart against `/api/products` on mount: drop products that no longer exist or are unavailable, and clamp quantities to current stock. Show a one-line notice when something changed.
4. Add `alt` text that reflects content, and `width`/`height` or `aspect-ratio` so the hero does not shift layout.

**Done when:** clearing `localStorage` mid-session never whitescreens the app, corrupt JSON self-heals, and both hero images render from `public/`.

---

## Item 21 — Fix the open redirect on login

**Priority:** P1 (phishing vector)
**Files:** `src/app/login/page.tsx` (L34)

**Problem:** `router.push(next || ...)` takes `?next=` straight from the query string, so `?next=https://evil.example` sends a freshly authenticated user off-site from a trusted login page.

**Required change:** accept only a path that starts with a single `/` and not `//`, and that resolves to a same-origin URL (`new URL(next, location.origin).origin === location.origin`). Otherwise fall back to the role-based default. Apply the same guard to any other place `next`/`redirect` is read.

**Done when:** `?next=https://evil.example` and `?next=//evil.example` both land on `/dashboard` (or `/admin`), and `?next=/checkout` still works.

---

## Item 22 — Accessibility, empty states, and honest forms

**Priority:** P2
**Files:** `src/app/checkout/page.tsx`, `src/app/register/page.tsx`, `src/components/ProductForm.tsx`, `src/components/Navbar.tsx`, `src/app/admin/products/page.tsx`, `src/app/contact/page.tsx`, several admin pages

**Problem / required change:**
1. **Labels:** roughly 30 `<label>Text</label><input />` pairs with no `htmlFor`/`id`. Associate every label with its control (`useId()` where the id is dynamic). Also add `aria-describedby` for inline error text.
2. **Mobile nav:** the toggle lacks `aria-expanded`, `aria-controls`, and `aria-label`. Add all three.
3. **Admin images:** `alt=""` on product images in the admin table — use the product name.
4. **Loading/error states:** several admin pages render nothing while fetching and swallow errors (`load()` has no `.catch`). Add a skeleton or `LoadingScreen`, an inline `.alert.alert-error` on failure, and a retry button.
5. **Contact form:** it currently fakes success — `setSent(true)` on submit with no backend — and says "we received your message". Either wire it to a real endpoint that stores the message (`contact_messages` table + admin inbox) or disable the submit and present the email/phone instead. Do not tell users a message was received when none was.
6. **Product form:** the admin inline save sends `{ ...product, ...changes }` including `id`, `createdAt`, `updatedAt`; the validator ignores them today, but it should send only the validated fields to avoid a future `readProductBody` change writing `id`. Also confirm `ProductForm` sends numbers, not strings (it currently posts `form` directly).
7. **Focus management:** after an error alert appears, move focus to it; return focus to the trigger when a modal/panel closes.

**Done when:** `npx @axe-core/cli` (or the Lighthouse a11y audit) reports no "form elements must have labels" or missing-landmark violations on `/`, `/products`, `/checkout`, `/register`, and `/admin/products`.

---

# Phase F — Docs, config, DX

## Item 23 — Security headers, safer config, and a real 404/error design

**Priority:** P1
**Files:** `next.config.ts`, `src/middleware.ts` (optional), `src/app/layout.tsx`

**Problem:** `next.config.ts` is `{}` — no CSP, no HSTS, no `X-Frame-Options`/`frame-ancestors`, no `Referrer-Policy`, no `Permissions-Policy`. With the XSS surface in Items 5 and 7, a CSP is the cheapest mitigation available. Fonts load via render-blocking `<link>` tags to Google Fonts, and there is no `images.remotePatterns` for product images hosted off-site.

**Required change:**
1. Add `headers()` in `next.config.ts`: `Content-Security-Policy` (start with `default-src 'self'`, allow `fonts.googleapis.com`/`fonts.gstatic.com` for the stylesheet phase, then migrate to `next/font` and drop those), `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
2. Migrate the two Google Fonts links to `next/font/google` (`Archivo`, `IBM_Plex_Mono`) with `display: "swap"` and CSS variables so `globals.css` keeps working.
3. Add `images.remotePatterns` for any external hosts product images may come from, and convert `ProductCard`, `CartItemRow`, and the home/about heroes to `next/image` with explicit sizes.
4. Add `poweredByHeader: false` and `compress: true`.

**Done when:** `curl -I` on `/` shows every header, and the CSP allows the site to render with no console violations.

---

## Item 24 — Rewrite the README for operators, and fix the stale metadata

**Priority:** P1 (documentation gap)
**Files:** `README.md`, `package.json`, new `docker-compose.yml`, `src/db/index.ts`, `src/app/api/health/route.ts`

**Problem:** The README documents only the happy path and omits everything that bites an operator. Separately, `"name"` is still `nextjs-postgresql-template`; `dotenv` is a dependency used only by Drizzle; and `src/db/index.ts` passes `connectionString: undefined` when `DATABASE_URL` is missing, so `pg` silently falls back to localhost/PG* env vars and you debug a confusing connection error instead of a clear message.

**Required change:**
1. **README sections to add or rewrite:**
   - **Demo accounts** — what they are, that they exist only when `NEXT_PUBLIC_DEMO_MODE=true`, and how to disable them.
   - **Auth design** — cookie-only, HttpOnly, 24h lifetime, where `JWT_SECRET` comes from, how rotation works, that Item 4 invalidates existing sessions once.
   - **Complete environment table** — every variable actually read (`DATABASE_URL`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `NEXT_PUBLIC_DEMO_MODE`, `TRUST_PROXY`, `PAYMENT_MODE`, `PAYMENT_API_KEY`, `CLOUDINARY_*`), with required/optional and an example for each. The current table omits `JWT_SECRET_FALLBACK`, which is in `.env.example`.
   - **Go-live checklist** — a numbered list: set a real `JWT_SECRET`, disable demo mode, set a non-default admin password, replace mock payment (`PAYMENT_MODE`), move uploads off local disk, run `db:migrate`, configure backups, set up the healthcheck.
   - **Why mock payment is dangerous** — that Mobile Money/Card orders are marked `paid` with no provider call **and** that admin revenue totals include them (see Item 25).
   - **Uploads are ephemeral** — `public/uploads` is lost on redeploy on most PaaS; how to move to S3/Cloudinary and where the swap point is (`src/app/api/upload/route.ts`).
   - **Database backup/restore** — a `pg_dump`/`pg_restore` recipe.
   - **API error contract** — `{ message }`, the status codes in use (400/401/403/404/409/429/500/503), and the correlation-id header.
   - **Cross-platform setup** — the current instructions are Windows-only (PowerShell). Add a macOS/Linux tab and a `docker-compose.yml` that brings up Postgres 16 with the right port, user, and database.
2. `package.json`: rename to `"name": "egghub-rwanda"`, add `"engines": { "node": ">=20 <23" }`, and move `dotenv` to `devDependencies` (or remove it and use Node's `--env-file`).
3. `src/db/index.ts`: throw `"DATABASE_URL is not set"` at import time when missing; set `max: 10`, `idleTimeoutMillis: 30_000`, and `ssl` when `DATABASE_SSL=true`; attach a `pool.on("error")` handler that logs instead of crashing the process.
4. `/api/health`: keep `{ ok }`, add `db`, `uptime`, and `version` (from `package.json`), and keep `force-dynamic`. Document the exact healthcheck command.

**Done when:** a developer on macOS with only Docker can go from clone to a running app by following the README top to bottom, and `npm pkg get name` returns `egghub-rwanda`.

---

## Item 25 — Stop counting unpaid orders as revenue

**Priority:** P0 (misleading financials)
**Files:** `src/app/api/admin/dashboard/route.ts`, `src/app/api/admin/sales/route.ts`, `src/app/admin/sales/page.tsx`, `src/app/admin/page.tsx`

**Problem:** Both aggregates sum `orders.total` for every order whose `orderStatus !== "cancelled"`, **regardless of `paymentStatus`**. Combined with the mock-payment block in `src/app/api/orders/route.ts` — which sets `paymentStatus: "paid"` for Mobile Money and Card with no provider call — a demo deployment reports revenue that was never collected, and even in production a failed or pending payment inflates "Total Sales".

**Required change:**
1. Split the aggregates into three figures with explicit labels: **Collected** (`paymentStatus = 'paid'` and `orderStatus != 'cancelled'`), **Pending payment** (`paymentStatus = 'pending'`), and **Order value** (everything not cancelled, for context only).
2. Keep the existing JSON field names on the dashboard response (`totalSales`, etc.) but redefine `totalSales` to mean **collected**, and add `pendingSales` alongside. Update both admin pages to show both with labels.
3. Gate the mock-payment block behind `process.env.PAYMENT_MODE === "mock"`; when unset or `real`, Mobile Money/Card orders should be created with `paymentStatus: "pending"` and require an explicit admin confirmation. Log a loud startup warning when `PAYMENT_MODE=mock` in production.
4. Add a `TODO(payments)` comment at the exact integration point naming the expected webhook route and the fields it must update.

**Done when:** with two mock-paid orders and one pending cash order, the dashboard shows collected = the two paid totals and pending = the cash total, and no figure includes a cancelled order.

---

# 5. Verification checklist (run before you call it done)

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build

# schema + seed from scratch
npm run db:migrate
npm run db:seed

# smoke
curl -s localhost:3000/api/health | jq
curl -s -X POST localhost:3000/api/products/abc -H 'content-type: application/json' -d '{}'   # 404, not a Postgres error
curl -s localhost:3000/api/products?all=true | jq .message                                      # 401
curl -sI localhost:3000/ | grep -i 'content-security-policy\|x-frame-options\|strict-transport'
```

Manual passes:
- [ ] Log in as admin → refresh → still logged in → logout → token cookie gone → `/admin` redirects to login.
- [ ] With `NEXT_PUBLIC_DEMO_MODE` unset, `/login` shows no credentials and no demo buttons.
- [ ] Checkout the last unit in two concurrent tabs: exactly one succeeds, the other shows a stock message.
- [ ] Cancel an order: stock returns to the exact previous value, exactly once.
- [ ] Delete a product with order history: order and invoice still render, product is hidden from `/products`.
- [ ] Corrupt `localStorage.egghub_cart` by hand, reload: no crash, cart self-heals.
- [ ] `?next=https://evil.example` on `/login` stays on-site.
- [ ] A 10 MB `instructions` field is rejected with a friendly message.
- [ ] After 6 bad logins, the response is 429.

# 6. Deliverables

1. One commit per item, in phase order, each with a conventional-commit message and a body that states the risk being removed.
2. A `CHANGELOG.md` entry under "Unreleased" grouping the work as **Security**, **Fixed**, **Changed**, **Added**, **Docs**.
3. A short `docs/hardening-notes.md` recording, for each P0 item, what changed and what an operator must do on deploy (especially: Item 4 logs everyone out; Item 8 requires `NEXT_PUBLIC_DEMO_MODE`; Item 25 changes what `totalSales` means).
4. A final PR description with: the risk table (item → severity → status), the migration steps in order, and a rollback plan for the schema changes.

# 7. Out of scope — do not do these

- Rewriting the UI or changing the design system in `globals.css`.
- Migrating to a different ORM, auth library, or state manager.
- Adding a real payment provider (only the `PAYMENT_MODE` gate and the integration point).
- Adding email/SMS delivery (only log the reset link).
- Multi-vendor, multi-currency, or delivery-zone features.
- TypeScript `strict` migration of existing files beyond what the items require.
- Renaming routes, database tables, or response fields.

# 8. What is already good — do not break it

These are deliberate, correct choices. Preserve them and, where an item touches them, keep the behavior:

- Server-side recalculation of prices, discounts, delivery, and stock at checkout (`src/app/api/orders/route.ts`) — the client's totals are display-only.
- `role: "customer"` forced at registration; the frontend can never choose a role.
- `requireAdmin` reads the role from the **database**, not from the JWT claim, so a stale token cannot carry stale privileges.
- Ownership checks on `GET /api/orders/:id` (owner or admin only).
- Review eligibility: delivered orders only, product must be in that order, one review per product per order.
- Order creation wrapped in a single transaction (keep it — just move the reads inside and add the guards).
- Shared validation modules (`src/lib/validate-product.ts`, `src/lib/validate-promotion.ts`) used by both create and update.
- Delivery fee and discount logic living only on the server (`src/lib/pricing.ts`).
- Friendly, non-technical error copy in `src/lib/client/api.ts`, including the 502/503 "app is restarting" message.
- The `.env.example` structure and the "mock payment / future Cloudinary" comments — extend them, do not delete them.

---

**Start with Item 1.** Do not begin Phase B until Phase A's CI pipeline is green.
