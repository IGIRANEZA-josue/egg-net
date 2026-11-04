// GET /api/admin/sales -> sales statistics (aggregated in SQL)
import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, orderItems } from "@/db/schema";
import { desc, sql, ne, gte, and, eq } from "drizzle-orm";
import { requireAdmin, errorResponse } from "@/lib/auth";

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const valid = ne(orders.orderStatus, "cancelled");

    const [totals] = await db
      .select({
        totalSales: sql<number>`coalesce(sum(${orders.total}), 0)::int`,
        totalOrders: sql<number>`count(*)::int`,
      })
      .from(orders)
      .where(valid);

    const [sold] = await db
      .select({ productsSold: sql<number>`coalesce(sum(${orderItems.quantity}), 0)::int` })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(valid);

    const topProducts = await db
      .select({
        productId: orderItems.productId,
        name: sql<string>`max(${orderItems.productName})`,
        quantity: sql<number>`sum(${orderItems.quantity})::int`,
        revenue: sql<number>`sum(${orderItems.quantity} * ${orderItems.price})::int`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(valid)
      .groupBy(orderItems.productId)
      .orderBy(desc(sql`sum(${orderItems.quantity})`))
      .limit(5);

    // Sales per day for the last 7 days (bar chart data)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 6);
    weekAgo.setHours(0, 0, 0, 0);

    const rows = await db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${orders.createdAt}), 'YYYY-MM-DD')`,
        total: sql<number>`sum(${orders.total})::int`,
      })
      .from(orders)
      .where(and(valid, gte(orders.createdAt, weekAgo)))
      .groupBy(sql`date_trunc('day', ${orders.createdAt})`);

    const byDay = new Map(rows.map((r) => [r.day, r.total]));
    const days: { date: string; total: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      days.push({ date: key, total: byDay.get(key) ?? 0 });
    }

    const recentOrders = await db.select().from(orders).orderBy(desc(orders.createdAt)).limit(10);

    return NextResponse.json({
      totalSales: totals.totalSales,
      totalOrders: totals.totalOrders,
      productsSold: sold.productsSold,
      topProducts,
      recentOrders,
      salesByDay: days,
    });
  } catch (err) {
    console.error("GET /api/admin/sales failed:", err);
    return errorResponse("We could not load sales statistics. Please try again.", 503);
  }
}
