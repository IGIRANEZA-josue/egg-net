import { describe, expect, it } from "vitest";
import { readProductBody } from "@/lib/validate-product";
import { readPromotionBody } from "@/lib/validate-promotion";

const validProduct = { name: "Tray", price: 3500, packageSize: 30, stock: 10 };

describe("readProductBody", () => {
  it("accepts a valid product and rounds money", () => {
    const result = readProductBody({ ...validProduct, price: 3500.4 });
    expect(result.error).toBeUndefined();
    expect(result.data?.price).toBe(3500);
  });

  it("rejects negative stock", () => {
    expect(readProductBody({ ...validProduct, stock: -1 }).error).toBeTruthy();
  });

  it("rejects a non-integer package size", () => {
    expect(readProductBody({ ...validProduct, packageSize: 2.5 }).error).toBeTruthy();
  });

  it("rejects a price of zero or less", () => {
    expect(readProductBody({ ...validProduct, price: 0 }).error).toBeTruthy();
    expect(readProductBody({ ...validProduct, price: -5 }).error).toBeTruthy();
  });

  it("rejects a discount outside 0-100", () => {
    expect(readProductBody({ ...validProduct, discount: 101 }).error).toBeTruthy();
    expect(readProductBody({ ...validProduct, discount: -1 }).error).toBeTruthy();
  });

  it("requires a name", () => {
    expect(readProductBody({ ...validProduct, name: "   " }).error).toBeTruthy();
  });
});

describe("readPromotionBody", () => {
  const base = {
    name: "March sale",
    type: "percentage",
    value: 10,
    startDate: "2026-03-01",
    endDate: "2026-03-31",
  };

  it("expands a date-only end date to the end of that day", () => {
    const result = readPromotionBody(base);
    expect(result.error).toBeUndefined();
    const end = result.data!.endDate;
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
  });

  it("rejects a percentage above 100", () => {
    expect(readPromotionBody({ ...base, value: 150 }).error).toBeTruthy();
  });

  it("rejects a fixed discount that is not a whole number", () => {
    expect(readPromotionBody({ ...base, type: "fixed", value: 10.5 }).error).toBeTruthy();
  });

  it("rejects an end date before the start date", () => {
    expect(readPromotionBody({ ...base, startDate: "2026-04-01" }).error).toBeTruthy();
  });

  it("rejects an unknown type", () => {
    expect(readPromotionBody({ ...base, type: "bogus" }).error).toBeTruthy();
  });
});
