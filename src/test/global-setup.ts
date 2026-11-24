// Boots an in-process PostgreSQL (PGlite) for the whole test run, applies the
// real migrations from drizzle/, and exports the connection through an env var.
//
// Why PGlite: the sandbox/CI image this was written in has no PostgreSQL server
// and no Docker. PGlite is real Postgres compiled to WASM, so the SQL,
// constraints, transactions and `FOR UPDATE` semantics under test are the same
// ones production runs.
export const PGLITE_HOST = "127.0.0.1";
export const PGLITE_PORT = 55432;

export default async function setup() {
  // Namespace imports: the package is ESM/CJS dual and the named-export
  // interop differs between Node and Vitest's transform.
  // The packages ship dual ESM/CJS builds and Vitest's transform picks the CJS
  // one, where the named exports live under `.default`. Resolve both shapes.
  type SocketCtor = new (options: { db: unknown; port: number; host: string }) => {
    start: () => Promise<void>;
    stop: () => Promise<void>;
  };
  type PGliteCtor = new () => { exec: (sql: string) => Promise<unknown>; close: () => Promise<void> };

  function pick<T>(mod: Record<string, unknown>, name: string): T {
    const direct = mod[name];
    const nested = (mod.default as Record<string, unknown> | undefined)?.[name];
    const value = direct ?? nested;
    if (!value) throw new Error(`Could not resolve ${name} from the package exports.`);
    return value as T;
  }

  const socketModule = (await import("@electric-sql/pglite-socket")) as unknown as Record<string, unknown>;
  const PGliteSocketServer = pick<SocketCtor>(socketModule, "PGLiteSocketServer");
  const pgliteModule = (await import("@electric-sql/pglite")) as unknown as Record<string, unknown>;
  const PGlite = pick<PGliteCtor>(pgliteModule, "PGlite");
  const fs = await import("node:fs");
  const path = await import("node:path");

  const db = new PGlite();
  const server = new PGliteSocketServer({ db, port: PGLITE_PORT, host: PGLITE_HOST });
  await server.start();

  // Apply migrations in filename order - these are the committed files, so the
  // test database is built by exactly the SQL that ships.
  const dir = path.resolve(__dirname, "../../drizzle");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    await db.exec(fs.readFileSync(path.join(dir, file), "utf8"));
  }

  process.env.DATABASE_URL = `postgresql://postgres:postgres@${PGLITE_HOST}:${PGLITE_PORT}/postgres`;
  process.env.JWT_SECRET = "test-secret-that-is-long-enough-for-the-validator-32";
  process.env.PAYMENT_MODE = "mock";
  // PGliteSocketServer multiplexes a single client at a time. One pooled
  // connection keeps the tests honest without fighting the WASM socket layer.
  process.env.DATABASE_POOL_MAX = "1";
  process.env.TRUST_PROXY = "false";

  return async () => {
    await server.stop();
    await db.close();
  };
}
