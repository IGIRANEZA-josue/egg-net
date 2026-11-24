// GET /api/admin/sales -> sales statistics
//
// Aggregated in SQL with Rwanda-local (Africa/Kigali) day buckets. The old
// version bucketed by UTC via toISOString(), which put every order placed
// between 00:00 and 02:00 local time on the previous day's chart.
import { NextResponse } from "next/server";
import { and, desc, eq, gte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { orders, orderItems } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { withApi } from "@/lib/api-handler";

// `AT TIME ZONE` requires a literal here: PostgreSQL cannot resolve it from a
// bind parameter inside a GROUP BY expression. The value is a constant in this
// file, never user input, so interpolating it is safe.
const TZ = "Africa/Kigali";
const LOCAL_DAY = sql.raw(`("orders"."created_at" at time zone '${TZ}')::date`);

export const GET = withApi(async ({ request }) => {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const notCancelled = ne(orders.orderStatus, "cancelled");
  const paid = eq(orders.paymentStatus, "paid");

  const [topProducts, daily, [totals]] = await Promise.all([
    db
      .select({
        productId: orderItems.productId,
        name: orderItems.productName,
        quantity: sql<number>`sum(${orderItems.quantity})::int`,
        revenue: sql<number>`sum(${orderItems.quantity} * ${orderItems.price})::int`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(and(notCancelled, paid))
      .groupBy(orderItems.productId, orderItems.productName)
      .orderBy(desc(sql`sum(${orderItems.quantity})`))
      .limit(5),

    db
      .select({
        day: sql<string>`to_char(${LOCAL_DAY}, 'YYYY-MM-DD')`,
        total: sql<number>`coalesce(sum(${orders.total}), 0)::int`,
      })
      .from(orders)
      .where(and(notCancelled, paid, gte(orders.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))))
      .groupBy(LOCAL_DAY)
      .orderBy(LOCAL_DAY),

    db
      .select({
        collected: sql<number>`coalesce(sum(${orders.total}), 0)::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(orders)
      .where(and(notCancelled, paid)),
  ]);

  // Fill in the days with no orders so the chart has a continuous axis.
  const series: { date: string; total: number }[] = [];
  const byDay = new Map(daily.map((d) => [d.day, d.total]));
  for (let i = 6; i >= 0; i--) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
    series.push({ date: key, total: byDay.get(key) ?? 0 });
  }

  return NextResponse.json({
    topProducts,
    dailySales: series,
    collectedSales: totals?.collected ?? 0,
    paidOrders: totals?.count ?? 0,
  });
});
