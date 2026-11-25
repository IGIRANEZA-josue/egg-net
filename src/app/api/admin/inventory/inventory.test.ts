import { describe, expect, it } from "vitest";
import { GET as listLedger } from "./route";
import { POST as stockInRoute } from "./stock-in/route";
import { POST as stockOutRoute } from "./stock-out/route";
import { db } from "@/db";
import { stockMovements } from "@/db/schema";
import { makeUser, makeProduct, authedRequest, readJson, stockOf } from "@/test/helpers";

const url = (path = "") => `http://localhost/api/admin/inventory${path}`;

// withApi handlers take the Request directly (see api-handler.ts), no wrapper.
async function receive(user: { id: number; role: string }, body: Record<string, unknown>) {
  return stockInRoute(await authedRequest(user, url("/stock-in"), { method: "POST", body }));
}

async function remove(user: { id: number; role: string }, body: Record<string, unknown>) {
  return stockOutRoute(await authedRequest(user, url("/stock-out"), { method: "POST", body }));
}

describe("stock in", () => {
  it("increases the stock and writes a ledger row", async () => {
    const admin = await makeUser({ role: "admin" });
    const product = await makeProduct({ stock: 10 });

    const res = await receive(admin, { productId: product.id, quantity: 40, source: "Farm delivery" });
    expect(res.status).toBe(201);
    expect(await stockOf(product.id)).toBe(50);

    const movements = await db.select().from(stockMovements);
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      direction: "in",
      quantity: 40,
      reason: "Farm delivery",
      productId: product.id,
      createdBy: admin.id,
    });
  });

  it("refuses a zero, negative or fractional quantity", async () => {
    const admin = await makeUser({ role: "admin" });
    const product = await makeProduct({ stock: 5 });

    for (const quantity of [0, -3, 2.5]) {
      const res = await receive(admin, { productId: product.id, quantity, source: "Farm delivery" });
      expect(res.status).toBe(400);
    }
    expect(await stockOf(product.id)).toBe(5);
    expect(await db.select().from(stockMovements)).toHaveLength(0);
  });

  it("requires a source", async () => {
    const admin = await makeUser({ role: "admin" });
    const product = await makeProduct({ stock: 5 });
    const res = await receive(admin, { productId: product.id, quantity: 3, source: "" });
    expect(res.status).toBe(400);
    expect(await stockOf(product.id)).toBe(5);
  });

  it("is admin-only", async () => {
    const customer = await makeUser();
    const product = await makeProduct({ stock: 5 });
    const res = await receive(customer, { productId: product.id, quantity: 3, source: "Farm delivery" });
    expect(res.status).toBe(403);
    expect(await stockOf(product.id)).toBe(5);
  });

  it("dates a delivery that is recorded late", async () => {
    const admin = await makeUser({ role: "admin" });
    const product = await makeProduct({ stock: 0 });
    await receive(admin, {
      productId: product.id,
      quantity: 12,
      source: "Farm delivery",
      receivedOn: "2026-01-15",
    });
    const [row] = await db.select().from(stockMovements);
    expect(new Date(row.createdAt).toISOString().slice(0, 10)).toBe("2026-01-15");
  });
});

describe("stock out", () => {
  it("decreases the stock and writes a ledger row", async () => {
    const admin = await makeUser({ role: "admin" });
    const product = await makeProduct({ stock: 20 });

    const res = await remove(admin, { productId: product.id, quantity: 8, reason: "Damaged or broken" });
    expect(res.status).toBe(201);
    expect(await stockOf(product.id)).toBe(12);

    const [row] = await db.select().from(stockMovements);
    expect(row).toMatchObject({ direction: "out", quantity: 8, reason: "Damaged or broken" });
  });

  it("never lets stock go negative", async () => {
    const admin = await makeUser({ role: "admin" });
    const product = await makeProduct({ stock: 5 });

    const res = await remove(admin, { productId: product.id, quantity: 6, reason: "Damaged or broken" });
    expect(res.status).toBe(409);
    expect(await stockOf(product.id)).toBe(5);
    // Nothing was recorded, because nothing moved. A ledger row for a change
    // that did not happen would make the history lie.
    expect(await db.select().from(stockMovements)).toHaveLength(0);
  });

  it("allows removing exactly the remaining stock", async () => {
    const admin = await makeUser({ role: "admin" });
    const product = await makeProduct({ stock: 7 });
    const res = await remove(admin, { productId: product.id, quantity: 7, reason: "Expired" });
    expect(res.status).toBe(201);
    expect(await stockOf(product.id)).toBe(0);
  });

  it("requires a reason", async () => {
    const admin = await makeUser({ role: "admin" });
    const product = await makeProduct({ stock: 4 });
    const res = await remove(admin, { productId: product.id, quantity: 1, reason: "  " });
    expect(res.status).toBe(400);
    expect(await stockOf(product.id)).toBe(4);
  });

  it("is admin-only", async () => {
    const customer = await makeUser();
    const product = await makeProduct({ stock: 9 });
    const res = await remove(customer, { productId: product.id, quantity: 2, reason: "Sale" });
    expect(res.status).toBe(403);
    expect(await stockOf(product.id)).toBe(9);
  });
});

describe("the ledger", () => {
  it("lists movements newest first with the product name", async () => {
    const admin = await makeUser({ role: "admin" });
    const product = await makeProduct({ name: "Duck eggs - 12", stock: 0 });

    await receive(admin, { productId: product.id, quantity: 30, source: "Farm delivery" });
    await remove(admin, { productId: product.id, quantity: 4, reason: "Damaged or broken" });

    const res = await listLedger(await authedRequest(admin, url()));
    expect(res.status).toBe(200);
    const body = await readJson<{
      movements: { productName: string; direction: string; quantity: number }[];
      totals: { totalIn: number; totalOut: number; onHand: number };
    }>(res);

    expect(body.movements).toHaveLength(2);
    expect(body.movements[0].direction).toBe("out");
    expect(body.movements[0].productName).toBe("Duck eggs - 12");
    expect(body.totals).toMatchObject({ totalIn: 30, totalOut: 4, onHand: 26 });
  });

  it("filters by direction and searches reasons", async () => {
    const admin = await makeUser({ role: "admin" });
    const product = await makeProduct({ stock: 0 });
    await receive(admin, { productId: product.id, quantity: 10, source: "Farm delivery" });
    await remove(admin, { productId: product.id, quantity: 2, reason: "Expired" });

    const inbound = await listLedger(await authedRequest(admin, url("?direction=in")));
    const inboundBody = await readJson<{ movements: unknown[] }>(inbound);
    expect(inboundBody.movements).toHaveLength(1);

    const expired = await listLedger(await authedRequest(admin, url("?search=Expired")));
    const expiredBody = await readJson<{ movements: { reason: string }[] }>(expired);
    expect(expiredBody.movements).toHaveLength(1);
    expect(expiredBody.movements[0].reason).toBe("Expired");
  });

  it("is admin-only", async () => {
    const customer = await makeUser();
    const res = await listLedger(await authedRequest(customer, url()));
    expect(res.status).toBe(403);
  });
});
