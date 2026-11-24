import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, reviews, orderItems } from "@/db/schema";
import { POST as createReview } from "@/app/api/reviews/route";
import { makeProduct, makeUser, authedRequest } from "@/test/helpers";

async function deliveredOrder(customerId: number, productId: number) {
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
      paymentStatus: "paid",
      orderStatus: "delivered",
    })
    .returning();
  await db.insert(orderItems).values({
    orderId: order.id,
    productId,
    productName: "Fresh Eggs",
    price: 1500,
    quantity: 1,
  });
  return order;
}

function reviewRequest(user: { id: number; role: string }, body: unknown) {
  return authedRequest(user, "http://localhost/api/reviews", { method: "POST", body });
}

describe("POST /api/reviews", () => {
  it("accepts a review for a product in a delivered order", async () => {
    const customer = await makeUser();
    const product = await makeProduct();
    const order = await deliveredOrder(customer.id, product.id);

    const response = await createReview(
      await reviewRequest(customer, { orderId: order.id, productId: product.id, rating: 5, comment: "Fresh and well packed." })
    );

    expect(response.status).toBe(201);
    expect(await db.select().from(reviews)).toHaveLength(1);
  });

  it("rejects a review before the order is delivered", async () => {
    const customer = await makeUser();
    const product = await makeProduct();
    const order = await deliveredOrder(customer.id, product.id);
    await db.update(orders).set({ orderStatus: "out_for_delivery" }).where(eq(orders.id, order.id));

    const response = await createReview(
      await reviewRequest(customer, { orderId: order.id, productId: product.id, rating: 5 })
    );

    expect(response.status).toBe(400);
    expect((await response.json()).message).toMatch(/delivered/i);
    expect(await db.select().from(reviews)).toHaveLength(0);
  });

  it("rejects a second review of the same product for the same order", async () => {
    const customer = await makeUser();
    const product = await makeProduct();
    const order = await deliveredOrder(customer.id, product.id);

    await createReview(await reviewRequest(customer, { orderId: order.id, productId: product.id, rating: 5 }));
    const second = await createReview(
      await reviewRequest(customer, { orderId: order.id, productId: product.id, rating: 4 })
    );

    expect(second.status).toBe(400);
    expect((await second.json()).message).toMatch(/already reviewed/i);
    expect(await db.select().from(reviews)).toHaveLength(1);
  });

  it("rejects a review for someone else's order", async () => {
    const owner = await makeUser();
    const stranger = await makeUser();
    const product = await makeProduct();
    const order = await deliveredOrder(owner.id, product.id);

    const response = await createReview(
      await reviewRequest(stranger, { orderId: order.id, productId: product.id, rating: 5 })
    );

    expect(response.status).toBe(404);
  });

  it("rejects a rating outside 1-5", async () => {
    const customer = await makeUser();
    const product = await makeProduct();
    const order = await deliveredOrder(customer.id, product.id);

    const response = await createReview(
      await reviewRequest(customer, { orderId: order.id, productId: product.id, rating: 9 })
    );
    expect(response.status).toBe(400);
  });

  it("enforces one review per product per order at the database level", async () => {
    const customer = await makeUser();
    const product = await makeProduct();
    const order = await deliveredOrder(customer.id, product.id);

    await db.insert(reviews).values({
      customerId: customer.id,
      customerName: customer.name,
      productId: product.id,
      orderId: order.id,
      rating: 5,
    });

    // The unique index (order, product, customer) is the last line of defence.
    await expect(
      db.insert(reviews).values({
        customerId: customer.id,
        customerName: customer.name,
        productId: product.id,
        orderId: order.id,
        rating: 4,
      })
    ).rejects.toThrow();
  });
});
