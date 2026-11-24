// GET /api/promotions/active -> public: the current promotion + the fees
// The cart and checkout pages use this to PREVIEW totals; the real totals are
// recalculated on checkout, and the delivery decision is made there again.
import { NextResponse } from "next/server";
import { getActivePromotion } from "@/lib/pricing";
import {
  DELIVERY_FEE,
  PICKUP_HANDLING_FEE,
  DELIVERY_RADIUS_KM,
  DELIVERY_ORIGIN,
  PICKUP,
} from "@/lib/fulfilment";
import { withApi } from "@/lib/api-handler";

export const GET = withApi(async ({ request }) => {
  const promotion = await getActivePromotion();
  const lat = Number(new URL(request.url).searchParams.get("lat"));
  const lon = Number(new URL(request.url).searchParams.get("lon"));
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lon);

  return NextResponse.json({
    promotion,
    deliveryFee: DELIVERY_FEE,
    pickupFee: PICKUP_HANDLING_FEE,
    deliveryRadiusKm: DELIVERY_RADIUS_KM,
    deliveryOrigin: { name: DELIVERY_ORIGIN.name, latitude: DELIVERY_ORIGIN.latitude, longitude: DELIVERY_ORIGIN.longitude },
    pickup: PICKUP,
    // Echoed so a caller can see the zone without duplicating the rule.
    hasCoords,
  });
});
