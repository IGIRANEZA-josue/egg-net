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

**Customer**: register, login, browse/search/sort products, product details with reviews, cart (localStorage), checkout with delivery info + payment method, order confirmation, order history, status tracking, printable invoice, profile management, product reviews after delivery.

**Admin**: dashboard (sales, orders, customers, products, low stock, pending orders), add/edit/delete products, image upload (local), stock & availability management, low-stock warnings, orders list + status/payment updates, customers list, sales statistics with a simple chart, discounts & promotions.

**Security**: bcrypt password hashing, JWT auth, role checks on every admin API, server-side recalculation of prices / discounts / delivery / stock at checkout, basic input validation, friendly error messages.

---

## Account types

| Role | How it's created | Can do |
|------|------------------|--------|
| `admin` | once, via `POST /api/setup` (see below) | everything under `/admin` |
| `customer` | public Register page | shop, order, track, review |

Public registration **always** creates a customer. There is no way to choose "admin" from the browser.

---

## Project structure

```
src/
├── app/
│   ├── page.tsx                 Home
│   ├── about/  contact/  login/  register/  profile/
│   ├── products/                Products list  +  [id] details
│   ├── cart/  checkout/
│   ├── orders/                  Order history + [id] details + [id]/invoice
│   ├── admin/                   Dashboard, products (new/edit), orders, customers, sales, promotions
│   └── api/                     ← the "backend" (like Express routes + controllers)
│       ├── auth/        register, login, profile
│       ├── products/    list/create, [id] get/update/delete
│       ├── orders/      create/list, [id], [id]/status
│       ├── admin/       dashboard, customers, orders, sales
│       ├── reviews/     create, product/[productId]
│       ├── promotions/  list/create, [id], active
│       ├── upload/      local image upload
│       └── setup/       creates first admin + sample products
├── components/     Navbar, Footer, ProductCard, CartItemRow, ProductForm, OrderTracker, StatusBadge
├── db/             schema.ts (tables = "models"), index.ts (connection)
└── lib/
    ├── auth.ts             hash/compare passwords, JWT, requireUser / requireAdmin ("middleware")
    ├── pricing.ts          delivery fee + promotion discount rules (server only)
    ├── validate-*.ts       input validation
    └── client/             api.ts (fetch helper + auth storage), cart.ts (localStorage cart)
```

---

## Windows setup (PowerShell or Command Prompt)

1. **Install Node.js** (LTS) from nodejs.org and **PostgreSQL** from postgresql.org (remember the password you set for the `postgres` user).

2. **Create the database** (in PowerShell):
   ```powershell
   psql -U postgres -c "CREATE DATABASE app_db;"
   ```

3. **Install dependencies** (frontend and backend live in the same project):
   ```powershell
   cd egg-hub-rwanda
   npm install
   ```

4. **Create `.env`**:
   ```powershell
   copy .env.example .env
   ```
   Edit `.env` and set `DATABASE_URL` to your own password, e.g.
   `postgresql://postgres:YOUR_PASSWORD@127.0.0.1:5432/app_db`, and set a random `JWT_SECRET`.

5. **Create the tables**:
   ```powershell
   npx drizzle-kit push
   ```

6. **Start the app** (frontend + API together):
   ```powershell
   npm run dev
   ```
   Open http://localhost:3000

7. **Create the admin account + sample products** (only works once):
   ```powershell
   Invoke-RestMethod -Method POST http://localhost:3000/api/setup
   ```
   (Command Prompt: `curl -X POST http://localhost:3000/api/setup`)
   Admin login: `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env` (default `admin@egghub.rw` / `Admin1234`).

### Testing the application

| Step | What to do |
|------|------------|
| Registration | Go to **Register**, create a customer account → you are logged in. |
| Login | **Logout**, then **Login** with the same email/password. Try a wrong password to see the error. |
| Admin login | Login with the admin email → you land on the **Dashboard**. |
| Add products | Admin → Products → **+ Add Product** (upload an image or paste a URL). |
| Cart | As a customer, **Add to Cart** on a product, open **Cart**, change quantities (max = stock). |
| Checkout | **Proceed to Checkout**, fill delivery info, pick a payment method, **Place Order**. |
| Stock | Check the product page — stock went down by the ordered quantity. |
| Order tracking | Customer → **Orders** → **View Order**. Admin → Orders → View → change status; refresh the customer page to see the tracker update. |
| Invoice | Order details → **View Invoice** → Print / Save as PDF. |
| Reviews | After the admin sets an order to **Delivered**, the customer can write a review from the order page. |
| Promotions | Admin → Promotions → create "10%" active today → the cart/checkout shows the discount. |

---

## Environment variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | signs login tokens — keep it secret |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | first admin created by `/api/setup` |
| `PAYMENT_API_KEY` | *future* — real payment provider |
| `CLOUDINARY_*` | *future* — remote image hosting |

---

## API overview

| Method | Route | Who |
|--------|-------|-----|
| POST | `/api/auth/register` | public (creates customer) |
| POST | `/api/auth/login` | public |
| GET / PUT | `/api/auth/profile` | logged in |
| GET | `/api/products`, `/api/products/:id` | public |
| POST / PUT / DELETE | `/api/products`, `/api/products/:id` | admin |
| POST | `/api/upload` | admin |
| POST / GET | `/api/orders` | customer (admin sees all) |
| GET | `/api/orders/:id` | owner or admin |
| PUT | `/api/orders/:id/status` | admin |
| GET | `/api/admin/dashboard`, `/customers`, `/orders`, `/sales` | admin |
| POST | `/api/reviews` | customer (delivered orders only) |
| GET | `/api/reviews/product/:productId` | public |
| GET | `/api/promotions/active` | public |
| GET / POST / PUT / DELETE | `/api/promotions`, `/api/promotions/:id` | admin |
| POST | `/api/setup` | one-time admin creation |

Send the token as `Authorization: Bearer <token>`.

---

## How payments work right now

**No real payment provider is connected.** `POST /api/orders` contains a clearly marked *mock payment* block:
Mobile Money / Card orders are marked `paid` (test flow), Cash on Delivery stays `pending` until the admin marks it paid. To go live, replace that block with a call to your provider (e.g. MTN MoMo Collections API) using `PAYMENT_API_KEY`, and add a webhook route that sets `paymentStatus`.

## How images work right now

Uploads are saved to `public/uploads/` on the server and served as `/uploads/<file>`. This works with no external service. For production hosting, swap `src/app/api/upload/route.ts` to upload to Cloudinary/S3 and return that URL.

---

## Future improvements

Real Mobile Money & card payments · real delivery tracking · SMS / email / WhatsApp notifications · QR-code receipts · advanced analytics · campaign scheduling · multiple delivery zones/fees · automatic low-stock alerts.
