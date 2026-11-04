// Best-effort in-memory rate limiter for sensitive endpoints (login, register,
// setup). On serverless hosts each instance keeps its own counters, so this is
// a speed bump against brute force — not a distributed guarantee. For stronger
// protection put a WAF / Vercel Firewall rule in front of /api/auth/*.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();

  // opportunistic cleanup so the map cannot grow without bound
  if (buckets.size > MAX_BUCKETS) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    if (buckets.size > MAX_BUCKETS) buckets.clear();
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

// Identify the caller for rate limiting (first hop of x-forwarded-for on Vercel).
export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0].trim() : "") || "local";
}

// Test helper
export function _resetRateLimits() {
  buckets.clear();
}
