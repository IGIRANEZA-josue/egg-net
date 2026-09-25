// GET /api/admin/sales -> simple sales statistics
import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, orderItems } from "@/db/schema";
import { desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const allOrders = await db.select().from(orders).orderBy(desc(orders.createdAt));
  const validOrders = allOrders.filter((o) => o.orderStatus !== "cancelled");
  const validIds = new Set(validOrders.map((o) => o.id));

  const items = (await db.select().from(orderItems)).filter((i) => validIds.has(i.orderId));

  // Group items by product to find the most ordered products
  const byProduct: Record<number, { productId: number; name: string; quantity: number; revenue: number }> = {};
  for (const item of items) {
    if (!byProduct[item.productId]) {
      byProduct[item.productId] = { productId: item.productId, name: item.productName, quantity: 0, revenue: 0 };
    }
    byProduct[item.productId].quantity += item.quantity;
    byProduct[item.productId].revenue += item.quantity * item.price;
  }
  const topProducts = Object.values(byProduct).sort((a, b) => b.quantity - a.quantity).slice(0, 5);

  // Sales per day for the last 7 days (simple bar chart data)
  const days: { date: string; total: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const total = validOrders
      .filter((o) => new Date(o.createdAt).toISOString().slice(0, 10) === key)
      .reduce((s, o) => s + o.total, 0);
    days.push({ date: key, total });
  }

  return NextResponse.json({
    totalSales: validOrders.reduce((s, o) => s + o.total, 0),
    totalOrders: validOrders.length,
    productsSold: items.reduce((s, i) => s + i.quantity, 0),
    topProducts,
    recentOrders: allOrders.slice(0, 10),
    salesByDay: days,
  });
}
