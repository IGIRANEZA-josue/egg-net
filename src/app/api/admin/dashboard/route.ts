// GET /api/admin/dashboard -> summary numbers for the admin dashboard
//
// Everything is aggregated in SQL. This used to select every order, every
// product and every customer into memory and reduce them in JavaScript.
import { NextResponse } from "next/server";
import { and, desc, eq, gte, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { orders, users, products } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { withApi } from "@/lib/api-handler";

const LOW_STOCK_LIMIT = 5;

export const GET = withApi(async ({ request }) => {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const notCancelled = ne(orders.orderStatus, "cancelled");

  const [
    [collected],
    [pending],
    [orderCounts],
    [customerCount],
    [productStats],
    recent,
    lowStock,
  ] = await Promise.all([
    // "Collected" is money actually received. Before this, the dashboard summed
    // every non-cancelled order regardless of paymentStatus - including mock
    // payments that were never collected.
    db
      .select({ total: sql<number>`coalesce(sum(${orders.total}), 0)::int` })
      .from(orders)
      .where(and(notCancelled, eq(orders.paymentStatus, "paid"))),
    db
      .select({ total: sql<number>`coalesce(sum(${orders.total}), 0)::int` })
      .from(orders)
      .where(and(notCancelled, eq(orders.paymentStatus, "pending"))),
    db
      .select({
        total: sql<number>`count(*)::int`,
        pendingOrders: sql<number>`count(*) filter (where ${orders.orderStatus} = 'pending')::int`,
        delivered: sql<number>`count(*) filter (where ${orders.orderStatus} = 'delivered')::int`,
      })
      .from(orders),
    db.select({ total: sql<number>`count(*)::int` }).from(users).where(eq(users.role, "customer")),
    db
      .select({
        total: sql<number>`count(*)::int`,
        available: sql<number>`count(*) filter (where ${products.isAvailable} and ${products.deletedAt} is null)::int`,
      })
      .from(products),
    db.select().from(orders).orderBy(desc(orders.createdAt)).limit(5),
    db
      .select({ id: products.id, name: products.name, stock: products.stock })
      .from(products)
      .where(and(eq(products.isAvailable, true), isNull(products.deletedAt), sql`${products.stock} <= ${LOW_STOCK_LIMIT}`))
      .orderBy(products.stock)
      .limit(20),
  ]);

  // Last 7 days of collected revenue, bucketed in Rwanda local time.
  // `AT TIME ZONE` needs a literal (Postgres cannot resolve a bind parameter
  // inside the GROUP BY expression); TZ is a constant, not user input.
  const tz = "Africa/Kigali";
  const localDay = sql.raw(`("orders"."created_at" at time zone '${tz}')::date`);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const daily = await db
    .select({
      day: sql<string>`to_char(${localDay}, 'YYYY-MM-DD')`,
      total: sql<number>`coalesce(sum(${orders.total}), 0)::int`,
    })
    .from(orders)
    .where(and(notCancelled, eq(orders.paymentStatus, "paid"), gte(orders.createdAt, sevenDaysAgo)))
    .groupBy(localDay);

  return NextResponse.json({
    totalSales: collected?.total ?? 0,      // kept: now means "collected"
    pendingSales: pending?.total ?? 0,      // new: owed but not received
    totalOrders: orderCounts?.total ?? 0,
    pendingOrders: orderCounts?.pendingOrders ?? 0,
    deliveredOrders: orderCounts?.delivered ?? 0,
    totalCustomers: customerCount?.total ?? 0,
    totalProducts: productStats?.total ?? 0,
    availableProducts: productStats?.available ?? 0,
    recentOrders: recent,
    lowStockProducts: lowStock,
    dailySales: daily,
  });
});
