// GET /api/orders/:id -> order details (owner or admin only)
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, orderItems, reviews } from "@/db/schema";
import { requireUser, errorResponse } from "@/lib/auth";
import { withApi } from "@/lib/api-handler";
import { parseId } from "@/lib/parse-id";

type Params = { id: string };

export const GET = withApi<Params>(async ({ request, params }) => {
  const user = await requireUser(request);
  if (user instanceof NextResponse) return user;

  const id = parseId(params.id);
  if (id === null) return errorResponse("Order not found.", 404);

  const [order] = await db.select().from(orders).where(eq(orders.id, id));
  if (!order) return errorResponse("Order not found.", 404);
  if (user.role !== "admin" && order.customerId !== user.id) return errorResponse("Unauthorized.", 403);

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  // which products in this order has the customer already reviewed?
  const myReviews = await db
    .select({ productId: reviews.productId })
    .from(reviews)
    .where(and(eq(reviews.orderId, order.id), eq(reviews.customerId, user.id)));

  return NextResponse.json({ order, items, reviewedProductIds: myReviews.map((r) => r.productId) });
});
