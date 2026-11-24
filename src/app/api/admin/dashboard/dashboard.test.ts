import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { GET as dashboard } from "@/app/api/admin/dashboard/route";
import { GET as sales } from "@/app/api/admin/sales/route";
import { makeUser, authedRequest } from "@/test/helpers";

async function order(customerId: number, values: Partial<typeof orders.$inferInsert>) {
  const [row] = await db
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
      subtotal: 1000,
      deliveryFee: 1000,
      total: 2000,
      paymentMethod: "cash",
      paymentStatus: "paid",
      orderStatus: "delivered",
      ...values,
    })
    .returning();
  return row;
}

describe("GET /api/admin/dashboard", () => {
  it("reports collected and pending revenue separately, excluding cancelled orders", async () => {
    const admin = await makeUser({ role: "admin" });
    const customer = await makeUser();

    await order(customer.id, { total: 5000, paymentStatus: "paid" });
    await order(customer.id, { total: 3000, paymentStatus: "paid" });
    await order(customer.id, { total: 2000, paymentStatus: "pending", paymentMethod: "cash" });
    // Cancelled and unpaid orders must never count as revenue.
    await order(customer.id, { total: 90_000, paymentStatus: "pending", orderStatus: "cancelled" });
    await order(customer.id, { total: 70_000, paymentStatus: "failed" });

    const response = await dashboard(await authedRequest(admin, "http://localhost/api/admin/dashboard"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { totalSales: number; pendingSales: number };

    expect(body.totalSales).toBe(8000); // the two paid orders only
    expect(body.pendingSales).toBe(2000); // the cash order awaiting payment
  });

  it("is admin only", async () => {
    const customer = await makeUser();
    const response = await dashboard(await authedRequest(customer, "http://localhost/api/admin/dashboard"));
    expect(response.status).toBe(403);
  });
});

describe("GET /api/admin/sales", () => {
  it("counts only paid, non-cancelled orders", async () => {
    const admin = await makeUser({ role: "admin" });
    const customer = await makeUser();

    await order(customer.id, { total: 4000, paymentStatus: "paid" });
    await order(customer.id, { total: 9000, paymentStatus: "pending" });
    await order(customer.id, { total: 9000, paymentStatus: "paid", orderStatus: "cancelled" });

    const response = await sales(await authedRequest(admin, "http://localhost/api/admin/sales"));
    const body = (await response.json()) as { collectedSales: number; dailySales: { date: string; total: number }[] };

    expect(body.collectedSales).toBe(4000);
    // A continuous 7-day axis is returned even when most days have no orders.
    expect(body.dailySales).toHaveLength(7);
    expect(body.dailySales.reduce((sum, d) => sum + d.total, 0)).toBe(4000);
  });
});
