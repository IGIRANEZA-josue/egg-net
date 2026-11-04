// POST /api/auth/register  -> creates a CUSTOMER account (never admin)
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, createToken, errorResponse, withSessionCookie } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { isValidEmail, isValidPhone, tooLong, LIMITS } from "@/lib/validate";

export async function POST(request: Request) {
  if (!rateLimit(`register:${clientIp(request)}`, 10, 60 * 60 * 1000)) {
    return errorResponse("Too many accounts created from this network. Please try again later.", 429);
  }

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return errorResponse("Invalid request body.");

    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const phone = String(body.phone || "").trim();

    if (!name || !email || !password) return errorResponse("Name, email and password are required.");
    if (password.length < 8) return errorResponse("Password must be at least 8 characters.");
    for (const [v, max, label] of [
      [name, LIMITS.name, "Name"],
      [email, LIMITS.email, "Email"],
      [password, LIMITS.password, "Password"],
      [phone, LIMITS.phone, "Phone"],
    ] as const) {
      const err = tooLong(v, max, label);
      if (err) return errorResponse(err);
    }
    if (!isValidEmail(email)) return errorResponse("Please enter a valid email.");
    if (phone && !isValidPhone(phone)) return errorResponse("Please enter a valid phone number (e.g. 078XXXXXXX).");

    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
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
    return withSessionCookie(NextResponse.json({ token, user }, { status: 201 }), token);
  } catch (err) {
    // Unique violation = the email was registered between our check and insert.
    if ((err as { code?: string }).code === "23505") return errorResponse("Email already registered.");
    console.error("POST /api/auth/register failed:", err);
    return errorResponse("Registration failed. Please try again.", 500);
  }
}
