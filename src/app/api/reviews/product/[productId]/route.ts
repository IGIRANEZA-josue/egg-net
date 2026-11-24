// GET /api/reviews/product/:productId -> public reviews for a product
import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { reviews } from "@/db/schema";
import { errorResponse } from "@/lib/auth";
import { withApi } from "@/lib/api-handler";
import { parseId } from "@/lib/parse-id";
import { parsePagination } from "@/lib/pagination";

type Params = { productId: string };

export const GET = withApi<Params>(async ({ request, params }) => {
  const productId = parseId(params.productId);
  if (productId === null) return errorResponse("Product not found.", 404);

  const { page, pageSize, offset } = parsePagination(request);

  const [list, [stats]] = await Promise.all([
    db
      .select()
      .from(reviews)
      .where(eq(reviews.productId, productId))
      .orderBy(desc(reviews.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({
        count: sql<number>`count(*)::int`,
        average: sql<number>`coalesce(avg(${reviews.rating}), 0)::float`,
      })
      .from(reviews)
      .where(eq(reviews.productId, productId)),
  ]);

  return NextResponse.json({
    reviews: list,
    average: Math.round((stats?.average ?? 0) * 10) / 10,
    total: stats?.count ?? 0,
    page,
    pageSize,
  });
});
