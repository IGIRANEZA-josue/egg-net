// Pricing rules live on the SERVER so the frontend can never change them.
import { db } from "@/db";
import { promotions } from "@/db/schema";
import { and, eq, lte, gte } from "drizzle-orm";

// Flat delivery fee for now. Multiple delivery zones can be added later.
export const DELIVERY_FEE = 1000;

// Find the currently active store-wide promotion (if any)
export async function getActivePromotion() {
  const now = new Date();
  const rows = await db
    .select()
    .from(promotions)
    .where(
      and(
        eq(promotions.active, true),
        lte(promotions.startDate, now),
        gte(promotions.endDate, now)
      )
    );
  // If several are active, use the first one (keep it simple)
  return rows[0] || null;
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
