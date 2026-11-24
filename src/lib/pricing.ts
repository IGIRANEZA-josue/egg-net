// Pricing rules live on the SERVER so the frontend can never change them.
import { and, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { promotions } from "@/db/schema";

// Delivery and pickup fees live in src/lib/fulfilment.ts together with the
// delivery area, so the checkout, the server and the order record all read the
// same numbers. Re-exported here because this is where callers expect pricing.
export { DELIVERY_FEE, PICKUP_HANDLING_FEE } from "@/lib/fulfilment";

/**
 * Either the pool-level `db` or a transaction handle. Pricing reads inside a
 * checkout MUST use the transaction handle: asking the pool for a second
 * connection while the first is held by the transaction can deadlock under load.
 */
type DbExecutor = Pick<typeof db, "select">;

type Promotion = {
  id: number;
  name: string;
  type: string;
  value: number;
  productId: number | null;
};

/**
 * The best currently-active store-wide promotion (if any).
 *
 * Deterministic on purpose: this used to return `rows[0]` from an unordered
 * query, so when two promotions overlapped the discount could change between
 * requests. The most generous promotion wins; ties break on newest.
 */
export async function getActivePromotion(executor: DbExecutor = db): Promise<Promotion | null> {
  const now = new Date();
  const rows = await executor
    .select()
    .from(promotions)
    .where(
      and(
        eq(promotions.active, true),
        isNull(promotions.productId), // store-wide only
        lte(promotions.startDate, now),
        gte(promotions.endDate, now)
      )
    )
    .orderBy(desc(promotions.value), desc(promotions.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

/** Product-scoped promotions, keyed by product id. Most generous wins. */
export async function getProductPromotions(
  productIds: number[],
  executor: DbExecutor = db
): Promise<Map<number, Promotion>> {
  const map = new Map<number, Promotion>();
  if (productIds.length === 0) return map;

  const now = new Date();
  const rows = await executor
    .select()
    .from(promotions)
    .where(
      and(
        eq(promotions.active, true),
        lte(promotions.startDate, now),
        gte(promotions.endDate, now)
      )
    )
    .orderBy(desc(promotions.value), desc(promotions.createdAt));

  for (const row of rows) {
    if (row.productId && productIds.includes(row.productId) && !map.has(row.productId)) {
      map.set(row.productId, row);
    }
  }
  return map;
}

// Calculate the discount amount for a given subtotal
export function calculateDiscount(
  subtotal: number,
  promotion: { type: string; value: number } | null
) {
  if (!promotion || subtotal <= 0) return 0;
  if (promotion.type === "percentage") {
    return Math.round((subtotal * promotion.value) / 100);
  }
  // fixed discount can never be bigger than the subtotal
  return Math.min(promotion.value, subtotal);
}

// Price of one product after its own product-level % discount
export function effectivePrice(price: number, discountPercent: number) {
  if (!discountPercent) return price;
  return Math.round(price - (price * discountPercent) / 100);
}
