// GET  /api/promotions    -> ADMIN: list all promotions
// POST /api/promotions    -> ADMIN: create a promotion
import { NextResponse } from "next/server";
import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { promotions } from "@/db/schema";
import { requireAdmin, errorResponse } from "@/lib/auth";
import { readPromotionBody } from "@/lib/validate-promotion";
import { findOverlappingPromotion } from "@/lib/promotion-overlap";
import { withApi, readJson, ApiError } from "@/lib/api-handler";
import { parsePagination } from "@/lib/pagination";

export const GET = withApi(async ({ request }) => {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { page, pageSize, offset } = parsePagination(request);
  const [list, [{ count }]] = await Promise.all([
    db.select().from(promotions).orderBy(desc(promotions.createdAt)).limit(pageSize).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(promotions),
  ]);
  return NextResponse.json({ promotions: list, total: count, page, pageSize });
});

export const POST = withApi(async ({ request, log }) => {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const body = await readJson(request);
  const result = readPromotionBody(body);
  if (result.error || !result.data) return errorResponse(result.error || "Invalid data.");

  // Two overlapping active promotions made the customer's discount depend on
  // row order. Refuse the overlap instead of silently picking one.
  const overlap = await findOverlappingPromotion(result.data, null);
  if (overlap) {
    return errorResponse(
      `"${overlap.name}" is already active for these dates. Cancel it first or choose different dates.`,
      409
    );
  }

  try {
    const [promotion] = await db.insert(promotions).values(result.data).returning();
    return NextResponse.json({ promotion }, { status: 201 });
  } catch (error) {
    log("promotion create failed", error);
    throw new ApiError("Could not create promotion.", 500);
  }
});
