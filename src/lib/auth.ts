// Authentication helpers used by API routes (like Express "middleware/auth.js").
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

// The signing secret is kept in the database (see src/lib/jwt-secret.ts) so that
// login sessions survive restarts and recreated .env files.
import { getSigningSecret, getVerificationSecrets } from "@/lib/jwt-secret";

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

// Create a token that lasts 7 days
export async function createToken(userId: number, role: string) {
  return jwt.sign({ id: userId, role }, await getSigningSecret(), { expiresIn: "7d" });
}

// Find the login token. It can arrive in three places, so a lost one never
// means a logged-out customer:
//   1. "Authorization: Bearer <token>"  (normal)
//   2. "x-egghub-token: <token>"        (backup header)
//   3. cookie "egghub_token"            (backup when browser storage is cleared)
export function getTokenFromRequest(request: Request): string | null {
  const header = request.headers.get("authorization") || "";
  if (header.startsWith("Bearer ") && header.slice(7)) return header.slice(7);

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
      userId = payload.id;
      break;
    } catch {
      // try the next secret
    }
  }
  if (userId === null) return null;

  // If this database call throws, requireUser below shows a "server" message
  // instead of wrongly telling a logged-in customer to login again.
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
