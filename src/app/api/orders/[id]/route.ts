// GET /api/orders/:id -> order details (owner or admin only)
import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, orderItems, reviews } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireUser, errorResponse } from "@/lib/auth";
import { parseId } from "@/lib/validate";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const user = await requireUser(request);
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  const orderId = parseId(id);
  if (!orderId) return errorResponse("Invalid order id.");

  try {
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    if (!order) return errorResponse("Order not found.", 404);
    if (user.role !== "admin" && order.customerId !== user.id) return errorResponse("Unauthorized.", 403);

    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    // which products in this order has the customer already reviewed?
    const myReviews = await db
      .select({ productId: reviews.productId })
      .from(reviews)
      .where(and(eq(reviews.orderId, order.id), eq(reviews.customerId, user.id)));

    return NextResponse.json({ order, items, reviewedProductIds: myReviews.map((r) => r.productId) });
  } catch (err) {
    console.error("GET /api/orders/:id failed:", err);
    return errorResponse("We could not load the order. Please try again.", 503);
  }
}
