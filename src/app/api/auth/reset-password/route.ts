// POST /api/auth/reset-password -> consume a reset token and set a new password.
import { NextResponse } from "next/server";
import crypto from "crypto";
import { and, eq, isNull, ne, gt } from "drizzle-orm";
import { db } from "@/db";
import { passwordResetTokens, users } from "@/db/schema";
import { hashPassword, errorResponse } from "@/lib/auth";
import { withApi, readJson, ApiError } from "@/lib/api-handler";
import { passwordWeakness } from "@/lib/validation";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

export const POST = withApi(async ({ request, log }) => {
  const limit = await checkRateLimit(`reset:ip:${clientIp(request)}`, 10, 60 * 60);
  if (!limit.allowed) {
    const response = errorResponse("Too many attempts. Please try again later.", 429);
    response.headers.set("retry-after", String(limit.retryAfter));
    return response;
  }

  const body = await readJson(request);
  const token = String(body.token || "").trim();
  const newPassword = String(body.newPassword || "");
  if (!token) return errorResponse("This reset link is not valid. Please request a new one.");
  if (newPassword.length < 8) return errorResponse("Password must be at least 8 characters.");

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  try {
    type Outcome = { error: string; status: number } | { ok: true };

    const result: Outcome = await db.transaction(async (tx): Promise<Outcome> => {
      const [row] = await tx
        .select()
        .from(passwordResetTokens)
        .where(
          and(
            eq(passwordResetTokens.tokenHash, tokenHash),
            isNull(passwordResetTokens.usedAt),
            gt(passwordResetTokens.expiresAt, new Date())
          )
        )
        .for("update");

      if (!row) return { error: "This reset link has expired or was already used.", status: 400 };

      const [user] = await tx.select().from(users).where(eq(users.id, row.userId));
      if (!user) return { error: "This reset link is not valid. Please request a new one.", status: 400 };

      const weak = passwordWeakness(newPassword, user.email);
      if (weak) return { error: weak, status: 400 };

      await tx.update(users).set({ password: await hashPassword(newPassword), mustChangePassword: false }).where(eq(users.id, user.id));
      await tx.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, row.id));
      // Any other outstanding token for this account stops working too.
      await tx
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(and(eq(passwordResetTokens.userId, user.id), ne(passwordResetTokens.id, row.id), isNull(passwordResetTokens.usedAt)));

      return { ok: true };
    });

    if ("error" in result) return errorResponse(result.error, result.status);
    return NextResponse.json({ message: "Your password has been changed. You can log in now." });
  } catch (error) {
    log("password reset failed", error);
    throw new ApiError("Could not reset your password. Please try again.", 500);
  }
});
