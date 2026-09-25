// GET /api/promotions/active -> public: the current promotion + delivery fee
// The cart page uses this to PREVIEW totals; the real totals are recalculated on checkout.
import { NextResponse } from "next/server";
import { DELIVERY_FEE, getActivePromotion } from "@/lib/pricing";

export async function GET() {
  const promotion = await getActivePromotion();
  return NextResponse.json({ promotion, deliveryFee: DELIVERY_FEE });
}
