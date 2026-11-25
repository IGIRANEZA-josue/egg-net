// POST /api/admin/inventory/stock-in -> receive eggs into inventory
//   { productId, quantity, source, receivedOn?, note? }
//
// Increases products.stock and writes a ledger row in one transaction, so the
// number and its explanation can never disagree.
import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { requireAdmin, errorResponse } from "@/lib/auth";
import { withApi, readJson, ApiError } from "@/lib/api-handler";
import { stockIn, StockError } from "@/lib/inventory";

export const POST = withApi(async ({ request, log }) => {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const body = await readJson(request);
  const productId = Number(body.productId);
  const quantity = Number(body.quantity);
  const source = String(body.source ?? "").trim();
  // The reason shown in the ledger defaults to the source ("Farm delivery")
  // because that is what an operator reads first.
  const reason = String(body.reason ?? "").trim() || source || "Stock received";
  const note = String(body.note ?? "").trim();
  // The admin may be recording a delivery that arrived yesterday.
  const receivedOn = String(body.receivedOn ?? "").trim();

  if (!Number.isInteger(productId) || productId <= 0) return errorResponse("Choose an egg listing.");
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return errorResponse("Quantity received must be a whole number greater than 0.");
  }
  if (quantity > 1_000_000) return errorResponse("That quantity looks wrong.");
  if (!source) return errorResponse("Say where the eggs came from.");

  let recordedAt: Date | undefined;
  if (receivedOn) {
    const parsed = new Date(`${receivedOn}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) return errorResponse("That received date is not valid.");
    if (parsed.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
      return errorResponse("The received date cannot be in the future.");
    }
    recordedAt = parsed;
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [product] = await tx
        .select({ id: products.id, name: products.name, stock: products.stock })
        .from(products)
        .where(and(eq(products.id, productId), isNull(products.deletedAt)))
        .for("update");
      if (!product) throw new StockError("That egg listing no longer exists.");

      const newStock = await stockIn(tx, {
        productId,
        quantity,
        reason,
        source,
        note,
        createdBy: admin.id,
        createdAt: recordedAt,
      });
      return { product, newStock };
    });

    return NextResponse.json(
      { message: `Added ${quantity} to ${result.product.name}.`, stock: result.newStock },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof StockError) return errorResponse(error.message, 409);
    log("stock in failed", error);
    throw new ApiError("Could not record that stock. Please try again.", 500);
  }
});
