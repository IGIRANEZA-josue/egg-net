// Idempotent database seed.
//
//   npm run db:migrate && npm run db:seed
//
// Safe to run repeatedly: rows are matched by email / product name and skipped
// when they already exist. No production defaults are baked in - every
// credential comes from the environment and the demo accounts only appear when
// DEMO_MODE is explicitly on.
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, pool } from "./index";
import { products, users } from "./schema";
import { hashPassword } from "../lib/auth";

const SAMPLE_PRODUCTS = [
  { name: "Fresh Eggs - 6 Pack", packageSize: 6, price: 900, stock: 40, description: "Half a dozen farm-fresh eggs, perfect for small households." },
  { name: "Fresh Eggs - 10 Pack", packageSize: 10, price: 1500, stock: 35, description: "Ten fresh eggs, ideal for families." },
  { name: "Fresh Eggs - 15 Pack", packageSize: 15, price: 2100, stock: 25, description: "Fifteen fresh quality eggs for weekly use." },
  { name: "Fresh Eggs - 30 Tray", packageSize: 30, price: 3500, stock: 20, description: "A full tray of 30 fresh eggs suitable for home use and restaurants." },
  { name: "Fresh Eggs - 60 Pack", packageSize: 60, price: 6800, stock: 3, description: "Two trays (60 eggs) for restaurants, hotels and events." },
];

const WEAK_PASSWORDS = ["Admin1234", "Demo1234", "password", "changeme", "123456"];

function fail(message: string): never {
  console.error(`\n  Seed failed: ${message}\n`);
  process.exit(1);
}

async function ensureUser(input: {
  name: string;
  email: string;
  password: string;
  role: "admin" | "customer";
  phone: string;
  mustChangePassword?: boolean;
}) {
  const email = input.email.trim().toLowerCase();
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) {
    console.log(`  = user exists: ${email} (${existing.role})`);
    return existing;
  }
  const [created] = await db
    .insert(users)
    .values({
      name: input.name,
      email,
      phone: input.phone,
      role: input.role,
      password: await hashPassword(input.password),
      mustChangePassword: input.mustChangePassword ?? false,
    })
    .returning();
  console.log(`  + created ${input.role}: ${email}`);
  return created;
}

async function main() {
  // ---- products ----
  const existingProducts = await db.select({ name: products.name }).from(products);
  const known = new Set(existingProducts.map((p) => p.name));
  const missing = SAMPLE_PRODUCTS.filter((p) => !known.has(p.name));
  if (missing.length) {
    await db.insert(products).values(missing);
    console.log(`  + created ${missing.length} sample product(s)`);
  } else {
    console.log("  = sample products already present");
  }

  // ---- admin ----
  // The seed never invents credentials. Either the operator supplies them, or
  // no admin is created and /api/setup (which has the same rule) must be used.
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    if (adminPassword.length < 8) fail("ADMIN_PASSWORD must be at least 8 characters.");
    await ensureUser({
      name: "EggHub Admin",
      email: adminEmail,
      password: adminPassword,
      role: "admin",
      phone: process.env.ADMIN_PHONE || "0788000000",
      mustChangePassword: WEAK_PASSWORDS.includes(adminPassword),
    });
  } else {
    console.log("  ! ADMIN_EMAIL / ADMIN_PASSWORD not set - no admin created (use POST /api/setup)");
  }

  // ---- demo customer (only with DEMO_MODE=true) ----
  if (process.env.DEMO_MODE === "true") {
    const demoEmail = process.env.DEMO_CUSTOMER_EMAIL || "demo@egghub.rw";
    const demoPassword = process.env.DEMO_CUSTOMER_PASSWORD;
    if (!demoPassword) fail("DEMO_MODE=true requires DEMO_CUSTOMER_PASSWORD to be set.");
    await ensureUser({
      name: "Demo Customer",
      email: demoEmail,
      password: demoPassword,
      role: "customer",
      phone: "0788123456",
      mustChangePassword: WEAK_PASSWORDS.includes(demoPassword),
    });
  }

  console.log("\n  Seed complete.\n");
}

main()
  .catch((error) => {
    console.error("\n  Seed failed:", error instanceof Error ? error.message : error, "\n");
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
