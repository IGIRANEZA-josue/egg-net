// GET /api/reviews/product/:productId -> public reviews for a product
import { NextResponse } from "next/server";
import { db } from "@/db";
import { reviews } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { parseId } from "@/lib/validate";
import { errorResponse } from "@/lib/auth";

export async function GET(_request: Request, { params }: { params: Promise<{ productId: string }> }) {
  const { productId: raw } = await params;
  const productId = parseId(raw);
  if (!productId) return errorResponse("Invalid product id.");

  try {
    const list = await db
      .select()
      .from(reviews)
      .where(eq(reviews.productId, productId))
      .orderBy(desc(reviews.createdAt))
      .limit(200);

    const [stats] = await db
      .select({ average: sql<number>`coalesce(avg(${reviews.rating}), 0)` })
      .from(reviews)
      .where(eq(reviews.productId, productId));

    return NextResponse.json({ reviews: list, average: Math.round(Number(stats.average) * 10) / 10 });
  } catch (err) {
    console.error("GET /api/reviews/product/:id failed:", err);
    return errorResponse("We could not load reviews. Please try again.", 503);
  }
}
