// POST /api/auth/register  -> creates a CUSTOMER account (never admin)
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, createToken, errorResponse } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const phone = String(body.phone || "").trim();

    // Basic validation
    if (!name || !email || !password) return errorResponse("Name, email and password are required.");
    if (password.length < 6) return errorResponse("Password must be at least 6 characters.");
    if (!email.includes("@")) return errorResponse("Please enter a valid email.");

    const [existing] = await db.select().from(users).where(eq(users.email, email));
    if (existing) return errorResponse("Email already registered.");

    const [user] = await db
      .insert(users)
      .values({
        name,
        email,
        phone,
        password: await hashPassword(password),
        role: "customer", // role is forced here - the frontend cannot choose it
      })
      .returning({ id: users.id, name: users.name, email: users.email, role: users.role, phone: users.phone, address: users.address });

    const token = await createToken(user.id, user.role);
    return NextResponse.json({ token, user }, { status: 201 });
  } catch {
    return errorResponse("Registration failed. Please try again.", 500);
  }
}
