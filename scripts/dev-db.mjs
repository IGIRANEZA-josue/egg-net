// Local development database — starts an embedded PostgreSQL server.
// Usage: npm run db:local   (then use DATABASE_URL from .env)
// Data is stored in .pgdata/ (gitignored). Stop with Ctrl+C.
import EmbeddedPostgres from "embedded-postgres";

const PORT = Number(process.env.PGPORT || 5433);
const DB = process.env.PGDATABASE || "app_db";

const pg = new EmbeddedPostgres({
  databaseDir: ".pgdata",
  user: "postgres",
  password: "postgres",
  port: PORT,
  persistent: true,
});

try {
  await pg.initialise();
} catch {
  // already initialised — reuse the existing data directory
}
await pg.start();
try {
  await pg.createDatabase(DB);
} catch {
  // already exists
}

console.log(`PostgreSQL ready on postgresql://postgres:postgres@127.0.0.1:${PORT}/${DB}`);
console.log("Press Ctrl+C to stop.");

const stop = async () => {
  try { await pg.stop(); } catch {}
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

// keep the process alive
setInterval(() => {}, 1 << 30);
