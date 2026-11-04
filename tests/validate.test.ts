import { describe, it, expect } from "vitest";
import { isValidPhone, isValidEmail, parseId, tooLong } from "@/lib/validate";
import { readProductBody } from "@/lib/validate-product";
import { readPromotionBody } from "@/lib/validate-promotion";
import { rateLimit, _resetRateLimits } from "@/lib/rate-limit";
import { isPaymentMethod, processPayment } from "@/lib/payments";

describe("phone validation", () => {
  it.each(["0788123456", "0728123456", "+250788123456", "250788123456", "0788 123 456", "0788-123-456"])(
    "accepts Rwandan number %s", (p) => expect(isValidPhone(p)).toBe(true)
  );
  it.each(["", "12345", "abcdefghij", "078812345678901234567890"])("rejects %s", (p) =>
    expect(isValidPhone(p)).toBe(false)
  );
  it("accepts international numbers", () => {
    expect(isValidPhone("+31612345678")).toBe(true);
  });
});

describe("email validation", () => {
  it.each(["a@b.co", "josue@example.com", "x.y+z@sub.domain.org"])("accepts %s", (e) =>
    expect(isValidEmail(e)).toBe(true)
  );
  it.each(["", "plain", "a@b", "a b@c.com", "a@b.c"])("rejects %s", (e) =>
    expect(isValidEmail(e)).toBe(false)
  );
});

describe("parseId", () => {
  it("accepts positive integers", () => {
    expect(parseId("42")).toBe(42);
    expect(parseId(7)).toBe(7);
  });
  it.each(["0", "-1", "1.5", "abc", "", undefined])("rejects %s", (v) =>
    expect(parseId(v as string)).toBeNull()
  );
});

describe("tooLong", () => {
  it("flags overlong values only", () => {
    expect(tooLong("abc", 3, "Name")).toBeNull();
    expect(tooLong("abcd", 3, "Name")).toMatch(/Name/);
  });
});

describe("readProductBody", () => {
  const valid = { name: "Eggs 30", price: 3500, packageSize: 30, stock: 10, discount: 0, image: "" };
  it("accepts a valid product", () => {
    expect(readProductBody(valid).data?.price).toBe(3500);
  });
  it("rejects bad prices, stock, discounts and sizes", () => {
    expect(readProductBody({ ...valid, price: -5 }).error).toBeTruthy();
    expect(readProductBody({ ...valid, stock: -1 }).error).toBeTruthy();
    expect(readProductBody({ ...valid, stock: 1.5 }).error).toBeTruthy();
    expect(readProductBody({ ...valid, discount: 101 }).error).toBeTruthy();
    expect(readProductBody({ ...valid, packageSize: 0 }).error).toBeTruthy();
  });
  it("rejects javascript: image URLs", () => {
    expect(readProductBody({ ...valid, image: "javascript:alert(1)" }).error).toMatch(/image/i);
    expect(readProductBody({ ...valid, image: "/api/images/1" }).error).toBeUndefined();
    expect(readProductBody({ ...valid, image: "https://x.com/a.png" }).error).toBeUndefined();
  });
});

describe("readPromotionBody", () => {
  const valid = { name: "Weekend", type: "percentage", value: 10, startDate: "2026-01-01", endDate: "2026-01-05" };
  it("accepts a valid promotion and extends date-only end dates to midnight", () => {
    const { data } = readPromotionBody(valid);
    expect(data?.endDate.getHours()).toBe(23);
    expect(data?.endDate.getMinutes()).toBe(59);
  });
  it("rejects percentages over 100 and reversed dates", () => {
    expect(readPromotionBody({ ...valid, value: 150 }).error).toBeTruthy();
    expect(readPromotionBody({ ...valid, endDate: "2025-12-01" }).error).toBeTruthy();
    expect(readPromotionBody({ ...valid, type: "bogus" }).error).toBeTruthy();
  });
});

describe("rateLimit", () => {
  it("allows up to the limit, then blocks, then resets", () => {
    _resetRateLimits();
    expect(rateLimit("k", 2, 50)).toBe(true);
    expect(rateLimit("k", 2, 50)).toBe(true);
    expect(rateLimit("k", 2, 50)).toBe(false);
    _resetRateLimits();
    expect(rateLimit("k", 2, 50)).toBe(true);
  });
});

describe("payments (mock provider)", () => {
  it("recognises the three methods", () => {
    expect(isPaymentMethod("cash")).toBe(true);
    expect(isPaymentMethod("mobile_money")).toBe(true);
    expect(isPaymentMethod("card")).toBe(true);
    expect(isPaymentMethod("paypal")).toBe(false);
  });
  it("cash stays pending; mock mobile money / card are paid", async () => {
    expect((await processPayment("cash", 1000)).status).toBe("pending");
    expect((await processPayment("mobile_money", 1000)).status).toBe("paid");
    expect((await processPayment("card", 1000)).status).toBe("paid");
  });
});
