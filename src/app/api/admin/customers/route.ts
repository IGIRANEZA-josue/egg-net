// GET /api/admin/customers -> list customers with their number of orders (no passwords)
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, orders } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { requireAdmin, errorResponse } from "@/lib/auth";

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const customers = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        createdAt: users.createdAt,
        orderCount: sql<number>`count(${orders.id})::int`,
      })
      .from(users)
      .leftJoin(orders, eq(orders.customerId, users.id))
      .where(eq(users.role, "customer"))
      .groupBy(users.id)
      .orderBy(desc(users.createdAt))
      .limit(1000);

    return NextResponse.json({ customers });
  } catch (err) {
    console.error("GET /api/admin/customers failed:", err);
    return errorResponse("We could not load customers. Please try again.", 503);
  }
}
