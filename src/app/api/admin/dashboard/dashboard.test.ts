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

// The dashboard is the admin's control centre. These counts are what an operator
// reads before deciding what to do, so they must be right - and the user counts
// must include admins, not just customers.
describe("GET /api/admin/dashboard - users and fulfilment", () => {
  it("counts every account, split by role", async () => {
    const admin = await makeUser({ role: "admin" });
    await makeUser();
    await makeUser();
    await makeUser();

    const response = await dashboard(
      await authedRequest(admin, "http://localhost/api/admin/dashboard")
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      totalUsers: number; totalCustomers: number; totalAdmins: number;
    };
    expect(body.totalAdmins).toBe(1);
    expect(body.totalCustomers).toBe(3);
    expect(body.totalUsers).toBe(4);
    expect(body.totalUsers).toBe(body.totalCustomers + body.totalAdmins);
  });

  it("separates deliveries from pickups and counts pickups still at the counter", async () => {
    const admin = await makeUser({ role: "admin" });
    const customer = await makeUser();

    await order(customer.id, { fulfilmentMethod: "delivery", orderStatus: "delivered" });
    await order(customer.id, { fulfilmentMethod: "pickup", orderStatus: "pending" });
    await order(customer.id, { fulfilmentMethod: "pickup", orderStatus: "preparing" });
    await order(customer.id, { fulfilmentMethod: "pickup", orderStatus: "delivered" });
    // A cancelled pickup is not waiting for anyone.
    await order(customer.id, { fulfilmentMethod: "pickup", orderStatus: "cancelled" });

    const response = await dashboard(
      await authedRequest(admin, "http://localhost/api/admin/dashboard")
    );
    const body = (await response.json()) as {
      deliveries: number; pickups: number; awaitingPickup: number;
    };
    expect(body.deliveries).toBe(1);
    expect(body.pickups).toBe(3);
    expect(body.awaitingPickup).toBe(2);
  });

  it("is still admin-only", async () => {
    const customer = await makeUser();
    const response = await dashboard(
      await authedRequest(customer, "http://localhost/api/admin/dashboard")
    );
    expect(response.status).toBe(403);
  });
});
