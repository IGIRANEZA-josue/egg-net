// POST /api/admin/inventory/stock-out -> remove eggs from inventory
//   { productId, quantity, reason, destination?, note? }
//
// Decreases products.stock and writes a ledger row in one transaction. Stock can
// never go negative: the UPDATE carries `stock >= quantity`, so the guard holds
// even under concurrent requests.
import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { requireAdmin, errorResponse } from "@/lib/auth";
import { withApi, readJson, ApiError } from "@/lib/api-handler";
import { stockOut, StockError } from "@/lib/inventory";

export const POST = withApi(async ({ request, log }) => {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const body = await readJson(request);
  const productId = Number(body.productId);
  const quantity = Number(body.quantity);
  const reason = String(body.reason ?? "").trim();
  const destination = String(body.destination ?? "").trim();
  const note = String(body.note ?? "").trim();

  if (!Number.isInteger(productId) || productId <= 0) return errorResponse("Choose an egg listing.");
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return errorResponse("Quantity removed must be a whole number greater than 0.");
  }
  if (!reason) return errorResponse("Say why the eggs are leaving inventory.");
  // Free text is allowed, but a typo'd reason should not slip through unnoticed.
  if (reason.length > 120) return errorResponse("Keep the reason under 120 characters.");

  try {
    const result = await db.transaction(async (tx) => {
      const [product] = await tx
        .select({ id: products.id, name: products.name, stock: products.stock })
        .from(products)
        .where(and(eq(products.id, productId), isNull(products.deletedAt)))
        .for("update");
      if (!product) throw new StockError("That egg listing no longer exists.");

      const newStock = await stockOut(tx, {
        productId,
        quantity,
        reason,
        source: destination,
        note,
        createdBy: admin.id,
      });
      return { product, newStock };
    });

    return NextResponse.json(
      {
        message: `Removed ${quantity} from ${result.product.name}. ${result.newStock} left.`,
        stock: result.newStock,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof StockError) return errorResponse(error.message, 409);
    log("stock out failed", error);
    throw new ApiError("Could not record that removal. Please try again.", 500);
  }
});
