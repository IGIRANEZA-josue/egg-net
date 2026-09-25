// GET /api/admin/dashboard -> summary numbers for the admin dashboard
import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, users, products } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";

const LOW_STOCK_LIMIT = 5;

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const allOrders = await db.select().from(orders).orderBy(desc(orders.createdAt));
  const customers = await db.select({ id: users.id }).from(users).where(eq(users.role, "customer"));
  const allProducts = await db.select().from(products);

  // Sales only count orders that are not cancelled
  const validOrders = allOrders.filter((o) => o.orderStatus !== "cancelled");
  const totalSales = validOrders.reduce((sum, o) => sum + o.total, 0);
  const lowStock = allProducts.filter((p) => p.stock <= LOW_STOCK_LIMIT);

  return NextResponse.json({
    totalSales,
    totalOrders: allOrders.length,
    totalCustomers: customers.length,
    totalProducts: allProducts.length,
    lowStockCount: lowStock.length,
    pendingOrders: allOrders.filter((o) => o.orderStatus === "pending").length,
    lowStockProducts: lowStock,
    recentOrders: allOrders.slice(0, 5),
  });
}
