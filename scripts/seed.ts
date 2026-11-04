// Seed script: applies migrations, then creates the first admin (+ optional
// demo customer) and sample products. Safe to re-run: setup refuses to create
// a second admin, and products are only inserted when the table is empty.
//
//   npm run seed
//
// Reads DATABASE_URL / ADMIN_EMAIL / ADMIN_PASSWORD / SETUP_SECRET from .env.
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { runSetup } from "../src/lib/setup";
import { pool } from "../src/db";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env first.");
    process.exit(1);
  }

  console.log("Applying migrations...");
  const migrationPool = new Pool({ connectionString: url, max: 1 });
  await migrate(drizzle(migrationPool), { migrationsFolder: "./drizzle" });
  await migrationPool.end();
  console.log("Migrations applied.");

  const result = await runSetup();
  if (!result.ok) {
    console.log(result.message);
  } else {
    console.log(result.message);
    console.log(`Admin email: ${result.adminEmail}`);
    if (result.demoCreated) console.log("Demo customer: demo@egghub.rw / Demo1234");
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
