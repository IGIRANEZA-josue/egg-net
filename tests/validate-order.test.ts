import { describe, it, expect } from "vitest";
import { readOrderBody } from "@/lib/validate-order";

const delivery = {
  fullName: "Josue I.",
  phone: "0788123456",
  province: "Kigali City",
  district: "Gasabo",
  sector: "Remera",
  address: "KG 123 St",
};

function body(overrides: Record<string, unknown> = {}) {
  return { items: [{ productId: 1, quantity: 2 }], delivery, paymentMethod: "cash", ...overrides };
}

describe("readOrderBody", () => {
  it("accepts a valid order", () => {
    const { data, error } = readOrderBody(body());
    expect(error).toBeUndefined();
    expect(data?.items).toEqual([{ productId: 1, quantity: 2 }]);
    expect(data?.paymentMethod).toBe("cash");
  });

  it("rejects an empty cart", () => {
    expect(readOrderBody(body({ items: [] })).error).toMatch(/empty/i);
  });

  it("rejects unknown payment methods", () => {
    expect(readOrderBody(body({ paymentMethod: "bitcoin" })).error).toMatch(/payment/i);
  });

  it("merges duplicate product lines instead of double-charging stock", () => {
    const { data } = readOrderBody(body({ items: [{ productId: 1, quantity: 2 }, { productId: 1, quantity: 3 }, { productId: 2, quantity: 1 }] }));
    expect(data?.items).toEqual([{ productId: 1, quantity: 5 }, { productId: 2, quantity: 1 }]);
  });

  it("rejects fractional, zero and negative quantities", () => {
    for (const quantity of [0, -1, 1.5, NaN]) {
      expect(readOrderBody(body({ items: [{ productId: 1, quantity }] })).error).toBeTruthy();
    }
  });

  it("rejects absurd quantities", () => {
    expect(readOrderBody(body({ items: [{ productId: 1, quantity: 100000 }] })).error).toMatch(/too large/i);
  });

  it("requires every delivery field", () => {
    for (const field of ["fullName", "phone", "province", "district", "sector", "address"]) {
      const { error } = readOrderBody(body({ delivery: { ...delivery, [field]: "  " } }));
      expect(error).toMatch(new RegExp(field, "i"));
    }
  });

  it("validates the phone number", () => {
    expect(readOrderBody(body({ delivery: { ...delivery, phone: "12345" } })).error).toMatch(/phone/i);
    expect(readOrderBody(body({ delivery: { ...delivery, phone: "+250 788 123 456" } })).error).toBeUndefined();
  });

  it("caps field lengths", () => {
    expect(readOrderBody(body({ delivery: { ...delivery, address: "x".repeat(301) } })).error).toMatch(/too long/i);
  });
});
