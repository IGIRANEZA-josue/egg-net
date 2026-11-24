// PUT /api/orders/:id/status  (ADMIN) -> update order status and/or payment status
import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { orders, orderItems, products } from "@/db/schema";
import { requireAdmin, errorResponse } from "@/lib/auth";
import { withApi, readJson, ApiError } from "@/lib/api-handler";
import { parseId } from "@/lib/parse-id";

export const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "out_for_delivery",
  "delivered",
  "cancelled",
] as const;
const PAYMENT_STATUSES = ["pending", "paid", "failed"] as const;

/**
 * The only transitions the admin UI may perform.
 *
 * Before this table the endpoint accepted anything - `delivered -> pending`,
 * `cancelled -> paid` - and cancelling an order silently destroyed its stock
 * because nothing put it back.
 */
const TRANSITIONS: Record<string, readonly string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["out_for_delivery", "cancelled"],
  out_for_delivery: ["delivered", "cancelled"],
  delivered: [], // terminal
  cancelled: [], // terminal - makes double-restock impossible
};

type Params = { id: string };

export const PUT = withApi<Params>(async ({ request, params, log }) => {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const id = parseId(params.id);
  if (id === null) return errorResponse("Order not found.", 404);

  const body = await readJson(request);
  const nextOrderStatus = typeof body.orderStatus === "string" ? body.orderStatus : undefined;
  const nextPaymentStatus = typeof body.paymentStatus === "string" ? body.paymentStatus : undefined;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (nextOrderStatus && !ORDER_STATUSES.includes(nextOrderStatus as (typeof ORDER_STATUSES)[number])) {
    return errorResponse("Invalid order status.");
  }
  if (nextPaymentStatus && !PAYMENT_STATUSES.includes(nextPaymentStatus as (typeof PAYMENT_STATUSES)[number])) {
    return errorResponse("Invalid payment status.");
  }
  if (!nextOrderStatus && !nextPaymentStatus) return errorResponse("Nothing to update.");

  if (nextOrderStatus === "cancelled" && !reason) {
    return errorResponse("Please give a reason for cancelling this order.");
  }

  try {
    type Outcome = { error: string; status: number } | { order: typeof orders.$inferSelect };

    const result: Outcome = await db.transaction(async (tx): Promise<Outcome> => {
      const [current] = await tx.select().from(orders).where(eq(orders.id, id)).for("update");
      if (!current) return { error: "Order not found.", status: 404 };

      const updates: Partial<typeof orders.$inferInsert> = {
        updatedAt: new Date(),
        statusChangedBy: admin.id,
        statusChangedAt: new Date(),
      };

      if (nextOrderStatus && nextOrderStatus !== current.orderStatus) {
        const allowed = TRANSITIONS[current.orderStatus] ?? [];
        if (!allowed.includes(nextOrderStatus)) {
          return {
            error: `This order cannot move from ${current.orderStatus} to ${nextOrderStatus}.`,
            status: 409,
          };
        }
        updates.orderStatus = nextOrderStatus;

        if (nextOrderStatus === "cancelled") {
          updates.cancellationReason = reason;
          // Money already collected must be returned by hand - never silently
          // flipped to "failed".
          if (current.paymentStatus === "paid") updates.refundRequired = true;

          // Put the stock back. `cancelled` is terminal in the table above, so
          // this can only run once per order.
          const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, id));
          for (const item of items) {
            await tx
              .update(products)
              .set({ stock: sql`${products.stock} + ${item.quantity}`, updatedAt: new Date() })
              .where(eq(products.id, item.productId));
          }
        }
      }

      if (nextPaymentStatus) updates.paymentStatus = nextPaymentStatus;

      const [updated] = await tx.update(orders).set(updates).where(eq(orders.id, id)).returning();
      return { order: updated };
    });

    if ("error" in result) return errorResponse(result.error, result.status);
    return NextResponse.json({ order: result.order });
  } catch (error) {
    log("status update failed", error);
    throw new ApiError("Could not update this order. Please try again.", 500);
  }
});
