import { describe, expect, it } from "vitest";
import { calculateDiscount, effectivePrice, DELIVERY_FEE } from "@/lib/pricing";

describe("calculateDiscount", () => {
  it("rounds a percentage discount to whole RWF", () => {
    expect(calculateDiscount(1500, { type: "percentage", value: 10 })).toBe(150);
    expect(calculateDiscount(999, { type: "percentage", value: 10 })).toBe(100); // 99.9 -> 100
    expect(calculateDiscount(1505, { type: "percentage", value: 15 })).toBe(226); // 225.75 -> 226
  });

  it("never applies a fixed discount bigger than the subtotal", () => {
    expect(calculateDiscount(700, { type: "fixed", value: 1000 })).toBe(700);
    expect(calculateDiscount(5000, { type: "fixed", value: 1000 })).toBe(1000);
  });

  it("returns 0 for no promotion or no subtotal", () => {
    expect(calculateDiscount(1500, null)).toBe(0);
    expect(calculateDiscount(0, { type: "percentage", value: 10 })).toBe(0);
    expect(calculateDiscount(-100, { type: "percentage", value: 10 })).toBe(0);
  });

  it("lets a 100% percentage discount cover the whole subtotal", () => {
    expect(calculateDiscount(2500, { type: "percentage", value: 100 })).toBe(2500);
  });

  it("always produces a whole number of RWF", () => {
    for (const subtotal of [1, 7, 333, 1999, 123_457]) {
      const value = calculateDiscount(subtotal, { type: "percentage", value: 33 });
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});

describe("effectivePrice", () => {
  it("returns the original price when there is no discount", () => {
    expect(effectivePrice(1500, 0)).toBe(1500);
    expect(effectivePrice(1500, undefined as unknown as number)).toBe(1500);
  });

  it("applies a percentage discount and rounds", () => {
    expect(effectivePrice(1500, 10)).toBe(1350);
    expect(effectivePrice(999, 10)).toBe(899); // 899.1 -> 899
  });
});

describe("DELIVERY_FEE", () => {
  it("is the documented flat fee", () => {
    expect(DELIVERY_FEE).toBe(1000);
  });
});
