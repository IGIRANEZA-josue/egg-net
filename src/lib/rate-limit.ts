// Fixed-window rate limiting backed by PostgreSQL.
//
// The counter lives in the database rather than in process memory so that the
// limit survives restarts and is shared across server instances. That matters
// here: the app has no other throttling, so without this a single attacker can
// try passwords as fast as bcrypt allows.
import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { rateLimits } from "@/db/schema";

export type RateLimitResult = {
  allowed: boolean;
  /** Seconds until the window resets. Only meaningful when `allowed` is false. */
  retryAfter: number;
};

/**
 * Count one hit against `key` and report whether the caller is still under
 * `limit` for the current window.
 *
 * Atomic: a single INSERT ... ON CONFLICT ... RETURNING, so two concurrent
 * requests cannot both read a stale count.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);

  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count });

  const count = row?.count ?? 1;
  const resetsAt = windowStart.getTime() + windowMs;

  if (count > limit) {
    const retryAfter = Math.max(1, Math.ceil((resetsAt - now) / 1000));
    // Fail open on 0 seconds so a clock edge cannot lock someone out forever.
    return { allowed: false, retryAfter: Number.isFinite(retryAfter) ? retryAfter : windowSeconds };
  }
  return { allowed: true, retryAfter: 0 };
}

/**
 * Delete expired windows. Called opportunistically - there is no cron in this
 * project - so the table stays small without an extra moving part.
 */
export async function pruneRateLimits() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await db.delete(rateLimits).where(lt(rateLimits.windowStart, cutoff));
}

/** Best-effort caller identity. Respects x-forwarded-for only when configured. */
export function clientIp(request: Request): string {
  if (process.env.TRUST_PROXY === "true") {
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) {
      const first = forwarded.split(",")[0]?.trim();
      if (first) return first;
    }
    const real = request.headers.get("x-real-ip");
    if (real) return real.trim();
  }
  // Direct connections have no readable socket address inside a Request, so use
  // a stable marker. Rate limits still apply per-account below.
  return "direct";
}

/** Clear a key (used after a successful login so a good password resets the counter). */
export async function resetRateLimit(key: string, windowSeconds: number) {
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  await db.delete(rateLimits).where(and(eq(rateLimits.key, key), eq(rateLimits.windowStart, windowStart)));
}
