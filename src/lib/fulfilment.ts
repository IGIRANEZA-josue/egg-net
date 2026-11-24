// WHERE WE DELIVER, AND WHERE CUSTOMERS COLLECT INSTEAD.
//
// This file is the single source of truth. It is imported by the checkout page
// AND by POST /api/orders, so the rule the customer sees is the rule the server
// enforces. Changing the delivery area means editing the list below - nothing
// else in the codebase hard-codes a district or a sector name.

/** Where customers collect an order that we cannot deliver. */
export const PICKUP = {
  name: "EPR Karugira",
  shortName: "EPR Karugira",
  sector: "Kigarama",
  cell: "Karugira",
  district: "Kicukiro",
  province: "Kigali City",
  directions:
    "Kicukiro, Kigarama sector, Karugira cell - at EPR Karugira (E.P. Karugira). Ask for EggHub at the gate.",
  hours: "Monday to Saturday, 8:00 - 18:00",
  phone: "+250 788 000 000",
} as const;

/** Where the delivery run starts. Every distance below is measured from here. */
export const DELIVERY_ORIGIN = {
  name: PICKUP.name,
  /** EPR Karugira and Merez are both in Kigarama sector, Gikondo. */
  latitude: -1.9702,
  longitude: 30.0771,
} as const;

/**
 * How far we deliver, in kilometres, as the crow flies from DELIVERY_ORIGIN.
 *
 * The run is EPR Karugira to the station Merez - both in Kigarama sector,
 * Gikondo - so this is deliberately small. Generous inside the corridor so a
 * GPS reading taken a street away does not lock someone out of delivery.
 */
export const DELIVERY_RADIUS_KM = 3.5;

/** Charge added to a pickup order (delivery fee is 0 for pickup). */
export const PICKUP_HANDLING_FEE = 500;

/** Delivery fee inside the radius. */
export const DELIVERY_FEE = 1000;

export type FulfilmentMethod = "delivery" | "pickup";

/**
 * Straight-line distance in kilometres between two coordinates.
 *
 * Haversine, not a flat approximation: Rwanda sits close to the equator, so the
 * simple square-root version would understate the distance and let people
 * outside the area slip through.
 */
export function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const EARTH_KM = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type FulfilmentInput = {
  latitude?: number | null;
  longitude?: number | null;
};

export type FulfilmentDecision = {
  method: FulfilmentMethod;
  /** Null when the coordinates are missing. */
  distanceKm: number | null;
  withinRadius: boolean;
  /** What to charge for this choice. */
  fee: number;
  /** One sentence to show the customer verbatim. */
  message: string;
};

/**
 * Decide, from the customer's coordinates, whether we deliver or they collect.
 *
 * Called on the client for the live checkout message and on the server for the
 * fee and the stored order, so the two can never disagree.
 */
export function decideFulfilment(input: FulfilmentInput): FulfilmentDecision {
  const hasCoords = typeof input.latitude === "number" && typeof input.longitude === "number";

  if (!hasCoords) {
    return {
      method: "pickup",
      distanceKm: null,
      withinRadius: false,
      fee: PICKUP_HANDLING_FEE,
      message: `We could not confirm your location, so this order is for collection at ${PICKUP.name}.`,
    };
  }

  const km = distanceKm(DELIVERY_ORIGIN, {
    latitude: input.latitude as number,
    longitude: input.longitude as number,
  });
  const rounded = Math.round(km * 10) / 10;

  if (km <= DELIVERY_RADIUS_KM) {
    return {
      method: "delivery",
      distanceKm: rounded,
      withinRadius: true,
      fee: DELIVERY_FEE,
      message: `You are ${rounded} km from ${DELIVERY_ORIGIN.name} - we deliver there.`,
    };
  }

  return {
    method: "pickup",
    distanceKm: rounded,
    withinRadius: false,
    fee: PICKUP_HANDLING_FEE,
    message:
      `You are ${rounded} km away. We deliver up to ${DELIVERY_RADIUS_KM} km from ${DELIVERY_ORIGIN.name}, `
      + `so this order is for collection at ${PICKUP.name} (${PICKUP.sector}, ${PICKUP.district}).`,
  };
}

/** Human label for an order in the database. */
export const FULFILMENT_LABEL: Record<FulfilmentMethod, string> = {
  delivery: "Delivery",
  pickup: "Pickup",
};
