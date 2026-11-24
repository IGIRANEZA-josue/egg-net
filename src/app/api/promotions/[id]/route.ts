// PUT    /api/promotions/:id -> ADMIN: edit a promotion
// DELETE /api/promotions/:id -> ADMIN: delete a promotion
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { promotions } from "@/db/schema";
import { requireAdmin, errorResponse } from "@/lib/auth";
import { readPromotionBody } from "@/lib/validate-promotion";
import { findOverlappingPromotion } from "@/lib/promotion-overlap";
import { withApi, readJson, ApiError } from "@/lib/api-handler";
import { parseId } from "@/lib/parse-id";

type Params = { id: string };

export const PUT = withApi<Params>(async ({ request, params, log }) => {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const id = parseId(params.id);
  if (id === null) return errorResponse("Promotion not found.", 404);

  const body = await readJson(request);
  const result = readPromotionBody(body);
  if (result.error || !result.data) return errorResponse(result.error || "Invalid data.");

  const overlap = await findOverlappingPromotion(result.data, id);
  if (overlap) {
    return errorResponse(
      `"${overlap.name}" is already active for these dates. Cancel it first or choose different dates.`,
      409
    );
  }

  try {
    const [promotion] = await db.update(promotions).set(result.data).where(eq(promotions.id, id)).returning();
    if (!promotion) return errorResponse("Promotion not found.", 404);
    return NextResponse.json({ promotion });
  } catch (error) {
    log("promotion update failed", error);
    throw new ApiError("Could not update promotion.", 500);
  }
});

export const DELETE = withApi<Params>(async ({ request, params }) => {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const id = parseId(params.id);
  if (id === null) return errorResponse("Promotion not found.", 404);

  const [deleted] = await db.delete(promotions).where(eq(promotions.id, id)).returning({ id: promotions.id });
  if (!deleted) return errorResponse("Promotion not found.", 404);
  return NextResponse.json({ message: "Promotion deleted." });
});
