import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { users, products } from "@/db/schema";

// Smoke test for the harness itself: proves migrations ran and the socket
// connection works through the real `pg` driver.
describe("test database", () => {
  it("has the migrated tables", async () => {
    const rows = await db.select().from(users);
    expect(rows).toEqual([]);
  });

  it("applies foreign keys", async () => {
    await expect(
      db.insert(products).values({ name: "x", price: -1, packageSize: 1, stock: 0 })
    ).resolves.toBeTruthy();
  });
});
