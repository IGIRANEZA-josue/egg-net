// Overlap detection for promotions.
//
// `getActivePromotion()` is deterministic (most generous wins), but two active
// promotions covering the same dates still make the shop's behaviour surprising
// for the operator who created them. Rejecting the overlap at write time keeps
// the pricing model simple enough to explain.
import { and, eq, gt, isNull, lt, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { promotions } from "@/db/schema";

type Window = { startDate: Date; endDate: Date; active: boolean; productId?: number | null };

/** Returns the conflicting promotion, or null when the window is free. */
export async function findOverlappingPromotion(window: Window, excludeId: number | null) {
  if (!window.active) return null;

  const conditions = [
    eq(promotions.active, true),
    // standard half-open interval overlap: a.start < b.end AND a.end > b.start
    lt(promotions.startDate, window.endDate),
    gt(promotions.endDate, window.startDate),
  ];
  if (excludeId !== null) conditions.push(ne(promotions.id, excludeId));

  const productScope = window.productId
    ? eq(promotions.productId, window.productId)
    : isNull(promotions.productId);

  const [conflict] = await db
    .select()
    .from(promotions)
    .where(and(...conditions, or(productScope)!))
    .limit(1);

  return conflict ?? null;
}
