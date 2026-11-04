// PUT    /api/promotions/:id -> ADMIN: edit
// DELETE /api/promotions/:id -> ADMIN: delete
import { NextResponse } from "next/server";
import { db } from "@/db";
import { promotions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin, errorResponse } from "@/lib/auth";
import { readPromotionBody } from "@/lib/validate-promotion";
import { parseId } from "@/lib/validate";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;
  const promotionId = parseId(id);
  if (!promotionId) return errorResponse("Invalid promotion id.");

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return errorResponse("Invalid request body.");
    const result = readPromotionBody(body);
    if (result.error || !result.data) return errorResponse(result.error || "Invalid data.");
    const [promotion] = await db.update(promotions).set(result.data).where(eq(promotions.id, promotionId)).returning();
    if (!promotion) return errorResponse("Promotion not found.", 404);
    return NextResponse.json({ promotion });
  } catch (err) {
    console.error("PUT /api/promotions/:id failed:", err);
    return errorResponse("Could not update promotion.", 500);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;
  const promotionId = parseId(id);
  if (!promotionId) return errorResponse("Invalid promotion id.");

  try {
    const [deleted] = await db.delete(promotions).where(eq(promotions.id, promotionId)).returning();
    if (!deleted) return errorResponse("Promotion not found.", 404);
    return NextResponse.json({ message: "Promotion deleted." });
  } catch (err) {
    console.error("DELETE /api/promotions/:id failed:", err);
    return errorResponse("Could not delete promotion.", 500);
  }
}
