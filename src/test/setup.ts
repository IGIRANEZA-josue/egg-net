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
  const statement = sql`
    truncate table stock_movements, order_items, reviews, orders, promotions,
                   password_reset_tokens, rate_limits, contact_messages, products, users
    restart identity cascade
  `;

  // PGlite multiplexes a single connection. A route that fires a
  // deliberately-unawaited query (login's rate-limit pruning) can still be in
  // flight here and the truncate then dies with "Connection terminated
  // unexpectedly". Retry briefly instead of pretending the test failed.
  for (let attempt = 1; ; attempt++) {
    try {
      await db.execute(statement);
      return;
    } catch (error) {
      if (attempt >= 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, 60 * attempt));
    }
  }
}

beforeEach(async () => {
  await truncateAll();
});
