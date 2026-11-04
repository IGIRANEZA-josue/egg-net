// GET /api/admin/orders -> all orders (optionally ?status=pending)
import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { desc, eq, SQL } from "drizzle-orm";
import { requireAdmin, errorResponse } from "@/lib/auth";

const ORDER_STATUSES = ["pending", "confirmed", "preparing", "out_for_delivery", "delivered", "cancelled"];

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    if (status && !ORDER_STATUSES.includes(status)) return errorResponse("Invalid status filter.");

    const where: SQL | undefined = status ? eq(orders.orderStatus, status) : undefined;
    const list = await db.select().from(orders).where(where).orderBy(desc(orders.createdAt)).limit(500);

    return NextResponse.json({ orders: list });
  } catch (err) {
    console.error("GET /api/admin/orders failed:", err);
    return errorResponse("We could not load orders. Please try again.", 503);
  }
}
