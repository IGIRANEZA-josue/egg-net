// PUT    /api/promotions/:id -> ADMIN: edit
// DELETE /api/promotions/:id -> ADMIN: delete
import { NextResponse } from "next/server";
import { db } from "@/db";
import { promotions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin, errorResponse } from "@/lib/auth";
import { readPromotionBody } from "@/lib/validate-promotion";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;
  try {
    const result = readPromotionBody(await request.json());
    if (result.error || !result.data) return errorResponse(result.error || "Invalid data.");
    const [promotion] = await db.update(promotions).set(result.data).where(eq(promotions.id, Number(id))).returning();
    if (!promotion) return errorResponse("Promotion not found.", 404);
    return NextResponse.json({ promotion });
  } catch {
    return errorResponse("Could not update promotion.", 500);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;
  const [deleted] = await db.delete(promotions).where(eq(promotions.id, Number(id))).returning();
  if (!deleted) return errorResponse("Promotion not found.", 404);
  return NextResponse.json({ message: "Promotion deleted." });
}
