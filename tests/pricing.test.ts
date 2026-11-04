import { describe, it, expect } from "vitest";
import { calculateDiscount, effectivePrice, DELIVERY_FEE } from "@/lib/pricing";
import { previewDiscount } from "@/lib/client/cart";

describe("effectivePrice (product-level % discount)", () => {
  it("returns the base price when there is no discount", () => {
    expect(effectivePrice(3500, 0)).toBe(3500);
  });
  it("applies the percentage and rounds to whole RWF", () => {
    expect(effectivePrice(3500, 10)).toBe(3150);
    expect(effectivePrice(999, 15)).toBe(849); // 849.15 -> 849
  });
  it("100% discount means free", () => {
    expect(effectivePrice(3500, 100)).toBe(0);
  });
});

describe("calculateDiscount (store-wide promotion)", () => {
  it("no promotion -> no discount", () => {
    expect(calculateDiscount(5000, null)).toBe(0);
  });
  it("percentage promotion", () => {
    expect(calculateDiscount(5000, { type: "percentage", value: 10 })).toBe(500);
  });
  it("fixed promotion", () => {
    expect(calculateDiscount(5000, { type: "fixed", value: 800 })).toBe(800);
  });
  it("fixed discount can never exceed the subtotal", () => {
    expect(calculateDiscount(500, { type: "fixed", value: 800 })).toBe(500);
  });
  it("zero subtotal -> zero discount", () => {
    expect(calculateDiscount(0, { type: "percentage", value: 10 })).toBe(0);
  });
  it("browser preview matches the server rule exactly", () => {
    for (const promo of [null, { type: "percentage", value: 12 }, { type: "fixed", value: 900 }]) {
      for (const subtotal of [0, 1, 999, 3500, 123456]) {
        expect(previewDiscount(subtotal, promo)).toBe(calculateDiscount(subtotal, promo));
      }
    }
  });
});

describe("delivery fee", () => {
  it("is a positive flat fee", () => {
    expect(DELIVERY_FEE).toBeGreaterThan(0);
  });
});
