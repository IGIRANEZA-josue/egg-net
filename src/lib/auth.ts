// Authentication helpers used by API routes (like Express "middleware/auth.js").
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

import { getSigningSecret, getVerificationSecrets } from "@/lib/jwt-secret";

/** Cookie that carries the session token. HttpOnly: page scripts cannot read it. */
export const AUTH_COOKIE = "egghub_token";
const TOKEN_TTL_SECONDS = 60 * 60 * 24; // 24h
const BCRYPT_COST = 12;
const JWT_ISSUER = "egghub";
const JWT_AUDIENCE = "egghub-web";

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  address: string | null;
  mustChangePassword: boolean;
  createdAt: Date;
};

// Hash a password before saving it
export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, BCRYPT_COST);
}

// Compare a login password with the stored hash
export async function comparePassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

// A hash of a throwaway value. Comparing against it on an unknown email keeps
// the response time of "no such user" indistinguishable from "wrong password".
const DUMMY_HASH = "$2b$12$TkF1MRxk9qfkI1p/BKCfiO2dM6hXe0Yf45oFMlJFgRQoTSpBpk/32";
export async function burnPasswordCompare(plain: string) {
  try {
    await bcrypt.compare(plain, DUMMY_HASH);
  } catch {
    // ignore - this exists only to spend the same time as a real compare
  }
}

// Create a session token
export async function createToken(userId: number, role: string) {
  return jwt.sign({ id: userId, role }, getSigningSecret(), {
    expiresIn: TOKEN_TTL_SECONDS,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

/** Set the session cookie on a response. The token never reaches page scripts. */
export function setAuthCookie<T extends NextResponse>(response: T, token: string): T {
  response.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TOKEN_TTL_SECONDS,
  });
  return response;
}

/** Clear the session cookie. */
export function clearAuthCookie<T extends NextResponse>(response: T): T {
  response.cookies.set(AUTH_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

// Find the login token: the HttpOnly cookie first, then a Bearer header for API
// clients. There used to be a third, custom-header path - it was removed because
// a token accepted from three places is a token that leaks from three places.
export function getTokenFromRequest(request: Request): string | null {
  const cookies = request.headers.get("cookie") || "";
  const match = cookies.match(/(?:^|;\s*)egghub_token=([^;]+)/);
  if (match) return decodeURIComponent(match[1]);

  const header = request.headers.get("authorization") || "";
  if (header.startsWith("Bearer ")) {
    const value = header.slice(7).trim();
    if (value) return value;
  }
  return null;
}

// Return the logged-in user (or null when there is no valid token)
export async function getUserFromRequest(request: Request): Promise<AuthUser | null> {
  const token = getTokenFromRequest(request);
  if (!token) return null;

  let userId: number | null = null;
  for (const secret of getVerificationSecrets()) {
    try {
      const payload = jwt.verify(token, secret, {
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      }) as { id?: number };
      if (typeof payload.id === "number") {
        userId = payload.id;
        break;
      }
    } catch {
      // try the next secret (only meaningful during a rotation)
    }
  }
  if (userId === null) return null;

  // The role is read from the database, never from the token claim: a token
  // issued before a demotion must not keep the old privileges.
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      role: users.role,
      address: users.address,
      mustChangePassword: users.mustChangePassword,
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
