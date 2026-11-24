// POST /api/auth/forgot-password -> always 200, never reveals whether an account exists.
//
// Email delivery is out of scope for this project, so the reset link is written
// to the server log. TODO(email): replace the console.log below with your
// provider call (Resend / SES / Mailgun) - everything else already works.
import { NextResponse } from "next/server";
import crypto from "crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { passwordResetTokens, users } from "@/db/schema";
import { withApi, readJson } from "@/lib/api-handler";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

const TOKEN_TTL_MINUTES = 60;

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export const POST = withApi(async ({ request }) => {
  const limit = await checkRateLimit(`forgot:ip:${clientIp(request)}`, 5, 60 * 60);
  if (!limit.allowed) {
    const response = NextResponse.json({ message: "If that email exists, a reset link has been sent." });
    return response;
  }

  const body = await readJson(request);
  const email = String(body.email || "").trim().toLowerCase();

  // Same response for every outcome.
  const generic = NextResponse.json({ message: "If that email exists, a reset link has been sent." });
  if (!email) return generic;

  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) return generic;

  // Only one live token per account: issuing a new link invalidates old ones.
  await db
    .delete(passwordResetTokens)
    .where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)));

  const token = crypto.randomBytes(32).toString("base64url");
  await db.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash: hashToken(token), // only the hash is stored
    expiresAt: new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000),
  });

  const baseUrl = process.env.APP_URL || new URL(request.url).origin;
  const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;

  // TODO(email): send this instead of logging it.
  console.log(`[auth] password reset for ${email}: ${resetUrl}`);

  return generic;
});
