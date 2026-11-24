// POST /api/setup
// Creates the FIRST admin account and a few sample products.
//
// It only works when no admin exists yet, so it is safe to leave in the project -
// but it no longer invents credentials. The old version fell back to
// admin@egghub.rw / Admin1234, which meant a fresh deployment shipped with a
// publicly known admin password printed on the login page.
import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users, products } from "@/db/schema";
import { hashPassword, errorResponse } from "@/lib/auth";
import { withApi, ApiError } from "@/lib/api-handler";

const SAMPLE_PRODUCTS = [
  { name: "Fresh Eggs - 6 Pack", packageSize: 6, price: 900, stock: 40, description: "Half a dozen farm-fresh eggs, perfect for small households." },
  { name: "Fresh Eggs - 10 Pack", packageSize: 10, price: 1500, stock: 35, description: "Ten fresh eggs, ideal for families." },
  { name: "Fresh Eggs - 15 Pack", packageSize: 15, price: 2100, stock: 25, description: "Fifteen fresh quality eggs for weekly use." },
  { name: "Fresh Eggs - 30 Tray", packageSize: 30, price: 3500, stock: 20, description: "A full tray of 30 fresh eggs suitable for home use and restaurants." },
  { name: "Fresh Eggs - 60 Pack", packageSize: 60, price: 6800, stock: 3, description: "Two trays (60 eggs) for restaurants, hotels and events." },
];

const WEAK_PASSWORDS = ["Admin1234", "Demo1234", "password", "changeme", "123456"];

export const POST = withApi(async ({ log }) => {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  // Refuse to run without explicit, non-default credentials.
  if (!email || !password) {
    return errorResponse(
      "Setup is disabled: set ADMIN_EMAIL and ADMIN_PASSWORD in the environment first.",
      500
    );
  }
  if (password.length < 8 || WEAK_PASSWORDS.includes(password)) {
    return errorResponse(
      "Setup is disabled: ADMIN_PASSWORD is too weak. Choose a password of at least 8 characters that is not a well-known demo value.",
      500
    );
  }

  try {
    const result = await db.transaction(async (tx) => {
      // Serialise concurrent setup calls: the first one wins, the rest see an admin.
      await tx.execute(sql`select pg_advisory_xact_lock(421337)`);

      const [existingAdmin] = await tx.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
      if (existingAdmin) return { alreadyDone: true } as const;

      await tx.insert(users).values({
        name: "EggHub Admin",
        email,
        password: await hashPassword(password),
        phone: process.env.ADMIN_PHONE || "0788000000",
        role: "admin",
        mustChangePassword: WEAK_PASSWORDS.includes(password),
      });

      const existingProducts = await tx.select({ id: products.id }).from(products).limit(1);
      if (existingProducts.length === 0) {
        await tx.insert(products).values(SAMPLE_PRODUCTS);
      }

      return { alreadyDone: false } as const;
    });

    if (result.alreadyDone) {
      return NextResponse.json({ message: "Setup already done. An admin account exists." }, { status: 400 });
    }

    return NextResponse.json({
      message: "Setup complete. Admin account and sample products created.",
      adminEmail: email,
    });
  } catch (error) {
    log("setup failed", error);
    throw new ApiError("Setup failed. Please check the server logs.", 500);
  }
});
