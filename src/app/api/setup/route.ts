// POST /api/setup
// Creates the FIRST admin account (+ optional demo customer) and sample
// products. Only works when no admin exists yet.
//
// Protection layers:
//   - one-time: refuses to run when any admin already exists
//   - SETUP_SECRET: when set, callers must send  x-setup-secret: <value>
//   - production requires ADMIN_PASSWORD (min 8 chars) — no default password
//   - rate limited
import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { runSetup } from "@/lib/setup";
import crypto from "crypto";

function secretMatches(provided: string, expected: string) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!rateLimit(`setup:${clientIp(request)}`, 5, 60 * 60 * 1000)) {
    return errorResponse("Too many setup attempts. Please try again later.", 429);
  }

  const required = process.env.SETUP_SECRET;
  if (required && !secretMatches(request.headers.get("x-setup-secret") || "", required)) {
    return errorResponse("Setup is protected. Send the x-setup-secret header.", 403);
  }

  try {
    const result = await runSetup();
    if (!result.ok) return errorResponse(result.message, result.status);
    return NextResponse.json({
      message: result.message,
      adminEmail: result.adminEmail,
      demoCreated: result.demoCreated,
    });
  } catch (err) {
    console.error("POST /api/setup failed:", err);
    return errorResponse("Setup failed. Is the database running and migrated?", 500);
  }
}
