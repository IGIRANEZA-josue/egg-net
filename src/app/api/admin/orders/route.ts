// GET /api/admin/orders -> all orders (optionally ?status=pending)
import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { withApi } from "@/lib/api-handler";
import { parsePagination } from "@/lib/pagination";

const ORDER_STATUSES = ["pending", "confirmed", "preparing", "out_for_delivery", "delivered", "cancelled"];

export const GET = withApi(async ({ request }) => {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const { page, pageSize, offset } = parsePagination(request);

  // Filtering used to happen in JavaScript after loading the whole table.
  const where = status && ORDER_STATUSES.includes(status) ? eq(orders.orderStatus, status) : undefined;

  const [list, [{ count }]] = await Promise.all([
    db.select().from(orders).where(where).orderBy(desc(orders.createdAt)).limit(pageSize).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(orders).where(where),
  ]);

  return NextResponse.json({ orders: list, total: count, page, pageSize });
});
