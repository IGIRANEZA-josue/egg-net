// End-to-end API tests against a REAL PostgreSQL database.
// Starts an embedded PostgreSQL (same engine as production), applies the
// migrations, then exercises the actual Next.js route handlers:
// register -> login -> browse -> order -> stock -> admin status -> review,
// including concurrency (no overselling) and authorization checks.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import EmbeddedPostgres from "embedded-postgres";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import path from "path";
import fs from "fs/promises";

const PORT = 55432;
const URL_DB = `postgresql://postgres:postgres@127.0.0.1:${PORT}/egghub_test`;

let pg: EmbeddedPostgres | null = null;
let pool: Pool;

// Route handlers (imported lazily AFTER DATABASE_URL is set).
// The cast keeps this map simple: handlers have varying ctx/params types.
type Handler = (req: Request, ctx?: unknown) => Promise<Response>;
let routes: Record<string, Record<string, Handler>>;

function req(method: string, body?: unknown, token?: string, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/test", {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const params = (id: string | number) => ({ params: Promise.resolve({ id: String(id), productId: String(id) }) });

async function call(route: string, method: string, body?: unknown, token?: string, ctx?: unknown, headers?: Record<string, string>) {
  const handler = routes[route][method];
  const res = await handler(req(method, body, token, headers), ctx);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, res };
}

beforeAll(async () => {
  const dataDir = path.resolve(".pgtest");
  await fs.rm(dataDir, { recursive: true, force: true });

  pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "postgres",
    password: "postgres",
    port: PORT,
    persistent: true,
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("egghub_test");

  process.env.DATABASE_URL = URL_DB;
  process.env.JWT_SECRET = "test-secret-test-secret-test-secret-1234";
  process.env.ADMIN_EMAIL = "admin@test.rw";
  process.env.ADMIN_PASSWORD = "AdminPass123";
  process.env.SETUP_SECRET = "setup-secret-for-tests";

  pool = new Pool({ connectionString: URL_DB, max: 4 });
  await migrate(drizzle(pool), { migrationsFolder: path.resolve("drizzle") });

  // Import handlers only after the env is in place.
  const mods = {
    setup: await import("@/app/api/setup/route"),
    register: await import("@/app/api/auth/register/route"),
    login: await import("@/app/api/auth/login/route"),
    profile: await import("@/app/api/auth/profile/route"),
    products: await import("@/app/api/products/route"),
    product: await import("@/app/api/products/[id]/route"),
    orders: await import("@/app/api/orders/route"),
    order: await import("@/app/api/orders/[id]/route"),
    orderStatus: await import("@/app/api/orders/[id]/status/route"),
    reviews: await import("@/app/api/reviews/route"),
    promotions: await import("@/app/api/promotions/route"),
    activePromotion: await import("@/app/api/promotions/active/route"),
    dashboard: await import("@/app/api/admin/dashboard/route"),
    health: await import("@/app/api/health/route"),
  };
  routes = mods as unknown as Record<string, Record<string, Handler>>;
}, 180_000);

afterAll(async () => {
  await pool?.end();
  const { pool: appPool } = await import("@/db");
  await appPool.end();
  await pg?.stop();
  await fs.rm(path.resolve(".pgtest"), { recursive: true, force: true });
});

describe("full shop flow", () => {
  let adminToken = "";
  let customerToken = "";
  let customerId = 0;
  let productId = 0;
  let orderId = 0;

  it("health check is green", async () => {
    const { status, json } = await call("health", "GET");
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
  });

  it("setup requires the secret, then creates the admin once", async () => {
    const denied = await call("setup", "POST");
    expect(denied.status).toBe(403);

    const ok = await call("setup", "POST", undefined, undefined, undefined, { "x-setup-secret": "setup-secret-for-tests" });
    expect(ok.status).toBe(200);
    expect(ok.json.adminEmail).toBe("admin@test.rw");

    const again = await call("setup", "POST", undefined, undefined, undefined, { "x-setup-secret": "setup-secret-for-tests" });
    expect(again.status).toBe(400); // one-time
  });

  it("admin can login with the seeded credentials", async () => {
    const { status, json } = await call("login", "POST", { email: "admin@test.rw", password: "AdminPass123" });
    expect(status).toBe(200);
    expect(json.user.role).toBe("admin");
    adminToken = json.token;
  });

  it("wrong password is rejected; short passwords cannot register", async () => {
    const bad = await call("login", "POST", { email: "admin@test.rw", password: "wrong" });
    expect(bad.status).toBe(401);
    const weak = await call("register", "POST", { name: "X", email: "x@y.co", password: "short" });
    expect(weak.status).toBe(400);
  });

  it("customers can register and always get the customer role", async () => {
    const { status, json } = await call("register", "POST", {
      name: "Test Customer", email: "customer@test.rw", password: "Customer123", phone: "0788123456", role: "admin",
    });
    expect(status).toBe(201);
    expect(json.user.role).toBe("customer"); // attempted escalation ignored
    customerToken = json.token;
    customerId = json.user.id;
  });

  it("duplicate emails are rejected", async () => {
    const { status } = await call("register", "POST", { name: "Dup", email: "customer@test.rw", password: "Customer123" });
    expect(status).toBe(400);
  });

  it("sample products exist and are public", async () => {
    const { status, json } = await call("products", "GET");
    expect(status).toBe(200);
    expect(json.products.length).toBe(5);
    productId = json.products.find((p: { name: string }) => p.name.includes("30 Tray")).id;
  });

  it("only admins can create products or see unavailable ones", async () => {
    const denied = await call("products", "POST", { name: "Hack", price: 1, packageSize: 1, stock: 1 }, customerToken);
    expect(denied.status).toBe(403);
    const all = await call("products", "GET", undefined, customerToken);
    // ?all=true not set, so fine; now with all=true:
    const res = await routes.products.GET(req("GET", undefined, customerToken).clone(), undefined);
    expect(res.status).toBe(200);
    const adminAll = await routes.products.GET(new Request("http://localhost/api/products?all=true", { headers: { Authorization: `Bearer ${customerToken}` } }));
    expect(adminAll.status).toBe(403);
    expect(all.status).toBe(200);

    const created = await call("products", "POST", { name: "Admin Special 12", price: 2000, packageSize: 12, stock: 7, discount: 10 }, adminToken);
    expect(created.status).toBe(201);
    expect(created.json.product.name).toBe("Admin Special 12");
  });

  it("anonymous users cannot order", async () => {
    const { status } = await call("orders", "POST", { items: [{ productId, quantity: 1 }], delivery: {}, paymentMethod: "cash" });
    expect(status).toBe(401);
  });

  it("customers can order; totals and stock are computed server-side", async () => {
    const before = await call("product", "GET", undefined, undefined, params(productId));
    const stockBefore = before.json.product.stock;
    const price = before.json.product.price;

    const { status, json } = await call("orders", "POST", {
      items: [{ productId, quantity: 2 }],
      delivery: { fullName: "Test Customer", phone: "0788123456", province: "Kigali City", district: "Gasabo", sector: "Remera", address: "KG 1 St" },
      paymentMethod: "cash",
    }, customerToken);

    expect(status).toBe(201);
    expect(json.order.orderNumber).toMatch(/^EGG\d+$/);
    expect(json.order.subtotal).toBe(price * 2);
    expect(json.order.total).toBe(price * 2 + json.order.deliveryFee - json.order.discount);
    expect(json.order.paymentStatus).toBe("pending"); // cash
    orderId = json.order.id;

    const after = await call("product", "GET", undefined, undefined, params(productId));
    expect(after.json.product.stock).toBe(stockBefore - 2);
  });

  it("frontend prices are ignored (client cannot pay 1 RWF for a tray)", async () => {
    const { status, json } = await call("orders", "POST", {
      items: [{ productId, quantity: 1, price: 1 }],
      delivery: { fullName: "T", phone: "0788123456", province: "Kigali City", district: "Gasabo", sector: "Remera", address: "X" },
      paymentMethod: "mobile_money",
    }, customerToken);
    expect(status).toBe(201);
    const prod = await call("product", "GET", undefined, undefined, params(productId));
    expect(json.order.subtotal).toBe(prod.json.product.price); // real price, not 1
    expect(json.order.paymentStatus).toBe("paid"); // mock mobile money
    // cancel it again so stock math stays simple
    await call("orderStatus", "PUT", { orderStatus: "cancelled" }, adminToken, params(json.order.id));
  });

  it("orders beyond stock are rejected", async () => {
    const { status, json } = await call("orders", "POST", {
      items: [{ productId, quantity: 999 }],
      delivery: { fullName: "T", phone: "0788123456", province: "Kigali City", district: "Gasabo", sector: "Remera", address: "X" },
      paymentMethod: "cash",
    }, customerToken);
    expect(status).toBe(400);
    expect(json.message).toMatch(/stock/i);
  });

  it("concurrent checkouts never oversell (row locks)", async () => {
    const created = await call("products", "POST", { name: "Race 6 Pack", price: 900, packageSize: 6, stock: 3 }, adminToken);
    const raceId = created.json.product.id;

    const order = () => call("orders", "POST", {
      items: [{ productId: raceId, quantity: 2 }],
      delivery: { fullName: "T", phone: "0788123456", province: "Kigali City", district: "Gasabo", sector: "Remera", address: "X" },
      paymentMethod: "cash",
    }, customerToken);

    const results = await Promise.all([order(), order(), order()]);
    const successes = results.filter((r) => r.status === 201);
    expect(successes.length).toBe(1); // only one fits: 2 of 3 in stock

    const after = await call("product", "GET", undefined, undefined, params(raceId));
    expect(after.json.product.stock).toBe(1); // never negative
  });

  it("customers see only their own orders", async () => {
    const other = await call("register", "POST", { name: "Other", email: "other@test.rw", password: "Other1234" });
    const otherToken = other.json.token;

    const mine = await call("orders", "GET", undefined, customerToken);
    expect(mine.json.orders.every((o: { customerId: number }) => o.customerId === customerId)).toBe(true);

    const peek = await call("order", "GET", undefined, otherToken, params(orderId));
    expect(peek.status).toBe(403);

    const all = await call("orders", "GET", undefined, adminToken);
    expect(all.json.orders.length).toBeGreaterThanOrEqual(mine.json.orders.length);
  });

  it("cancelling restores stock; re-activating takes it back", async () => {
    const before = await call("product", "GET", undefined, undefined, params(productId));
    await call("orderStatus", "PUT", { orderStatus: "cancelled" }, adminToken, params(orderId));
    const cancelled = await call("product", "GET", undefined, undefined, params(productId));
    expect(cancelled.json.product.stock).toBe(before.json.product.stock + 2);

    await call("orderStatus", "PUT", { orderStatus: "confirmed" }, adminToken, params(orderId));
    const reactivated = await call("product", "GET", undefined, undefined, params(productId));
    expect(reactivated.json.product.stock).toBe(before.json.product.stock);
  });

  it("customers cannot change order status; admins can", async () => {
    const denied = await call("orderStatus", "PUT", { orderStatus: "delivered" }, customerToken, params(orderId));
    expect(denied.status).toBe(403);
    const ok = await call("orderStatus", "PUT", { orderStatus: "delivered", paymentStatus: "paid" }, adminToken, params(orderId));
    expect(ok.status).toBe(200);
    expect(ok.json.order.orderStatus).toBe("delivered");
  });

  it("reviews require a delivered order, and only one per product/order", async () => {
    const early = await call("register", "POST", { name: "Early", email: "early@test.rw", password: "Early1234" });
    const earlyOrder = await call("orders", "POST", {
      items: [{ productId, quantity: 1 }],
      delivery: { fullName: "E", phone: "0788123456", province: "Kigali City", district: "Gasabo", sector: "Remera", address: "X" },
      paymentMethod: "cash",
    }, early.json.token);
    const notDelivered = await call("reviews", "POST", { orderId: earlyOrder.json.order.id, productId, rating: 5, comment: "great" }, early.json.token);
    expect(notDelivered.status).toBe(400);

    const ok = await call("reviews", "POST", { orderId, productId, rating: 5, comment: "Very fresh!" }, customerToken);
    expect(ok.status).toBe(201);
    const dup = await call("reviews", "POST", { orderId, productId, rating: 4, comment: "again" }, customerToken);
    expect(dup.status).toBe(400);
    const badRating = await call("reviews", "POST", { orderId, productId: productId + 999, rating: 9 }, customerToken);
    expect(badRating.status).toBe(400);
  });

  it("promotions apply server-side at checkout", async () => {
    const today = new Date();
    const start = new Date(today.getTime() - 86400000).toISOString();
    const end = new Date(today.getTime() + 86400000).toISOString();
    const created = await call("promotions", "POST", { name: "Test 10%", type: "percentage", value: 10, startDate: start, endDate: end, active: true }, adminToken);
    expect(created.status).toBe(201);

    const active = await call("activePromotion", "GET");
    expect(active.json.promotion.name).toBe("Test 10%");

    const prod = await call("product", "GET", undefined, undefined, params(productId));
    const { json } = await call("orders", "POST", {
      items: [{ productId, quantity: 1 }],
      delivery: { fullName: "T", phone: "0788123456", province: "Kigali City", district: "Gasabo", sector: "Remera", address: "X" },
      paymentMethod: "cash",
    }, customerToken);
    expect(json.order.discount).toBe(Math.round(prod.json.product.price * 0.1));
  });

  it("password change requires the current password", async () => {
    const denied = await call("profile", "PUT", { password: "NewPass1234" }, customerToken);
    expect(denied.status).toBe(403);
    const ok = await call("profile", "PUT", { password: "NewPass1234", currentPassword: "Customer123" }, customerToken);
    expect(ok.status).toBe(200);
    const relogin = await call("login", "POST", { email: "customer@test.rw", password: "NewPass1234" });
    expect(relogin.status).toBe(200);
  });

  it("admin dashboard aggregates correctly", async () => {
    const { status, json } = await call("dashboard", "GET", undefined, adminToken);
    expect(status).toBe(200);
    expect(json.totalOrders).toBeGreaterThan(0);
    expect(json.totalCustomers).toBeGreaterThanOrEqual(3);
    expect(Array.isArray(json.lowStockProducts)).toBe(true);
  });

  it("invalid ids are rejected cleanly instead of crashing", async () => {
    const bad = await call("product", "GET", undefined, undefined, params("abc"));
    expect(bad.status).toBe(400);
    const missing = await call("product", "GET", undefined, undefined, params(999999));
    expect(missing.status).toBe(404);
  });
});
