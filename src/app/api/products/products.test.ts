import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { products, orders, orderItems } from "@/db/schema";
import { GET as listProducts } from "@/app/api/products/route";
import { GET as getProduct, DELETE as deleteProduct, PUT as updateProduct } from "@/app/api/products/[id]/route";
import { makeProduct, makeUser, authedRequest } from "@/test/helpers";

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("GET /api/products", () => {
  it("hides unavailable products from the public list", async () => {
    await makeProduct({ name: "Visible", isAvailable: true });
    await makeProduct({ name: "Hidden", isAvailable: false });

    const response = await listProducts(new Request("http://localhost/api/products"));
    const body = (await response.json()) as { products: { name: string }[] };

    expect(body.products.map((p) => p.name)).toEqual(["Visible"]);
  });

  it("requires admin for ?all=true", async () => {
    await makeProduct({ name: "Hidden", isAvailable: false });

    const anonymous = await listProducts(new Request("http://localhost/api/products?all=true"));
    expect(anonymous.status).toBe(401);

    const admin = await makeUser({ role: "admin" });
    const allowed = await listProducts(
      await authedRequest(admin, "http://localhost/api/products?all=true")
    );
    expect(allowed.status).toBe(200);
    const body = (await allowed.json()) as { products: unknown[] };
    expect(body.products).toHaveLength(1);
  });

  it("filters by search term", async () => {
    await makeProduct({ name: "Tray of thirty" });
    await makeProduct({ name: "Half dozen" });

    const response = await listProducts(new Request("http://localhost/api/products?search=tray"));
    const body = (await response.json()) as { products: { name: string }[] };
    expect(body.products.map((p) => p.name)).toEqual(["Tray of thirty"]);
  });

  it("paginates and reports the total", async () => {
    for (let i = 0; i < 5; i++) await makeProduct({ name: `Pack ${i}` });

    const response = await listProducts(new Request("http://localhost/api/products?page=2&pageSize=2"));
    const body = (await response.json()) as { products: unknown[]; total: number; page: number };
    expect(body.products).toHaveLength(2);
    expect(body.total).toBe(5);
    expect(body.page).toBe(2);
  });
});

describe("GET /api/products/:id", () => {
  it("returns 404 for a non-numeric id instead of a database error", async () => {
    const response = await getProduct(new Request("http://localhost/api/products/abc"), params("abc"));
    expect(response.status).toBe(404);
    expect((await response.json()).message).toBe("Product not found.");
  });

  it("returns 404 for a soft-deleted product", async () => {
    const product = await makeProduct();
    await db.update(products).set({ deletedAt: new Date() }).where(eq(products.id, product.id));
    const response = await getProduct(new Request("http://localhost"), params(String(product.id)));
    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/products/:id", () => {
  async function productWithHistory() {
    const customer = await makeUser();
    const product = await makeProduct({ stock: 10 });
    const [order] = await db
      .insert(orders)
      .values({
        orderNumber: `EGG-2026-${Math.floor(Math.random() * 900000 + 100000)}`,
        customerId: customer.id,
        customerName: customer.name,
        phone: "0788123456",
        province: "Kigali City",
        district: "Gasabo",
        sector: "Remera",
        address: "KG 11 Ave",
        subtotal: 1500,
        deliveryFee: 1000,
        total: 2500,
        paymentMethod: "cash",
        paymentStatus: "paid",
        orderStatus: "delivered",
      })
      .returning();
    await db.insert(orderItems).values({ orderId: order.id, productId: product.id, productName: product.name, price: 1500, quantity: 1 });
    return { product, order };
  }

  it("soft-deletes a product with order history and keeps the order intact", async () => {
    const admin = await makeUser({ role: "admin" });
    const { product, order } = await productWithHistory();

    const response = await deleteProduct(
      await authedRequest(admin, `http://localhost/api/products/${product.id}`, { method: "DELETE" }),
      params(String(product.id))
    );

    expect(response.status).toBe(409);
    expect((await response.json()).message).toMatch(/marked unavailable/i);

    // History survives.
    const [stillThere] = await db.select().from(products).where(eq(products.id, product.id));
    expect(stillThere).toBeTruthy();
    expect(stillThere.isAvailable).toBe(false);
    expect(await db.select().from(orderItems).where(eq(orderItems.orderId, order.id))).toHaveLength(1);

    // And it is gone from the storefront.
    const list = await listProducts(new Request("http://localhost/api/products"));
    const body = (await list.json()) as { products: unknown[] };
    expect(body.products).toHaveLength(0);
  });

  it("hard-deletes an unreferenced product", async () => {
    const admin = await makeUser({ role: "admin" });
    const product = await makeProduct();

    const response = await deleteProduct(
      await authedRequest(admin, `http://localhost/api/products/${product.id}`, { method: "DELETE" }),
      params(String(product.id))
    );

    expect(response.status).toBe(200);
    expect(await db.select().from(products).where(eq(products.id, product.id))).toHaveLength(0);
  });

  it("is admin only", async () => {
    const customer = await makeUser();
    const product = await makeProduct();
    const response = await deleteProduct(
      await authedRequest(customer, `http://localhost/api/products/${product.id}`, { method: "DELETE" }),
      params(String(product.id))
    );
    expect(response.status).toBe(403);
  });
});

describe("PUT /api/products/:id", () => {
  it("ignores an id supplied inside the body", async () => {
    const admin = await makeUser({ role: "admin" });
    const product = await makeProduct({ name: "Original" });

    const response = await updateProduct(
      await authedRequest(admin, `http://localhost/api/products/${product.id}`, {
        method: "PUT",
        body: { id: 99999, name: "Renamed", price: 1500, packageSize: 10, stock: 4 },
      }),
      params(String(product.id))
    );

    expect(response.status).toBe(200);
    const [row] = await db.select().from(products).where(eq(products.id, 99999));
    expect(row).toBeUndefined();
  });
});
