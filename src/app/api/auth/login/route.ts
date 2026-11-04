// POST /api/auth/login  -> works for both admin and customer
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createToken, errorResponse, verifyPasswordOrDummy, withSessionCookie } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { LIMITS } from "@/lib/validate";

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (!rateLimit(`login:${ip}`, 20, 15 * 60 * 1000)) {
    return errorResponse("Too many login attempts. Please wait a few minutes and try again.", 429);
  }

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return errorResponse("Invalid request body.");

    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!email || !password) return errorResponse("Email and password are required.");
    if (email.length > LIMITS.email || password.length > LIMITS.password) {
      return errorResponse("Invalid email or password.", 401);
    }

    const [user] = await db.select().from(users).where(eq(users.email, email));
    // Constant-time-ish: hash comparison runs even when the user does not exist.
    const ok = await verifyPasswordOrDummy(password, user?.password ?? null);
    if (!user || !ok) return errorResponse("Invalid email or password.", 401);

    const token = await createToken(user.id, user.role);
    const { password: _pw, ...safeUser } = user; // never send the hash to the browser
    void _pw;
    return withSessionCookie(NextResponse.json({ token, user: safeUser }), token);
  } catch (err) {
    console.error("POST /api/auth/login failed:", err);
    return errorResponse("Login failed. Please try again.", 500);
  }
}
