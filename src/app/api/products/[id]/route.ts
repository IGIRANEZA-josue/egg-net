// GET    /api/products/:id  -> public product details
// PUT    /api/products/:id  -> ADMIN: edit product
// DELETE /api/products/:id  -> ADMIN: delete product (soft-deletes when referenced)
import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { products, orderItems, reviews } from "@/db/schema";
import { requireAdmin, errorResponse } from "@/lib/auth";
import { readProductBody } from "@/lib/validate-product";
import { withApi, readJson, ApiError } from "@/lib/api-handler";
import { parseId } from "@/lib/parse-id";
import { stockIn, stockOut } from "@/lib/inventory";

type Params = { id: string };

export const GET = withApi<Params>(async ({ params }) => {
  const id = parseId(params.id);
  if (id === null) return errorResponse("Product not found.", 404);

  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, id), isNull(products.deletedAt)));
  if (!product) return errorResponse("Product not found.", 404);
  return NextResponse.json({ product });
});

export const PUT = withApi<Params>(async ({ request, params, log }) => {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const id = parseId(params.id);
  if (id === null) return errorResponse("Product not found.", 404);

  const body = await readJson(request);
  const result = readProductBody(body);
  if (result.error || !result.data) return errorResponse(result.error || "Invalid data.");

  try {
    const outcome = await db.transaction(async (tx) => {
      const [before] = await tx
        .select({ stock: products.stock })
        .from(products)
        .where(and(eq(products.id, id), isNull(products.deletedAt)))
        .for("update");
      if (!before) return null;

      // Stock is NOT written directly. The difference is applied through the
      // ledger below, which is the only place allowed to move stock - that way
      // a number typed into the edit form is recorded as a correction instead
      // of appearing from nowhere (or, worse, being checked against a value
      // that was already overwritten).
      const { stock: nextStock, ...rest } = result.data;

      const [product] = await tx
        .update(products)
        .set({ ...rest, updatedAt: new Date() })
        .where(and(eq(products.id, id), isNull(products.deletedAt)))
        .returning();

      const delta = nextStock - before.stock;
      if (delta > 0) {
        await stockIn(tx, {
          productId: id,
          quantity: delta,
          reason: "Stock count correction",
          source: "Listing edited",
          createdBy: admin.id,
        });
      } else if (delta < 0) {
        await stockOut(tx, {
          productId: id,
          quantity: -delta,
          reason: "Stock count correction",
          source: "Listing edited",
          createdBy: admin.id,
        });
      }

      // Re-read so the response carries the stock the ledger just wrote.
      const [fresh] = await tx.select().from(products).where(eq(products.id, id));
      return fresh ?? product;
    });

    if (!outcome) return errorResponse("Product not found.", 404);
    return NextResponse.json({ product: outcome });
  } catch (error) {
    log("product update failed", error);
    throw new ApiError("Could not update product.", 500);
  }
});

export const DELETE = withApi<Params>(async ({ request, params, log }) => {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const id = parseId(params.id);
  if (id === null) return errorResponse("Product not found.", 404);

  try {
    // A product that appears on an order or a review must survive: deleting it
    // used to orphan both. Hide it instead so history and invoices stay intact.
    const [referencedByOrder] = await db
      .select({ id: orderItems.id })
      .from(orderItems)
      .where(eq(orderItems.productId, id))
      .limit(1);
    const [referencedByReview] = await db
      .select({ id: reviews.id })
      .from(reviews)
      .where(eq(reviews.productId, id))
      .limit(1);

    if (referencedByOrder || referencedByReview) {
      const [hidden] = await db
        .update(products)
        .set({ isAvailable: false, deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(products.id, id), isNull(products.deletedAt)))
        .returning();
      if (!hidden) return errorResponse("Product not found.", 404);
      return errorResponse(
        "This product has order history and cannot be deleted. It has been marked unavailable instead.",
        409
      );
    }

    const [deleted] = await db.delete(products).where(eq(products.id, id)).returning({ id: products.id });
    if (!deleted) return errorResponse("Product not found.", 404);
    return NextResponse.json({ message: "Product deleted." });
  } catch (error) {
    log("product delete failed", error);
    throw new ApiError("Could not delete product.", 500);
  }
});
