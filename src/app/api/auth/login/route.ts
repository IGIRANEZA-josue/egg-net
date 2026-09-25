// POST /api/auth/login  -> works for both admin and customer
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { comparePassword, createToken, errorResponse } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!email || !password) return errorResponse("Email and password are required.");

    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user) return errorResponse("Invalid email or password.", 401);

    const ok = await comparePassword(password, user.password);
    if (!ok) return errorResponse("Invalid email or password.", 401);

    const token = await createToken(user.id, user.role);
    // Never send the password hash to the browser
    const { password: _pw, ...safeUser } = user;
    void _pw;
    return NextResponse.json({ token, user: safeUser });
  } catch {
    return errorResponse("Login failed. Please try again.", 500);
  }
}
