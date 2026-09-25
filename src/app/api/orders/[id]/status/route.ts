// PUT /api/orders/:id/status  (ADMIN) -> update order status and/or payment status
import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin, errorResponse } from "@/lib/auth";

const ORDER_STATUSES = ["pending", "confirmed", "preparing", "out_for_delivery", "delivered", "cancelled"];
const PAYMENT_STATUSES = ["pending", "paid", "failed"];

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  const body = await request.json();
  const updates: { orderStatus?: string; paymentStatus?: string; updatedAt: Date } = { updatedAt: new Date() };

  if (body.orderStatus) {
    if (!ORDER_STATUSES.includes(body.orderStatus)) return errorResponse("Invalid order status.");
    updates.orderStatus = body.orderStatus;
  }
  if (body.paymentStatus) {
    if (!PAYMENT_STATUSES.includes(body.paymentStatus)) return errorResponse("Invalid payment status.");
    updates.paymentStatus = body.paymentStatus;
  }

  const [order] = await db.update(orders).set(updates).where(eq(orders.id, Number(id))).returning();
  if (!order) return errorResponse("Order not found.", 404);
  return NextResponse.json({ order });
}
