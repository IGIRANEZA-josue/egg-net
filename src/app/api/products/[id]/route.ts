// GET    /api/products/:id  -> public product details
// PUT    /api/products/:id  -> ADMIN: edit product
// DELETE /api/products/:id  -> ADMIN: delete product
import { NextResponse } from "next/server";
import { db } from "@/db";
import { products } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin, errorResponse } from "@/lib/auth";
import { readProductBody } from "@/lib/validate-product";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const [product] = await db.select().from(products).where(eq(products.id, Number(id)));
  if (!product) return errorResponse("Product not found.", 404);
  return NextResponse.json({ product });
}

export async function PUT(request: Request, { params }: Params) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  try {
    const result = readProductBody(await request.json());
    if (result.error || !result.data) return errorResponse(result.error || "Invalid data.");

    const [product] = await db
      .update(products)
      .set({ ...result.data, updatedAt: new Date() })
      .where(eq(products.id, Number(id)))
      .returning();
    if (!product) return errorResponse("Product not found.", 404);
    return NextResponse.json({ product });
  } catch {
    return errorResponse("Could not update product.", 500);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  const [deleted] = await db.delete(products).where(eq(products.id, Number(id))).returning();
  if (!deleted) return errorResponse("Product not found.", 404);
  return NextResponse.json({ message: "Product deleted." });
}
