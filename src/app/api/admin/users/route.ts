// GET /api/admin/users -> every account, customers and admins, with the numbers
// an operator needs. Never returns a password hash.
//   ?search=  ?role=customer|admin  ?status=active|inactive  ?page=  ?pageSize=
import { NextResponse } from "next/server";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { users, orders } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { withApi } from "@/lib/api-handler";
import { parsePagination } from "@/lib/pagination";

export const GET = withApi(async ({ request }) => {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { searchParams } = new URL(request.url);
  const { page, pageSize, offset } = parsePagination(request);
  const search = (searchParams.get("search") ?? "").trim();
  const role = searchParams.get("role") ?? "";
  const status = searchParams.get("status") ?? "";

  const conditions = [];
  if (role === "admin" || role === "customer") conditions.push(eq(users.role, role));
  if (status === "active") conditions.push(eq(users.isActive, true));
  if (status === "inactive") conditions.push(eq(users.isActive, false));
  if (search) {
    conditions.push(
      or(
        ilike(users.name, `%${search}%`),
        ilike(users.email, `%${search}%`),
        ilike(users.phone, `%${search}%`)
      )!
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      role: users.role,
      address: users.address,
      isActive: users.isActive,
      createdAt: users.createdAt,
      orderCount: sql<number>`count(${orders.id})::int`,
      totalSpent: sql<number>`coalesce(sum(case when ${orders.paymentStatus} = 'paid' and ${orders.orderStatus} <> 'cancelled' then ${orders.total} else 0 end), 0)::int`,
    })
    .from(users)
    .leftJoin(orders, eq(orders.customerId, users.id))
    .where(where)
    .groupBy(users.id)
    .orderBy(desc(users.createdAt))
    .limit(pageSize)
    .offset(offset);

  const [counts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      customers: sql<number>`count(*) filter (where ${users.role} = 'customer')::int`,
      admins: sql<number>`count(*) filter (where ${users.role} = 'admin')::int`,
      active: sql<number>`count(*) filter (where ${users.isActive})::int`,
      inactive: sql<number>`count(*) filter (where not ${users.isActive})::int`,
    })
    .from(users);

  return NextResponse.json({ users: rows, ...counts, page, pageSize, total: counts?.total ?? 0 });
});
