// GET /api/admin/orders -> all orders (optionally ?status=pending)
import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  let list = await db.select().from(orders).orderBy(desc(orders.createdAt));
  if (status) list = list.filter((o) => o.orderStatus === status);

  return NextResponse.json({ orders: list });
}
