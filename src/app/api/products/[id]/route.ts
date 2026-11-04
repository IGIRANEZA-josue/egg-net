// GET    /api/products/:id  -> public product details
// PUT    /api/products/:id  -> ADMIN: edit product
// DELETE /api/products/:id  -> ADMIN: delete product
import { NextResponse } from "next/server";
import { db } from "@/db";
import { products } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin, errorResponse } from "@/lib/auth";
import { readProductBody } from "@/lib/validate-product";
import { parseId } from "@/lib/validate";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const productId = parseId(id);
  if (!productId) return errorResponse("Invalid product id.");

  try {
    const [product] = await db.select().from(products).where(eq(products.id, productId));
    if (!product) return errorResponse("Product not found.", 404);
    return NextResponse.json({ product });
  } catch (err) {
    console.error("GET /api/products/:id failed:", err);
    return errorResponse("We could not load the product. Please try again.", 503);
  }
}

export async function PUT(request: Request, { params }: Params) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  const productId = parseId(id);
  if (!productId) return errorResponse("Invalid product id.");

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return errorResponse("Invalid request body.");
    const result = readProductBody(body);
    if (result.error || !result.data) return errorResponse(result.error || "Invalid data.");

    const [product] = await db
      .update(products)
      .set({ ...result.data, updatedAt: new Date() })
      .where(eq(products.id, productId))
      .returning();
    if (!product) return errorResponse("Product not found.", 404);
    return NextResponse.json({ product });
  } catch (err) {
    console.error("PUT /api/products/:id failed:", err);
    return errorResponse("Could not update product.", 500);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  const productId = parseId(id);
  if (!productId) return errorResponse("Invalid product id.");

  try {
    const [deleted] = await db.delete(products).where(eq(products.id, productId)).returning();
    if (!deleted) return errorResponse("Product not found.", 404);
    return NextResponse.json({ message: "Product deleted." });
  } catch (err) {
    console.error("DELETE /api/products/:id failed:", err);
    return errorResponse("Could not delete product.", 500);
  }
}
