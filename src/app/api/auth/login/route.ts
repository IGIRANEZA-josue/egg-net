// POST /api/auth/login  -> works for both admin and customer
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  comparePassword,
  burnPasswordCompare,
  createToken,
  errorResponse,
  setAuthCookie,
} from "@/lib/auth";
import { withApi, readJson } from "@/lib/api-handler";
import { checkRateLimit, clientIp, pruneRateLimits, resetRateLimit } from "@/lib/rate-limit";

const MAX_ATTEMPTS_PER_ACCOUNT = 5;
const MAX_ATTEMPTS_PER_IP = 20;
const WINDOW_SECONDS = 15 * 60;

export const POST = withApi(async ({ request }) => {
  const body = await readJson(request);
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!email || !password) return errorResponse("Email and password are required.");

  const ip = clientIp(request);

  // Two limits: one that follows the attacker, one that follows the account.
  // Neither response reveals which one tripped.
  const [perAccount, perIp] = await Promise.all([
    checkRateLimit(`login:acct:${email}`, MAX_ATTEMPTS_PER_ACCOUNT, WINDOW_SECONDS),
    checkRateLimit(`login:ip:${ip}`, MAX_ATTEMPTS_PER_IP, WINDOW_SECONDS),
  ]);
  if (!perAccount.allowed || !perIp.allowed) {
    const retryAfter = Math.max(perAccount.retryAfter, perIp.retryAfter);
    const response = errorResponse("Too many attempts. Please try again in a few minutes.", 429);
    response.headers.set("retry-after", String(retryAfter));
    return response;
  }

  const [user] = await db.select().from(users).where(eq(users.email, email));

  if (!user) {
    // Spend the same time as a real compare so the response does not reveal
    // whether the email exists.
    await burnPasswordCompare(password);
    return errorResponse("Invalid email or password.", 401);
  }

  const ok = await comparePassword(password, user.password);
  if (!ok) return errorResponse("Invalid email or password.", 401);

  const token = await createToken(user.id, user.role);
  const { password: _pw, ...safeUser } = user;
  void _pw;

  // A successful login clears the account counter.
  await resetRateLimit(`login:acct:${email}`, WINDOW_SECONDS);
  void pruneRateLimits().catch(() => {
    // opportunistic cleanup only - never fail a login because of it
  });

  // The token is only ever delivered as an HttpOnly cookie: page scripts
  // cannot read it, so an XSS bug cannot exfiltrate a 24h credential.
  return setAuthCookie(NextResponse.json({ user: safeUser }), token);
});
