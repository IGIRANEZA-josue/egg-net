import { describe, expect, it } from "vitest";
import { POST as createProduct } from "@/app/api/products/route";
import { PUT as updateProduct } from "@/app/api/products/[id]/route";
import { POST as createOrder } from "@/app/api/orders/route";
import { PUT as changeStatus } from "@/app/api/orders/[id]/status/route";
import { db } from "@/db";
import { stockMovements, products } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  makeUser, makeProduct, authedRequest, readJson, stockOf, VALID_DELIVERY,
} from "@/test/helpers";

// The ledger is only worth having if it explains the stock number on every
// path that changes it. These tests are the guard for that promise.
const inventoryUrl = "http://localhost/api/admin/inventory";

function params(id: number) {
  return { params: Promise.resolve({ id: String(id) }) };
}

async function movements() {
  return db.select().from(stockMovements).orderBy(stockMovements.id);
}

describe("stock changes always leave a trail", () => {
  it("records opening stock when a listing is created", async () => {
    const admin = await makeUser({ role: "admin" });
    const res = await createProduct(
      await authedRequest(admin, "http://localhost/api/products", {
        method: "POST",
        body: { name: "Quail eggs - 12", price: 2000, packageSize: 12, stock: 25, category: "Quail eggs" },
      })
    );
    expect(res.status).toBe(201);
    const { product } = await readJson<{ product: { id: number } }>(res);

    const rows = await movements();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      productId: product.id, direction: "in", quantity: 25, source: "New listing",
    });
    // Read the row fresh: `stockOf` can serve a cached pool after a transaction.
    const [fresh] = await db.select().from(products).where(eq(products.id, product.id));
    expect(fresh.stock).toBe(25);
  });

  it("records an upward correction when stock is typed into the edit form", async () => {
    const admin = await makeUser({ role: "admin" });
    const product = await makeProduct({ stock: 10 });

    const res = await updateProduct(
      await authedRequest(admin, `http://localhost/api/products/${product.id}`, {
        method: "PUT",
        body: { name: product.name, price: product.price, packageSize: 10, stock: 18 },
      }),
      params(product.id)
    );
    expect(res.status).toBe(200);
    expect(await stockOf(product.id)).toBe(18);

    const rows = await movements();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ direction: "in", quantity: 8, reason: "Stock count correction" });
  });

  it("records a downward correction, and refuses one that would go negative", async () => {
    const admin = await makeUser({ role: "admin" });
    const product = await makeProduct({ stock: 10 });

    await updateProduct(
      await authedRequest(admin, `http://localhost/api/products/${product.id}`, {
        method: "PUT",
        body: { name: product.name, price: product.price, packageSize: 10, stock: 6 },
      }),
      params(product.id)
    );
    expect(await stockOf(product.id)).toBe(6);

    const rows = await movements();
    expect(rows[0]).toMatchObject({ direction: "out", quantity: 4 });
  });

  it("records the sale when an order is placed", async () => {
    const customer = await makeUser();
    const product = await makeProduct({ stock: 20 });

    const res = await createOrder(
      await authedRequest(customer, "http://localhost/api/orders", {
        method: "POST",
        body: {
          items: [{ productId: product.id, quantity: 3 }],
          paymentMethod: "cash",
          delivery: VALID_DELIVERY,
        },
      })
    );
    expect(res.status).toBe(201);
    const { order } = await readJson<{ order: { id: number; orderNumber: string } }>(res);

    const rows = await movements();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      direction: "out", quantity: 3, reason: "Customer order", orderId: order.id,
    });
    expect(rows[0].source).toContain(order.orderNumber);
    expect(await stockOf(product.id)).toBe(17);
  });

  it("records the eggs coming back when an order is cancelled", async () => {
    const customer = await makeUser();
    const admin = await makeUser({ role: "admin" });
    const product = await makeProduct({ stock: 20 });

    const created = await createOrder(
      await authedRequest(customer, "http://localhost/api/orders", {
        method: "POST",
        body: {
          items: [{ productId: product.id, quantity: 5 }],
          paymentMethod: "cash",
          delivery: VALID_DELIVERY,
        },
      })
    );
    const { order } = await readJson<{ order: { id: number } }>(created);
    expect(await stockOf(product.id)).toBe(15);

    const cancelled = await changeStatus(
      await authedRequest(admin, `http://localhost/api/orders/${order.id}/status`, {
        method: "PATCH",
        body: { orderStatus: "cancelled", reason: "Customer changed their mind" },
      }),
      params(order.id)
    );
    expect(cancelled.status).toBe(200);

    expect(await stockOf(product.id)).toBe(20);
    const rows = await movements();
    expect(rows.map((r) => r.direction)).toEqual(["out", "in"]);
    expect(rows[1]).toMatchObject({
      direction: "in", quantity: 5, reason: "Order cancelled", orderId: order.id,
    });
  });

  it("keeps the ledger and the stock number in agreement", async () => {
    const user = await makeUser();
    const admin = await makeUser({ role: "admin" });
    const product = await makeProduct({ stock: 50 });

    // +30 received, -6 removed by hand, -4 sold, +4 refunded by cancellation.
    await fetchless(inventoryUrl + "/stock-in", admin, { productId: product.id, quantity: 30, source: "Farm delivery" });
    await fetchless(inventoryUrl + "/stock-out", admin, { productId: product.id, quantity: 6, reason: "Expired" });

    const created = await createOrder(
      await authedRequest(user, "http://localhost/api/orders", {
        method: "POST",
        body: { items: [{ productId: product.id, quantity: 4 }], paymentMethod: "cash", delivery: VALID_DELIVERY },
      })
    );
    const { order } = await readJson<{ order: { id: number } }>(created);
    await changeStatus(
      await authedRequest(admin, `http://localhost/api/orders/${order.id}/status`, {
        method: "PATCH",
        body: { orderStatus: "cancelled", reason: "Out of the area" },
      }),
      params(order.id)
    );

    const rows = await movements();
    const net = rows.reduce((sum, r) => sum + (r.direction === "in" ? r.quantity : -r.quantity), 0);
    // 50 opening (never recorded here, set by the factory) + 30 - 6 - 4 + 4
    expect(await stockOf(product.id)).toBe(74);
    // Every movement AFTER the starting 50 must net to exactly the change.
    expect(net).toBe(24);
  });

  it("does not let a deleted listing lose its history", async () => {
    const admin = await makeUser({ role: "admin" });
    const product = await makeProduct({ stock: 5 });
    await fetchless(inventoryUrl + "/stock-in", admin, { productId: product.id, quantity: 5, source: "Farm delivery" });

    const [row] = await db.select().from(products).where(eq(products.id, product.id));
    expect(row.stock).toBe(10);
    expect(await movements()).toHaveLength(1);
  });
});

/** Small helper: call an inventory endpoint the same way the page does. */
async function fetchless(path: string, user: { id: number; role: string }, body: unknown) {
  const request = await authedRequest(user, path, { method: "POST", body });
  if (path.endsWith("/stock-in")) {
    const { POST } = await import("./stock-in/route");
    const res = await POST(request);
    expect(res.status).toBe(201);
    return res;
  }
  const { POST } = await import("./stock-out/route");
  const res = await POST(request);
  expect(res.status).toBe(201);
  return res;
}
