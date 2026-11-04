// Shared setup logic: creates the first admin, optional demo customer and
// sample products. Used by POST /api/setup AND `npm run seed`.
import { db } from "@/db";
import { users, products } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { hashPassword } from "@/lib/auth";

export const SAMPLE_PRODUCTS = [
  { name: "Fresh Eggs - 6 Pack", packageSize: 6, price: 900, stock: 40, description: "Half a dozen farm-fresh eggs, perfect for small households." },
  { name: "Fresh Eggs - 10 Pack", packageSize: 10, price: 1500, stock: 35, description: "Ten fresh eggs, ideal for families." },
  { name: "Fresh Eggs - 15 Pack", packageSize: 15, price: 2100, stock: 25, description: "Fifteen fresh quality eggs for weekly use." },
  { name: "Fresh Eggs - 30 Tray", packageSize: 30, price: 3500, stock: 20, description: "A full tray of 30 fresh eggs suitable for home use and restaurants." },
  { name: "Fresh Eggs - 60 Pack", packageSize: 60, price: 6800, stock: 3, description: "Two trays (60 eggs) for restaurants, hotels and events." },
];

export function demoEnabled() {
  return process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_ENABLE_DEMO === "true";
}

export type SetupResult =
  | { ok: true; message: string; adminEmail: string; demoCreated: boolean }
  | { ok: false; message: string; status: number };

export async function runSetup(): Promise<SetupResult> {
  const isProd = process.env.NODE_ENV === "production";
  const email = (process.env.ADMIN_EMAIL || "admin@egghub.rw").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || (isProd ? "" : "Admin1234");

  if (!password || password.length < 8) {
    return {
      ok: false,
      status: 400,
      message: isProd
        ? "Set ADMIN_PASSWORD (min 8 characters) in the environment before running setup."
        : "ADMIN_PASSWORD must be at least 8 characters.",
    };
  }

  const adminHash = await hashPassword(password);
  const demoHash = demoEnabled() ? await hashPassword("Demo1234") : null;

  // One transaction + advisory lock: two simultaneous setup calls can never
  // both create an admin.
  return db.transaction(async (tx): Promise<SetupResult> => {
    await tx.execute(sql`select pg_advisory_xact_lock(72801)`);

    const [existingAdmin] = await tx.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
    if (existingAdmin) {
      return { ok: false, message: "Setup already done. An admin account exists.", status: 400 };
    }

    await tx.insert(users).values({
      name: "EggHub Admin",
      email,
      password: adminHash,
      phone: "0788000000",
      role: "admin",
    });

    let demoCreated = false;
    if (demoHash) {
      const inserted = await tx
        .insert(users)
        .values({
          name: "Demo Customer",
          email: "demo@egghub.rw",
          password: demoHash,
          phone: "0788111111",
          role: "customer",
          address: "KG 123 St, Remera",
        })
        .onConflictDoNothing()
        .returning({ id: users.id });
      demoCreated = inserted.length > 0;
    }

    const existingProducts = await tx.select({ id: products.id }).from(products).limit(1);
    if (existingProducts.length === 0) {
      await tx.insert(products).values(SAMPLE_PRODUCTS);
    }

    return {
      ok: true,
      message: "Setup complete. Admin account and sample products created.",
      adminEmail: email,
      demoCreated,
    };
  });
}
