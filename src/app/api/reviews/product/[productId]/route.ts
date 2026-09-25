// GET /api/reviews/product/:productId -> public reviews for a product
import { NextResponse } from "next/server";
import { db } from "@/db";
import { reviews } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(_request: Request, { params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  const list = await db.select().from(reviews).where(eq(reviews.productId, Number(productId))).orderBy(desc(reviews.createdAt));
  const average = list.length ? list.reduce((s, r) => s + r.rating, 0) / list.length : 0;
  return NextResponse.json({ reviews: list, average: Math.round(average * 10) / 10 });
}
