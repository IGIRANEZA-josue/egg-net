// POST /api/reviews -> customer reviews a product from a DELIVERED order they own
import { NextResponse } from "next/server";
import { db } from "@/db";
import { reviews, orders, orderItems } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireUser, errorResponse } from "@/lib/auth";
import { parseId, tooLong, LIMITS } from "@/lib/validate";

export async function POST(request: Request) {
  const user = await requireUser(request);
  if (user instanceof NextResponse) return user;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return errorResponse("Invalid request body.");

    const orderId = parseId(body.orderId);
    const productId = parseId(body.productId);
    const rating = Number(body.rating);
    const comment = String(body.comment || "").trim();

    if (!orderId || !productId) return errorResponse("Invalid order or product.");
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return errorResponse("Rating must be between 1 and 5.");
    const commentErr = tooLong(comment, LIMITS.comment, "Comment");
    if (commentErr) return errorResponse(commentErr);

    // The order must belong to this customer and be delivered
    const [order] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.customerId, user.id)));
    if (!order) return errorResponse("Order not found.", 404);
    if (order.orderStatus !== "delivered") return errorResponse("You can review a product after it has been delivered.");

    // The product must be inside that order
    const [item] = await db
      .select()
      .from(orderItems)
      .where(and(eq(orderItems.orderId, orderId), eq(orderItems.productId, productId)));
    if (!item) return errorResponse("This product is not part of that order.");

    // One review per product per order (also enforced by a unique index).
    const [existing] = await db
      .select({ id: reviews.id })
      .from(reviews)
      .where(and(eq(reviews.orderId, orderId), eq(reviews.productId, productId), eq(reviews.customerId, user.id)));
    if (existing) return errorResponse("You already reviewed this product for this order.");

    const [review] = await db
      .insert(reviews)
      .values({ customerId: user.id, customerName: user.name, productId, orderId, rating, comment })
      .returning();
    return NextResponse.json({ review }, { status: 201 });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      return errorResponse("You already reviewed this product for this order.");
    }
    console.error("POST /api/reviews failed:", err);
    return errorResponse("Could not save review.", 500);
  }
}
