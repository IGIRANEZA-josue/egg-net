// The inventory ledger.
//
// `products.stock` is the number the shop reads. `stock_movements` explains it:
// every write that changes stock goes through this module, so the two can be
// reconciled. Stock in adds, stock out subtracts, and the subtraction is guarded
// in SQL (`stock >= qty`) rather than by reading first and hoping - the same
// reason /api/orders does it that way.
import { and, eq, sql } from "drizzle-orm";
import type { db as Db } from "@/db";
import { products, stockMovements } from "@/db/schema";

/** Drizzle database or transaction. Both can run these queries. */
type Executor = Pick<typeof Db, "select" | "update" | "insert" | "execute">;

export const STOCK_OUT_REASONS = [
  "Sale",
  "Damaged or broken",
  "Expired",
  "Donated",
  "Stock count correction",
  "Other",
] as const;

export const STOCK_IN_SOURCES = [
  "Farm delivery",
  "Supplier purchase",
  "Returned by customer",
  "Stock count correction",
  "Other",
] as const;

export const PRODUCT_CATEGORIES = ["Chicken eggs", "Duck eggs", "Quail eggs", "Other"] as const;

export class StockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StockError";
  }
}

export type MovementInput = {
  productId: number;
  quantity: number;
  reason: string;
  source?: string;
  note?: string;
  orderId?: number | null;
  createdBy?: number | null;
  /** When the movement happened, if not now (a delivery recorded a day late). */
  createdAt?: Date;
};

/**
 * Add stock and record where it came from.
 * Returns the new stock level.
 */
export async function stockIn(tx: Executor, input: MovementInput): Promise<number> {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new StockError("Quantity received must be a whole number greater than 0.");
  }

  const [updated] = await tx
    .update(products)
    .set({ stock: sql`${products.stock} + ${input.quantity}`, updatedAt: new Date() })
    .where(and(eq(products.id, input.productId), sql`${products.deletedAt} is null`))
    .returning({ stock: products.stock, name: products.name });

  if (!updated) throw new StockError("That egg listing no longer exists.");

  await tx.insert(stockMovements).values({
    direction: "in",
    productId: input.productId,
    quantity: input.quantity,
    reason: input.reason,
    source: input.source ?? "",
    note: input.note ?? "",
    orderId: input.orderId ?? null,
    createdBy: input.createdBy ?? null,
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
  });

  return updated.stock;
}

/**
 * Remove stock and record why. Never lets stock go below zero: the UPDATE
 * itself carries `stock >= qty`, so a concurrent request cannot slip past a
 * check that happened a millisecond earlier.
 * Returns the new stock level.
 */
export async function stockOut(tx: Executor, input: MovementInput): Promise<number> {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new StockError("Quantity removed must be a whole number greater than 0.");
  }

  const [updated] = await tx
    .update(products)
    .set({ stock: sql`${products.stock} - ${input.quantity}`, updatedAt: new Date() })
    .where(
      and(
        eq(products.id, input.productId),
        sql`${products.deletedAt} is null`,
        sql`${products.stock} >= ${input.quantity}`
      )
    )
    .returning({ stock: products.stock, name: products.name });

  if (!updated) {
    // Distinguish "gone" from "not enough" so the admin sees the real problem.
    const [product] = await tx
      .select({ stock: products.stock, name: products.name })
      .from(products)
      .where(eq(products.id, input.productId));
    if (!product) throw new StockError("That egg listing no longer exists.");
    throw new StockError(
      `Only ${product.stock} in stock for ${product.name}; cannot remove ${input.quantity}.`
    );
  }

  await tx.insert(stockMovements).values({
    direction: "out",
    productId: input.productId,
    quantity: input.quantity,
    reason: input.reason,
    source: input.source ?? "",
    note: input.note ?? "",
    orderId: input.orderId ?? null,
    createdBy: input.createdBy ?? null,
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
  });

  return updated.stock;
}

/**
 * One row for every product that has never had a movement, using its current
 * stock as an opening balance. Without this the dashboard's "stock received"
 * would silently ignore stock that existed before the ledger did. Idempotent:
 * a product that already has any movement is left alone.
 */
export async function backfillOpeningBalances(tx: Executor): Promise<number> {
  const result = await tx.execute(sql`
    insert into stock_movements (direction, product_id, quantity, reason, source, note)
    select 'in', p.id, p.stock, 'Opening balance', 'Before inventory tracking',
           'Recorded automatically from the stock already on hand.'
    from products p
    where p.stock > 0
      and p.deleted_at is null
      and not exists (select 1 from stock_movements m where m.product_id = p.id)
    returning id
  `);
  const rows = (result as unknown as { rows?: unknown[] }).rows ?? [];
  return rows.length;
}
