// GET /api/promotions/active -> public: the current promotion + delivery fee
// The cart page uses this to PREVIEW totals; the real totals are recalculated on checkout.
import { NextResponse } from "next/server";
import { DELIVERY_FEE, getActivePromotion } from "@/lib/pricing";
import { withApi } from "@/lib/api-handler";

export const GET = withApi(async () => {
  const promotion = await getActivePromotion();
  return NextResponse.json({ promotion, deliveryFee: DELIVERY_FEE });
});
