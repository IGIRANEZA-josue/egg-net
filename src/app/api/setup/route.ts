// POST /api/setup
// Creates the FIRST admin account and a few sample products.
// It only works when no admin exists yet, so it is safe to leave in the project.
// Admin credentials come from .env (ADMIN_EMAIL / ADMIN_PASSWORD) with local defaults.
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, products } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "@/lib/auth";

const sampleProducts = [
  { name: "Fresh Eggs - 6 Pack", packageSize: 6, price: 900, stock: 40, description: "Half a dozen farm-fresh eggs, perfect for small households." },
  { name: "Fresh Eggs - 10 Pack", packageSize: 10, price: 1500, stock: 35, description: "Ten fresh eggs, ideal for families." },
  { name: "Fresh Eggs - 15 Pack", packageSize: 15, price: 2100, stock: 25, description: "Fifteen fresh quality eggs for weekly use." },
  { name: "Fresh Eggs - 30 Tray", packageSize: 30, price: 3500, stock: 20, description: "A full tray of 30 fresh eggs suitable for home use and restaurants." },
  { name: "Fresh Eggs - 60 Pack", packageSize: 60, price: 6800, stock: 3, description: "Two trays (60 eggs) for restaurants, hotels and events." },
];

export async function POST() {
  const [existingAdmin] = await db.select().from(users).where(eq(users.role, "admin"));
  if (existingAdmin) {
    return NextResponse.json({ message: "Setup already done. An admin account exists." }, { status: 400 });
  }

  const email = process.env.ADMIN_EMAIL || "admin@egghub.rw";
  const password = process.env.ADMIN_PASSWORD || "Admin1234";

  await db.insert(users).values({
    name: "EggHub Admin",
    email,
    password: await hashPassword(password),
    phone: "0788000000",
    role: "admin",
  });

  const existingProducts = await db.select().from(products);
  if (existingProducts.length === 0) {
    await db.insert(products).values(sampleProducts);
  }

  return NextResponse.json({
    message: "Setup complete. Admin account and sample products created.",
    adminEmail: email,
  });
}
