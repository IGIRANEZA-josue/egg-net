// Drizzle Kit configuration.
//
// The database URL comes from the environment ONLY - it used to be hardcoded to
// `postgresql://postgres:postgres@127.0.0.1:5432/app_db`, which meant changing
// DATABASE_URL had no effect on migrations and CI would silently target
// localhost.
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env and fill it in (see README > Setup). " +
      "drizzle-kit needs it for `db:migrate` and `db:studio`; `db:generate` reads the schema only, but still requires the file to load."
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
