// GET /api/admin/customers -> list customers with their number of orders (no passwords)
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, orders } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const customers = await db
    .select({ id: users.id, name: users.name, email: users.email, phone: users.phone, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.role, "customer"))
    .orderBy(desc(users.createdAt));

  const allOrders = await db.select({ customerId: orders.customerId }).from(orders);

  const list = customers.map((c) => ({
    ...c,
    orderCount: allOrders.filter((o) => o.customerId === c.id).length,
  }));

  return NextResponse.json({ customers: list });
}
