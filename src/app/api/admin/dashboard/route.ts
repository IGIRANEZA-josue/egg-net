// GET /api/admin/dashboard -> summary numbers for the admin dashboard
// Aggregates in SQL so it stays fast as orders grow.
import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, users, products } from "@/db/schema";
import { eq, desc, sql, lte, ne, and } from "drizzle-orm";
import { requireAdmin, errorResponse } from "@/lib/auth";

const LOW_STOCK_LIMIT = 5;

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const [orderStats] = await db
      .select({
        totalOrders: sql<number>`count(*)::int`,
        totalSales: sql<number>`coalesce(sum(${orders.total}) filter (where ${orders.orderStatus} <> 'cancelled'), 0)::int`,
        pendingOrders: sql<number>`count(*) filter (where ${orders.orderStatus} = 'pending')::int`,
      })
      .from(orders);

    const [customerStats] = await db
      .select({ totalCustomers: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.role, "customer"));

    const [productStats] = await db
      .select({
        totalProducts: sql<number>`count(*)::int`,
        lowStockCount: sql<number>`count(*) filter (where ${products.stock} <= ${LOW_STOCK_LIMIT})::int`,
      })
      .from(products);

    const lowStockProducts = await db
      .select()
      .from(products)
      .where(lte(products.stock, LOW_STOCK_LIMIT))
      .orderBy(products.stock)
      .limit(20);

    const recentOrders = await db
      .select()
      .from(orders)
      .where(and(ne(orders.orderStatus, "cancelled")))
      .orderBy(desc(orders.createdAt))
      .limit(5);

    return NextResponse.json({
      totalSales: orderStats.totalSales,
      totalOrders: orderStats.totalOrders,
      totalCustomers: customerStats.totalCustomers,
      totalProducts: productStats.totalProducts,
      lowStockCount: productStats.lowStockCount,
      pendingOrders: orderStats.pendingOrders,
      lowStockProducts,
      recentOrders,
    });
  } catch (err) {
    console.error("GET /api/admin/dashboard failed:", err);
    return errorResponse("We could not load the dashboard. Please try again.", 503);
  }
}
