// POST /api/reviews -> customer reviews a product from a DELIVERED order they own
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { reviews, orders, orderItems } from "@/db/schema";
import { requireUser, errorResponse } from "@/lib/auth";
import { withApi, readJson, ApiError } from "@/lib/api-handler";

export const POST = withApi(async ({ request, log }) => {
  const user = await requireUser(request);
  if (user instanceof NextResponse) return user;

  const body = await readJson(request);
  const orderId = Number(body.orderId);
  const productId = Number(body.productId);
  const rating = Number(body.rating);
  const comment = String(body.comment || "").trim();

  if (!Number.isSafeInteger(orderId) || !Number.isSafeInteger(productId)) {
    return errorResponse("Please choose a product from your order.");
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return errorResponse("Rating must be between 1 and 5.");
  if (comment.length > 1000) return errorResponse("Please keep your review under 1000 characters.");

  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.customerId, user.id)));
  if (!order) return errorResponse("Order not found.", 404);
  if (order.orderStatus !== "delivered") return errorResponse("You can review a product after it has been delivered.");

  const [item] = await db
    .select()
    .from(orderItems)
    .where(and(eq(orderItems.orderId, orderId), eq(orderItems.productId, productId)));
  if (!item) return errorResponse("This product is not part of that order.");

  const [existing] = await db
    .select()
    .from(reviews)
    .where(
      and(eq(reviews.orderId, orderId), eq(reviews.productId, productId), eq(reviews.customerId, user.id))
    );
  if (existing) return errorResponse("You already reviewed this product for this order.");

  try {
    const [review] = await db
      .insert(reviews)
      .values({ customerId: user.id, customerName: user.name, productId, orderId, rating, comment })
      .returning();
    return NextResponse.json({ review }, { status: 201 });
  } catch (error) {
    // The unique index (order, product, customer) is the real guard - two
    // concurrent submits cannot create duplicates.
    if (typeof error === "object" && error && "code" in error && (error as { code: string }).code === "23505") {
      return errorResponse("You already reviewed this product for this order.");
    }
    log("review insert failed", error);
    throw new ApiError("Could not save review.", 500);
  }
});
