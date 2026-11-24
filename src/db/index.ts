import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Fail fast and loudly, but ONLY when a connection is actually needed.
//
// The check used to run at module scope, so *importing* this file threw. Next.js
// imports every route while it collects page data during `next build` - so a
// build with no DATABASE_URL set (CI, Vercel preview, a fresh clone) failed even
// though nothing was trying to reach the database. Deferring the throw to the
// first query keeps the clear message and lets the app build without secrets.

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export function getPool(): Pool {
  const existing = globalForDb.__arenaNextJsPostgresqlPool;
  if (existing) return existing;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    // Before this, a missing DATABASE_URL was passed to `pg` as
    // `connectionString: undefined`, so the driver silently fell back to
    // localhost / PG* environment defaults and you debugged a confusing
    // connection error instead of being told the variable is missing.
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and point it at your PostgreSQL database (see README > Setup)."
    );
  }

  const created = new Pool({
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });

  // A pooled connection can drop (network blip, database restart). Without this
  // listener the process dies with an unhandled 'error' event.
  created.on("error", (error) => {
    console.error("[db] idle client error:", error.message);
  });

  globalForDb.__arenaNextJsPostgresqlPool = created;
  return created;
}

/** Kept for callers that want the underlying pool. Creating it is lazy. */
export const pool: Pool = new Proxy({} as Pool, {
  get(_target, property) {
    const real = getPool();
    const value = Reflect.get(real, property, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

type Database = ReturnType<typeof drizzle<typeof schema>>;

let cachedDb: Database | null = null;

/** The Drizzle client, created on first use so importing this file is free. */
export function getDb(): Database {
  if (!cachedDb) cachedDb = drizzle(getPool(), { schema });
  return cachedDb;
}

/**
 * Lazy handle: `db.select(...)`, `db.transaction(...)` and friends all resolve
 * the real client on first property access. Routes keep importing `db` exactly
 * as before.
 */
export const db: Database = new Proxy({} as Database, {
  get(_target, property) {
    const real = getDb();
    const value = Reflect.get(real, property, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
