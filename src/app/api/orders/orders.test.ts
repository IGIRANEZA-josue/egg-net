import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, orderItems, products, users } from "@/db/schema";
import { POST as placeOrder } from "@/app/api/orders/route";
import { PUT as updateStatus } from "@/app/api/orders/[id]/status/route";
import { authedRequest, makeProduct, makeUser, VALID_DELIVERY } from "@/test/helpers";

let customer: { id: number; role: string };

beforeEach(async () => {
  const user = await makeUser({ role: "customer" });
  customer = { id: user.id, role: user.role };
});

function checkout(body: unknown, headers: Record<string, string> = {}) {
  return authedRequest(customer, "http://localhost/api/orders", { method: "POST", body, headers });
}

describe("POST /api/orders", () => {
  it("creates the order, the items, and decrements stock by the ordered quantity", async () => {
    const product = await makeProduct({ price: 1500, stock: 10 });

    const response = await placeOrder(
      await checkout({
        items: [{ productId: product.id, quantity: 3 }],
        delivery: VALID_DELIVERY,
        paymentMethod: "cash",
      })
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { order: { id: number; total: number; orderNumber: string } };
    expect(body.order.orderNumber).toMatch(/^EGG-\d{4}-\d{6}$/);

    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, body.order.id));
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(3);

    const [after] = await db.select().from(products).where(eq(products.id, product.id));
    expect(after.stock).toBe(7);
  });

  it("charges the database price and ignores a price supplied by the client", async () => {
    const product = await makeProduct({ price: 1500, stock: 10 });

    const response = await placeOrder(
      await checkout({
        items: [{ productId: product.id, quantity: 2, price: 1 }],
        delivery: VALID_DELIVERY,
        paymentMethod: "cash",
      })
    );

    const body = (await response.json()) as { order: { subtotal: number; total: number } };
    expect(body.order.subtotal).toBe(3000);
    expect(body.order.total).toBe(3000 + 1000); // flat delivery
  });

  it("refuses to oversell and leaves stock untouched", async () => {
    const product = await makeProduct({ stock: 2 });

    const response = await placeOrder(
      await checkout({
        items: [{ productId: product.id, quantity: 5 }],
        delivery: VALID_DELIVERY,
        paymentMethod: "cash",
      })
    );

    expect(response.status).toBe(409);
    const [after] = await db.select().from(products).where(eq(products.id, product.id));
    expect(after.stock).toBe(2);
    expect(await db.select().from(orders)).toHaveLength(0);
  });

  it("merges duplicate cart lines into one item row and one decrement", async () => {
    const product = await makeProduct({ stock: 10 });

    const response = await placeOrder(
      await checkout({
        // The same product twice - a stale cart could send this.
        items: [
          { productId: product.id, quantity: 2 },
          { productId: product.id, quantity: 3 },
        ],
        delivery: VALID_DELIVERY,
        paymentMethod: "cash",
      })
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { order: { id: number; subtotal: number } };

    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, body.order.id));
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(5);

    const [after] = await db.select().from(products).where(eq(products.id, product.id));
    // 10 - 5, not 10 - 3 (the old overwrite used the stale base).
    expect(after.stock).toBe(5);
  });

  it("rejects an unavailable product", async () => {
    const product = await makeProduct({ isAvailable: false });
    const response = await placeOrder(
      await checkout({
        items: [{ productId: product.id, quantity: 1 }],
        delivery: VALID_DELIVERY,
        paymentMethod: "cash",
      })
    );
    expect(response.status).toBe(400);
    expect((await response.json()).message).toMatch(/not available/i);
  });

  it("fails the second order for the last unit", async () => {
    const product = await makeProduct({ stock: 1 });

    const first = await placeOrder(
      await checkout({
        items: [{ productId: product.id, quantity: 1 }],
        delivery: VALID_DELIVERY,
        paymentMethod: "cash",
      })
    );
    const second = await placeOrder(
      await checkout({
        items: [{ productId: product.id, quantity: 1 }],
        delivery: VALID_DELIVERY,
        paymentMethod: "cash",
      })
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    const [after] = await db.select().from(products).where(eq(products.id, product.id));
    expect(after.stock).toBe(0);
  });

  it("replays the same Idempotency-Key instead of creating a second order", async () => {
    const product = await makeProduct({ stock: 10 });
    const payload = {
      items: [{ productId: product.id, quantity: 2 }],
      delivery: VALID_DELIVERY,
      paymentMethod: "cash",
    };
    const key = "checkout-attempt-1";

    const first = await placeOrder(await checkout(payload, { "idempotency-key": key }));
    const second = await placeOrder(await checkout(payload, { "idempotency-key": key }));

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect((await second.json()).replayed).toBe(true);

    expect(await db.select().from(orders)).toHaveLength(1);
    const [after] = await db.select().from(products).where(eq(products.id, product.id));
    expect(after.stock).toBe(8);
  });

  it("rejects a malformed delivery payload with a friendly message", async () => {
    const product = await makeProduct({ stock: 10 });
    const response = await placeOrder(
      await checkout({
        items: [{ productId: product.id, quantity: 1 }],
        delivery: { ...VALID_DELIVERY, phone: "12345", instructions: "x".repeat(10_000) },
        paymentMethod: "cash",
      })
    );
    expect(response.status).toBe(400);
    expect((await response.json()).message).toMatch(/phone/i);
  });

  it("requires login", async () => {
    const request = new Request("http://localhost/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: [], delivery: VALID_DELIVERY, paymentMethod: "cash" }),
    });
    const response = await placeOrder(request);
    expect(response.status).toBe(401);
  });
});

describe("PUT /api/orders/:id/status", () => {
  async function orderWithStock(stock = 10, quantity = 4) {
    const admin = await makeUser({ role: "admin" });
    const product = await makeProduct({ stock });
    const response = await placeOrder(
      await checkout({
        items: [{ productId: product.id, quantity }],
        delivery: VALID_DELIVERY,
        paymentMethod: "cash",
      })
    );
    const body = (await response.json()) as { order: { id: number; orderStatus: string } };
    return { admin, product, orderId: body.order.id, order: body.order };
  }

  function statusRequest(
    admin: { id: number; role: string },
    orderId: number,
    body: unknown
  ) {
    return authedRequest(admin, `http://localhost/api/orders/${orderId}/status`, { method: "PUT", body });
  }

  it("restocks every line when an order is cancelled", async () => {
    const { admin, product, orderId } = await orderWithStock(10, 4);
    const [before] = await db.select().from(products).where(eq(products.id, product.id));
    expect(before.stock).toBe(6);

    const response = await updateStatus(
      await statusRequest(admin, orderId, { orderStatus: "cancelled", reason: "Customer asked to cancel" }),
      { params: Promise.resolve({ id: String(orderId) }) }
    );

    expect(response.status).toBe(200);
    const [after] = await db.select().from(products).where(eq(products.id, product.id));
    expect(after.stock).toBe(10);
  });

  it("does not restock twice when cancel is sent twice", async () => {
    const { admin, product, orderId } = await orderWithStock(10, 4);
    const params = { params: Promise.resolve({ id: String(orderId) }) };

    await updateStatus(
      await statusRequest(admin, orderId, { orderStatus: "cancelled", reason: "First" }),
      params
    );
    // `cancelled` is terminal, so the second call is refused before restocking.
    const second = await updateStatus(
      await statusRequest(admin, orderId, { orderStatus: "cancelled", reason: "Second" }),
      { params: Promise.resolve({ id: String(orderId) }) }
    );

    expect(second.status).toBe(200);
    const [after] = await db.select().from(products).where(eq(products.id, product.id));
    expect(after.stock).toBe(10);
  });

  it("rejects an illegal transition", async () => {
    const { admin, product, orderId } = await orderWithStock(10, 4);
    const params = { params: Promise.resolve({ id: String(orderId) }) };

    // pending -> delivered skips confirmation and preparation.
    const response = await updateStatus(
      await statusRequest(admin, orderId, { orderStatus: "delivered" }),
      params
    );

    expect(response.status).toBe(409);
    expect((await response.json()).message).toMatch(/cannot move/i);

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order.orderStatus).toBe("pending");
    const [after] = await db.select().from(products).where(eq(products.id, product.id));
    expect(after.stock).toBe(6);
  });

  it("requires a reason to cancel", async () => {
    const { admin, orderId } = await orderWithStock();
    const response = await updateStatus(
      await statusRequest(admin, orderId, { orderStatus: "cancelled" }),
      { params: Promise.resolve({ id: String(orderId) }) }
    );
    expect(response.status).toBe(400);
    expect((await response.json()).message).toMatch(/reason/i);
  });

  it("flags a refund when a paid order is cancelled", async () => {
    const { admin, orderId } = await orderWithStock();
    await db.update(orders).set({ paymentStatus: "paid" }).where(eq(orders.id, orderId));

    await updateStatus(
      await statusRequest(admin, orderId, { orderStatus: "cancelled", reason: "Out of stock" }),
      { params: Promise.resolve({ id: String(orderId) }) }
    );

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order.refundRequired).toBe(true);
    // Payment status is never silently flipped.
    expect(order.paymentStatus).toBe("paid");
  });

  it("rejects a non-numeric id with a 404 instead of a database error", async () => {
    const admin = await makeUser({ role: "admin" });
    const response = await updateStatus(
      await statusRequest(admin, 1, { orderStatus: "confirmed" }),
      { params: Promise.resolve({ id: "abc" }) }
    );
    expect(response.status).toBe(404);
  });

  it("is admin only", async () => {
    const { orderId } = await orderWithStock();
    const response = await updateStatus(
      await authedRequest(customer, `http://localhost/api/orders/${orderId}/status`, {
        method: "PUT",
        body: { orderStatus: "confirmed" },
      }),
      { params: Promise.resolve({ id: String(orderId) }) }
    );
    expect(response.status).toBe(403);
  });
});
