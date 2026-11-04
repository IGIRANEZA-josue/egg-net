// PUT /api/orders/:id/status  (ADMIN) -> update order status and/or payment status
// Cancelling an order restores its stock; re-activating a cancelled order
// takes the stock back out (and fails cleanly when it is no longer available).
import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, orderItems, products } from "@/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { requireAdmin, errorResponse } from "@/lib/auth";
import { parseId } from "@/lib/validate";

const ORDER_STATUSES = ["pending", "confirmed", "preparing", "out_for_delivery", "delivered", "cancelled"];
const PAYMENT_STATUSES = ["pending", "paid", "failed"];

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  const orderId = parseId(id);
  if (!orderId) return errorResponse("Invalid order id.");

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return errorResponse("Invalid request body.");

  const updates: { orderStatus?: string; paymentStatus?: string; updatedAt: Date } = { updatedAt: new Date() };
  if (body.orderStatus !== undefined) {
    if (!ORDER_STATUSES.includes(body.orderStatus)) return errorResponse("Invalid order status.");
    updates.orderStatus = body.orderStatus;
  }
  if (body.paymentStatus !== undefined) {
    if (!PAYMENT_STATUSES.includes(body.paymentStatus)) return errorResponse("Invalid payment status.");
    updates.paymentStatus = body.paymentStatus;
  }
  if (!updates.orderStatus && !updates.paymentStatus) return errorResponse("Nothing to update.");

  try {
    const result = await db.transaction(async (tx): Promise<{ ok: false; error: string; status: number } | { ok: true; order: typeof orders.$inferSelect }> => {
      const [current] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
      if (!current) return { ok: false, error: "Order not found.", status: 404 };

      const wasCancelled = current.orderStatus === "cancelled";
      const willCancel = updates.orderStatus === "cancelled";

      if (!wasCancelled && willCancel) {
        // Return every item to stock.
        const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
        for (const item of items) {
          await tx
            .update(products)
            .set({ stock: sql`${products.stock} + ${item.quantity}`, updatedAt: new Date() })
            .where(eq(products.id, item.productId));
        }
      } else if (wasCancelled && updates.orderStatus && !willCancel) {
        // Re-activating: take the stock back out, atomically.
        const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
        for (const item of items) {
          const [updated] = await tx
            .update(products)
            .set({ stock: sql`${products.stock} - ${item.quantity}`, updatedAt: new Date() })
            .where(and(eq(products.id, item.productId), gte(products.stock, item.quantity)))
            .returning({ id: products.id });
          if (!updated) {
            return {
              ok: false,
              error: `Not enough stock of "${item.productName}" to re-activate this order.`,
              status: 400,
            };
          }
        }
      }

      const [order] = await tx.update(orders).set(updates).where(eq(orders.id, orderId)).returning();
      return { ok: true, order };
    });

    if (!result.ok) return errorResponse(result.error, result.status);
    return NextResponse.json({ order: result.order });
  } catch (err) {
    console.error("PUT /api/orders/:id/status failed:", err);
    return errorResponse("Could not update the order. Please try again.", 500);
  }
}
