import { afterEach, describe, expect, it, vi } from "vitest";

// `next build` imports every route to collect page data, which imports @/db.
// If importing that module touches DATABASE_URL, a build without secrets fails -
// which is exactly what broke CI and the Vercel deploy.
describe("@/db import is lazy", () => {
  const original = process.env.DATABASE_URL;

  afterEach(() => {
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
  });

  it("can be imported with DATABASE_URL unset", async () => {
    delete process.env.DATABASE_URL;
    vi.resetModules();
    const mod = await import("@/db");
    expect(mod.db).toBeDefined();
    expect(mod.getPool).toBeTypeOf("function");
  });

  it("still explains what is missing when a query actually needs the database", async () => {
    delete process.env.DATABASE_URL;
    // Drop the pooled connection cached by earlier tests in this process.
    const g = globalThis as typeof globalThis & { __arenaNextJsPostgresqlPool?: unknown };
    const cached = g.__arenaNextJsPostgresqlPool;
    g.__arenaNextJsPostgresqlPool = undefined;
    vi.resetModules();

    try {
      const mod = await import("@/db");
      // The failure is synchronous: resolving `select` is what builds the pool.
      expect(() => mod.db.select()).toThrow(/DATABASE_URL is not set/);
    } finally {
      g.__arenaNextJsPostgresqlPool = cached;
    }
  });
});
