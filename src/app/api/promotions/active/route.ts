// GET /api/promotions/active -> public: the current promotion + delivery fee
// The cart page uses this to PREVIEW totals; the real totals are recalculated on checkout.
import { NextResponse } from "next/server";
import { DELIVERY_FEE, getActivePromotion } from "@/lib/pricing";
import { errorResponse } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const promotion = await getActivePromotion();
    return NextResponse.json({ promotion, deliveryFee: DELIVERY_FEE });
  } catch (err) {
    console.error("GET /api/promotions/active failed:", err);
    return errorResponse("We could not load promotions. Please try again.", 503);
  }
}
