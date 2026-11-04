// Authentication helpers used by API routes (like Express "middleware/auth.js").
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSigningSecret, getVerificationSecrets } from "@/lib/jwt-secret";

export const TOKEN_COOKIE = "egghub_token";
export const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  address: string | null;
  createdAt: Date;
};

// Hash a password before saving it
export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 10);
}

// Compare a login password with the stored hash
export async function comparePassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

// A fixed dummy hash so "user not found" and "wrong password" take the same
// time (prevents timing-based account enumeration).
const DUMMY_HASH = "$2b$10$CwTycUXWue0Thq9StjUM0uJ8ZbXb6EqKDz.8Yw1uM0QqZ5l5k5KZ2";

export async function verifyPasswordOrDummy(plain: string, hash: string | null) {
  if (!hash) {
    await bcrypt.compare(plain, DUMMY_HASH);
    return false;
  }
  return bcrypt.compare(plain, hash);
}

// Create a token that lasts 7 days
export async function createToken(userId: number, role: string) {
  return jwt.sign({ id: userId, role }, await getSigningSecret(), {
    expiresIn: TOKEN_TTL_SECONDS,
  });
}

// Attach the session cookie to a login/register response. HttpOnly means
// browser JavaScript cannot read it (XSS protection); the client ALSO keeps
// the token in localStorage as a Bearer fallback for embedded previews where
// cookies may be blocked.
export function withSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TOKEN_TTL_SECONDS,
  });
  return response;
}

export function withClearedSessionCookie(response: NextResponse) {
  response.cookies.set(TOKEN_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}

// Find the login token: Authorization header, backup header, or cookie.
export function getTokenFromRequest(request: Request): string | null {
  const header = request.headers.get("authorization") || "";
  if (header.startsWith("Bearer ") && header.slice(7).trim()) return header.slice(7).trim();

  const custom = request.headers.get("x-egghub-token");
  if (custom) return custom;

  const cookies = request.headers.get("cookie") || "";
  const match = cookies.match(/(?:^|;\s*)egghub_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

// Return the logged-in user (or null when there is no valid token)
export async function getUserFromRequest(request: Request): Promise<AuthUser | null> {
  const token = getTokenFromRequest(request);
  if (!token) return null;

  let userId: number | null = null;
  for (const secret of await getVerificationSecrets()) {
    try {
      const payload = jwt.verify(token, secret) as { id: number };
      if (Number.isInteger(payload.id)) {
        userId = payload.id;
        break;
      }
    } catch {
      // try the next secret
    }
  }
  if (userId === null) return null;

  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      role: users.role,
      address: users.address,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId));
  return user || null;
}

// Small helpers to send JSON error responses
export function errorResponse(message: string, status = 400) {
  return NextResponse.json({ message }, { status });
}

// Use inside a route: `const user = await requireUser(request); if (user instanceof NextResponse) return user;`
export async function requireUser(request: Request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return errorResponse("Please login to continue.", 401);
    return user;
  } catch {
    // database problem: never tell a logged-in customer to login again
    return errorResponse("We could not reach the server. Please try again.", 503);
  }
}

export async function requireAdmin(request: Request) {
  const user = await requireUser(request);
  if (user instanceof NextResponse) return user;
  if (user.role !== "admin") return errorResponse("Admin access only.", 403);
  return user;
}
