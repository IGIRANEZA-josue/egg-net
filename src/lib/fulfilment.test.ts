import { describe, expect, it } from "vitest";
import {
  decideFulfilment,
  distanceKm,
  DELIVERY_ORIGIN,
  DELIVERY_RADIUS_KM,
  DELIVERY_FEE,
  PICKUP_HANDLING_FEE,
  PICKUP,
} from "@/lib/fulfilment";

// Real coordinates, so the tests describe the actual delivery run.
const MEREZ = { latitude: -1.9702037, longitude: 30.0771302 };
const GIKONDO = { latitude: -1.9643, longitude: 30.0735 };
const KICUKIRO_CENTRE = { latitude: -1.9785, longitude: 30.101 };
const KIMIRONKO = { latitude: -1.937, longitude: 30.109 };
const HUYE = { latitude: -2.5967, longitude: 29.7394 };

describe("distanceKm", () => {
  it("is zero for the same point", () => {
    expect(distanceKm(DELIVERY_ORIGIN, DELIVERY_ORIGIN)).toBe(0);
  });

  it("is symmetric", () => {
    const a = distanceKm(DELIVERY_ORIGIN, KIMIRONKO);
    const b = distanceKm(KIMIRONKO, DELIVERY_ORIGIN);
    expect(a).toBeCloseTo(b, 10);
  });

  it("puts the pickup point and the Merez station in the same small corridor", () => {
    // The entire premise of the rule: EPR Karugira and Merez are a short ride
    // apart, both in Kigarama sector.
    expect(distanceKm(DELIVERY_ORIGIN, MEREZ)).toBeLessThan(1);
  });

  it("does not understate a long distance", () => {
    // Kigali to Huye is roughly 80 km as the crow flies.
    const km = distanceKm(DELIVERY_ORIGIN, HUYE);
    expect(km).toBeGreaterThan(70);
    expect(km).toBeLessThan(90);
  });
});

describe("decideFulfilment", () => {
  it("delivers inside the radius and charges the delivery fee", () => {
    const result = decideFulfilment(MEREZ);
    expect(result.method).toBe("delivery");
    expect(result.withinRadius).toBe(true);
    expect(result.fee).toBe(DELIVERY_FEE);
    expect(result.message).toMatch(/we deliver there/i);
  });

  it("delivers to a nearby sector centre that is still inside the radius", () => {
    const result = decideFulfilment(KICUKIRO_CENTRE);
    expect(result.method).toBe("delivery");
  });

  it("sends a customer outside the radius to pickup, with the pickup fee", () => {
    const result = decideFulfilment(KIMIRONKO);
    expect(result.method).toBe("pickup");
    expect(result.withinRadius).toBe(false);
    expect(result.fee).toBe(PICKUP_HANDLING_FEE);
    expect(result.message).toContain(PICKUP.name);
    expect(result.distanceKm).toBeGreaterThan(DELIVERY_RADIUS_KM);
  });

  it("treats a far district as pickup", () => {
    expect(decideFulfilment(HUYE).method).toBe("pickup");
  });

  it("treats a missing location as pickup, never as delivery", () => {
    // Fail safe: no coordinates must never grant a free ride into the radius.
    for (const input of [{}, { latitude: null, longitude: null }, { latitude: 1.9, longitude: null }]) {
      const result = decideFulfilment(input);
      expect(result.method).toBe("pickup");
      expect(result.distanceKm).toBeNull();
      expect(result.fee).toBe(PICKUP_HANDLING_FEE);
    }
  });

  it("uses the boundary itself as inside (inclusive)", () => {
    // A point exactly on the edge should still be delivered; the comparison is
    // <=, and this guards against a change to <.
    const edge = decideFulfilment({
      latitude: DELIVERY_ORIGIN.latitude,
      longitude: DELIVERY_ORIGIN.longitude + (DELIVERY_RADIUS_KM / 111.32), // ~km per degree lon at the equator
    });
    expect(edge.method).toBe("delivery");
  });

  it("rounds the reported distance to one decimal", () => {
    const result = decideFulfilment(GIKONDO);
    expect(result.distanceKm).toBe(Math.round(result.distanceKm! * 10) / 10);
  });

  it("feeds a labelled pickup fee only, never the delivery fee", () => {
    const deliveries = [MEREZ, GIKONDO].map(decideFulfilment);
    const pickups = [KIMIRONKO, HUYE].map(decideFulfilment);
    for (const d of deliveries) expect(d.fee).toBe(DELIVERY_FEE);
    for (const p of pickups) expect(p.fee).toBe(PICKUP_HANDLING_FEE);
    expect(PICKUP_HANDLING_FEE).not.toBe(DELIVERY_FEE);
  });
});
