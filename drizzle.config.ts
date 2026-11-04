// Drizzle Kit configuration — used by db:generate / db:migrate / db:push / db:studio.
// Reads DATABASE_URL from .env (local) or the environment (CI / production).
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5433/app_db",
  },
});
