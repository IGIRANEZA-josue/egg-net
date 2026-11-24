// GET /api/admin/customers -> list customers with their number of orders (no passwords)
import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users, orders } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { withApi } from "@/lib/api-handler";
import { parsePagination } from "@/lib/pagination";

export const GET = withApi(async ({ request }) => {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { page, pageSize, offset } = parsePagination(request);

  // One query with a grouped join. The old version loaded every order into
  // memory and filtered it once per customer - O(n*m) for a single screen.
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      createdAt: users.createdAt,
      orderCount: sql<number>`count(${orders.id})::int`,
      totalSpent: sql<number>`coalesce(sum(case when ${orders.paymentStatus} = 'paid' and ${orders.orderStatus} <> 'cancelled' then ${orders.total} else 0 end), 0)::int`,
    })
    .from(users)
    .leftJoin(orders, eq(orders.customerId, users.id))
    .where(eq(users.role, "customer"))
    .groupBy(users.id)
    .orderBy(desc(users.createdAt))
    .limit(pageSize)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(eq(users.role, "customer"));

  return NextResponse.json({ customers: rows, total: count, page, pageSize });
});
