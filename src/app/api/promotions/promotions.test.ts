import { describe, expect, it } from "vitest";
import { getActivePromotion } from "@/lib/pricing";
import { POST as createPromotion } from "@/app/api/promotions/route";
import { makeUser, authedRequest } from "@/test/helpers";

function promotion(overrides: Record<string, unknown> = {}) {
  const today = new Date();
  const start = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const end = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  return {
    name: "Test promotion",
    type: "percentage",
    value: 10,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    active: true,
    ...overrides,
  };
}

describe("getActivePromotion", () => {
  it("is deterministic when several promotions are active", async () => {
    const admin = await makeUser({ role: "admin" });
    await createPromotion(
      await authedRequest(admin, "http://localhost/api/promotions", { method: "POST", body: promotion({ name: "Small", value: 5 }) })
    );

    // The overlap guard makes a second active promotion impossible through the
    // API, so write it directly to prove the ordering rule still holds.
    const { db } = await import("@/db");
    const { promotions } = await import("@/db/schema");
    const now = new Date();
    await db.insert(promotions).values([
      { name: "Big", type: "percentage", value: 25, startDate: new Date(now.getTime() - 1000), endDate: new Date(now.getTime() + 100000), active: true },
      { name: "Medium", type: "percentage", value: 15, startDate: new Date(now.getTime() - 1000), endDate: new Date(now.getTime() + 100000), active: true },
    ]);

    for (let i = 0; i < 20; i++) {
      const active = await getActivePromotion();
      expect(active?.name).toBe("Big"); // most generous wins
    }
  });

  it("ignores inactive and out-of-range promotions", async () => {
    const { db } = await import("@/db");
    const { promotions } = await import("@/db/schema");
    const now = new Date();
    await db.insert(promotions).values([
      { name: "Off", type: "percentage", value: 50, startDate: new Date(now.getTime() - 1000), endDate: new Date(now.getTime() + 100000), active: false },
      { name: "Future", type: "percentage", value: 40, startDate: new Date(now.getTime() + 100000), endDate: new Date(now.getTime() + 200000), active: true },
      { name: "Past", type: "percentage", value: 30, startDate: new Date(now.getTime() - 200000), endDate: new Date(now.getTime() - 100000), active: true },
    ]);
    expect(await getActivePromotion()).toBeNull();
  });
});

describe("POST /api/promotions", () => {
  it("refuses a second active promotion that overlaps an existing one", async () => {
    const admin = await makeUser({ role: "admin" });
    const url = "http://localhost/api/promotions";

    const first = await createPromotion(
      await authedRequest(admin, url, { method: "POST", body: promotion({ name: "March sale" }) })
    );
    expect(first.status).toBe(201);

    const second = await createPromotion(
      await authedRequest(admin, url, { method: "POST", body: promotion({ name: "April sale" }) })
    );
    expect(second.status).toBe(409);
    expect((await second.json()).message).toMatch(/already active/i);
  });

  it("allows a non-overlapping promotion", async () => {
    const admin = await makeUser({ role: "admin" });
    const url = "http://localhost/api/promotions";

    await createPromotion(await authedRequest(admin, url, { method: "POST", body: promotion({ name: "Now" }) }));

    const later = {
      ...promotion({ name: "Later" }),
      startDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
    };
    const response = await createPromotion(await authedRequest(admin, url, { method: "POST", body: later }));
    expect(response.status).toBe(201);
  });

  it("rejects a percentage above 100", async () => {
    const admin = await makeUser({ role: "admin" });
    const response = await createPromotion(
      await authedRequest(admin, "http://localhost/api/promotions", {
        method: "POST",
        body: promotion({ value: 150 }),
      })
    );
    expect(response.status).toBe(400);
  });

  it("is admin only", async () => {
    const customer = await makeUser({ role: "customer" });
    const response = await createPromotion(
      await authedRequest(customer, "http://localhost/api/promotions", { method: "POST", body: promotion() })
    );
    expect(response.status).toBe(403);
  });
});
