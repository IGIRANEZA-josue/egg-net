import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, contactMessages, rateLimits, orders, products } from "@/db/schema";
import { POST as forgot } from "@/app/api/auth/forgot-password/route";
import { POST as reset } from "@/app/api/auth/reset-password/route";
import { POST as contact } from "@/app/api/contact/route";
import { GET as health } from "@/app/api/health/route";
import { GET as me } from "@/app/api/auth/me/route";
import { POST as setup } from "@/app/api/setup/route";
import { GET as orderDetail } from "@/app/api/orders/[id]/route";
import { GET as adminOrders } from "@/app/api/admin/orders/route";
import { GET as adminCustomers } from "@/app/api/admin/customers/route";
import { POST as adminReset } from "@/app/api/admin/customers/[id]/reset-password/route";
import { POST as login } from "@/app/api/auth/login/route";
import { makeUser, authedRequest, makeProduct } from "@/test/helpers";

const params = (id: string) => ({ params: Promise.resolve({ id }) });

function post(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Pull the reset token out of the console.log the route writes (email is out of scope). */
function captureResetToken(): { token: string } {
  const spy = { token: "" };
  const original = console.log;
  console.log = (...args: unknown[]) => {
    const line = args.join(" ");
    const match = line.match(/token=([A-Za-z0-9_-]+)/);
    if (match) spy.token = decodeURIComponent(match[1]);
  };
  (globalThis as Record<string, unknown>).__restoreLog = original;
  return spy;
}

describe("password reset flow", () => {
  it("returns 200 for an unknown email and creates no token", async () => {
    const response = await forgot(post("http://localhost/api/auth/forgot-password", { email: "nobody@example.com" }));
    expect(response.status).toBe(200);
    expect((await response.json()).message).toMatch(/if that email exists/i);
  });

  it("completes forgot -> reset -> login", async () => {
    const user = await makeUser({ email: "reset@example.com" });

    const spy = captureResetToken();
    const original = console.log;
    try {
      const forgotResponse = await forgot(
        post("http://localhost/api/auth/forgot-password", { email: "reset@example.com" })
      );
      expect(forgotResponse.status).toBe(200);
    } finally {
      console.log = original;
    }
    expect(spy.token, "reset link should be logged").toBeTruthy();

    const response = await reset(
      post("http://localhost/api/auth/reset-password", { token: spy.token, newPassword: "BrandNewPass123" })
    );
    expect(response.status).toBe(200);

    const after = await login(
      post("http://localhost/api/auth/login", { email: "reset@example.com", password: "BrandNewPass123" })
    );
    expect(after.status).toBe(200);

    // The same token cannot be replayed.
    const replay = await reset(
      post("http://localhost/api/auth/reset-password", { token: spy.token, newPassword: "AnotherPass123" })
    );
    expect(replay.status).toBe(400);

    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row.mustChangePassword).toBe(false);
  });

  it("rejects an invalid token", async () => {
    const response = await reset(
      post("http://localhost/api/auth/reset-password", { token: "not-a-real-token", newPassword: "BrandNewPass123" })
    );
    expect(response.status).toBe(400);
  });

  it("rejects a short new password", async () => {
    const response = await reset(
      post("http://localhost/api/auth/reset-password", { token: "x", newPassword: "short" })
    );
    expect(response.status).toBe(400);
  });
});

describe("POST /api/contact", () => {
  it("stores a valid message", async () => {
    const response = await contact(
      post("http://localhost/api/contact", {
        name: "Aline",
        contact: "aline@example.com",
        message: "Do you deliver to Huye on Sundays?",
      })
    );
    expect(response.status).toBe(201);
    expect(await db.select().from(contactMessages)).toHaveLength(1);
  });

  it("rejects an empty message", async () => {
    const response = await contact(post("http://localhost/api/contact", { name: "A", contact: "b", message: "hi" }));
    expect(response.status).toBe(400);
  });
});

describe("GET /api/health", () => {
  it("reports ok with a reachable database", async () => {
    const response = await health(new Request("http://localhost/api/health"));
    const body = (await response.json()) as { ok: boolean; checks: { db: string } };
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.checks.db).toBe("ok");
  });
});

describe("GET /api/auth/me", () => {
  it("returns the current user", async () => {
    const user = await makeUser({ email: "me@example.com" });
    const response = await me(await authedRequest(user, "http://localhost/api/auth/me"));
    expect(response.status).toBe(200);
    expect((await response.json()).user.email).toBe("me@example.com");
  });

  it("returns 401 anonymously", async () => {
    const response = await me(new Request("http://localhost/api/auth/me"));
    expect(response.status).toBe(401);
  });
});

describe("POST /api/setup", () => {
  it("refuses to run without explicit credentials", async () => {
    const original = { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD };
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;

    const response = await setup(new Request("http://localhost/api/setup", { method: "POST" }));
    expect(response.status).toBe(500);
    expect((await response.json()).message).toMatch(/ADMIN_EMAIL and ADMIN_PASSWORD/);

    process.env.ADMIN_EMAIL = original.email;
    process.env.ADMIN_PASSWORD = original.password;
  });

  it("refuses a well-known demo password", async () => {
    const original = process.env.ADMIN_PASSWORD;
    process.env.ADMIN_EMAIL = "boss@egghub.rw";
    process.env.ADMIN_PASSWORD = "Admin1234";

    const response = await setup(new Request("http://localhost/api/setup", { method: "POST" }));
    expect(response.status).toBe(500);
    expect((await response.json()).message).toMatch(/too weak/i);

    process.env.ADMIN_PASSWORD = original;
  });

  it("creates the admin once and seeds products", async () => {
    const original = { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD };
    process.env.ADMIN_EMAIL = "boss@egghub.rw";
    process.env.ADMIN_PASSWORD = "A-strong-admin-password-1";

    const first = await setup(new Request("http://localhost/api/setup", { method: "POST" }));
    expect(first.status).toBe(200);

    const [admin] = await db.select().from(users).where(eq(users.email, "boss@egghub.rw"));
    expect(admin.role).toBe("admin");
    expect(admin.password.startsWith("$2")).toBe(true);
    expect(await db.select().from(products)).toHaveLength(5);

    const second = await setup(new Request("http://localhost/api/setup", { method: "POST" }));
    expect(second.status).toBe(400);

    process.env.ADMIN_EMAIL = original.email;
    process.env.ADMIN_PASSWORD = original.password;
  });
});

describe("GET /api/orders/:id", () => {
  async function seedOrder(customerId: number) {
    const [order] = await db
      .insert(orders)
      .values({
        orderNumber: `EGG-2026-${Math.floor(Math.random() * 900000 + 100000)}`,
        customerId,
        customerName: "Aline Uwase",
        phone: "0788123456",
        province: "Kigali City",
        district: "Gasabo",
        sector: "Remera",
        address: "KG 11 Ave",
        subtotal: 1500,
        deliveryFee: 1000,
        total: 2500,
        paymentMethod: "cash",
      })
      .returning();
    return order;
  }

  it("lets the owner read their order", async () => {
    const owner = await makeUser();
    const order = await seedOrder(owner.id);
    const response = await orderDetail(
      await authedRequest(owner, `http://localhost/api/orders/${order.id}`),
      params(String(order.id))
    );
    expect(response.status).toBe(200);
  });

  it("blocks another customer", async () => {
    const owner = await makeUser();
    const stranger = await makeUser();
    const order = await seedOrder(owner.id);
    const response = await orderDetail(
      await authedRequest(stranger, `http://localhost/api/orders/${order.id}`),
      params(String(order.id))
    );
    expect(response.status).toBe(403);
  });

  it("lets an admin read any order", async () => {
    const owner = await makeUser();
    const admin = await makeUser({ role: "admin" });
    const order = await seedOrder(owner.id);
    const response = await orderDetail(
      await authedRequest(admin, `http://localhost/api/orders/${order.id}`),
      params(String(order.id))
    );
    expect(response.status).toBe(200);
  });

  it("returns 404 for a non-numeric id", async () => {
    const user = await makeUser();
    const response = await orderDetail(
      await authedRequest(user, "http://localhost/api/orders/abc"),
      params("abc")
    );
    expect(response.status).toBe(404);
  });
});

describe("admin lists", () => {
  it("filters admin orders in SQL and paginates", async () => {
    const admin = await makeUser({ role: "admin" });
    const customer = await makeUser();
    for (let i = 0; i < 3; i++) {
      await db.insert(orders).values({
        orderNumber: `EGG-2026-${100000 + i}`,
        customerId: customer.id,
        customerName: "A",
        phone: "0788123456",
        province: "Kigali City",
        district: "Gasabo",
        sector: "Remera",
        address: "KG 11",
        subtotal: 1000,
        deliveryFee: 1000,
        total: 2000,
        paymentMethod: "cash",
        orderStatus: i === 0 ? "delivered" : "pending",
      });
    }

    const response = await adminOrders(
      await authedRequest(admin, "http://localhost/api/admin/orders?status=delivered")
    );
    const body = (await response.json()) as { orders: unknown[]; total: number };
    expect(body.orders).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it("counts orders per customer with a grouped join", async () => {
    const admin = await makeUser({ role: "admin" });
    const customer = await makeUser({ email: "counted@example.com" });
    await db.insert(orders).values({
      orderNumber: "EGG-2026-200001",
      customerId: customer.id,
      customerName: "A",
      phone: "0788123456",
      province: "Kigali City",
      district: "Gasabo",
      sector: "Remera",
      address: "KG 11",
      subtotal: 1000,
      deliveryFee: 1000,
      total: 3000,
      paymentMethod: "cash",
      paymentStatus: "paid",
    });

    const response = await adminCustomers(await authedRequest(admin, "http://localhost/api/admin/customers"));
    const body = (await response.json()) as { customers: { orderCount: number; totalSpent: number }[] };
    expect(body.customers[0].orderCount).toBe(1);
    expect(body.customers[0].totalSpent).toBe(3000);
  });

  it("issues a temporary password an admin can hand to a customer", async () => {
    const admin = await makeUser({ role: "admin" });
    const customer = await makeUser({ email: "locked@example.com" });

    const response = await adminReset(
      await authedRequest(admin, `http://localhost/api/admin/customers/${customer.id}/reset-password`, {
        method: "POST",
      }),
      params(String(customer.id))
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { temporaryPassword: string };
    expect(body.temporaryPassword.length).toBeGreaterThanOrEqual(8);

    const login2 = await login(
      post("http://localhost/api/auth/login", { email: "locked@example.com", password: body.temporaryPassword })
    );
    expect(login2.status).toBe(200);

    const [row] = await db.select().from(users).where(eq(users.id, customer.id));
    expect(row.mustChangePassword).toBe(true);
  });
});
