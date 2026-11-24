// Per-test truncation so every test starts from an empty shop.
import { afterEach, beforeEach } from "vitest";
import { sql } from "drizzle-orm";

// The db module reads DATABASE_URL at import time, so it must be set by global
// setup first; dynamic import keeps that ordering explicit.
async function getDb() {
  const mod = await import("@/db");
  return mod.db;
}

export async function truncateAll() {
  const db = await getDb();
  await db.execute(sql`
    truncate table order_items, reviews, orders, promotions, password_reset_tokens,
                   rate_limits, contact_messages, products, users
    restart identity cascade
  `);
}

beforeEach(async () => {
  await truncateAll();
});
