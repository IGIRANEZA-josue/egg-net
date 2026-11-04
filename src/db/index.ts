// PostgreSQL connection (node-postgres pool), shared across hot reloads in dev.
//
// Serverless notes (Vercel):
//  - keep the pool small: each lambda opens its own pool
//  - use your provider's POOLED connection string (Neon: "-pooler" host)
//  - remote hosts get SSL automatically; localhost stays plain
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

function needsSsl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const { hostname } = new URL(url);
    return !["localhost", "127.0.0.1", "::1"].includes(hostname);
  } catch {
    return false;
  }
}

const globalForDb = globalThis as typeof globalThis & {
  __eggNetPool?: Pool;
};

export const pool =
  globalForDb.__eggNetPool ??
  new Pool({
    connectionString: databaseUrl,
    max: Number(process.env.PGPOOL_MAX || 5),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    ssl: needsSsl(databaseUrl) ? { rejectUnauthorized: false } : undefined,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__eggNetPool = pool;
}

export const db = drizzle(pool);
