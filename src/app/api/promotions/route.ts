// GET  /api/promotions -> ADMIN: list all promotions
// POST /api/promotions -> ADMIN: create promotion
import { NextResponse } from "next/server";
import { db } from "@/db";
import { promotions } from "@/db/schema";
import { desc } from "drizzle-orm";
import { requireAdmin, errorResponse } from "@/lib/auth";
import { readPromotionBody } from "@/lib/validate-promotion";

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const list = await db.select().from(promotions).orderBy(desc(promotions.createdAt));
  return NextResponse.json({ promotions: list });
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  try {
    const result = readPromotionBody(await request.json());
    if (result.error || !result.data) return errorResponse(result.error || "Invalid data.");
    const [promotion] = await db.insert(promotions).values(result.data).returning();
    return NextResponse.json({ promotion }, { status: 201 });
  } catch {
    return errorResponse("Could not create promotion.", 500);
  }
}
