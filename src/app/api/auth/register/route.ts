// POST /api/auth/register  -> creates a CUSTOMER account (never admin)
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword, createToken, errorResponse, setAuthCookie } from "@/lib/auth";
import { withApi, readJson, ApiError } from "@/lib/api-handler";
import { registrationSchema, firstIssue, passwordWeakness } from "@/lib/validation";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { isPgError, UNIQUE_VIOLATION } from "@/lib/db-errors";

const MAX_REGISTRATIONS_PER_IP = 5;
const WINDOW_SECONDS = 60 * 60;

export const POST = withApi(async ({ request, log }) => {
  // Account creation is expensive (bcrypt 12) and easy to abuse.
  const limit = await checkRateLimit(`register:ip:${clientIp(request)}`, MAX_REGISTRATIONS_PER_IP, WINDOW_SECONDS);
  if (!limit.allowed) {
    const response = errorResponse("Too many accounts created from this network. Please try again later.", 429);
    response.headers.set("retry-after", String(limit.retryAfter));
    return response;
  }

  const body = await readJson(request);
  const parsed = registrationSchema.safeParse(body);
  if (!parsed.success) return errorResponse(firstIssue(parsed.error));

  const { name, email, password, phone } = parsed.data;
  const normalisedEmail = email.trim().toLowerCase();

  const weak = passwordWeakness(password, normalisedEmail);
  if (weak) return errorResponse(weak);

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, normalisedEmail));
  if (existing) {
    // The old message ("Email already registered.") was a clean enumeration
    // oracle. Log the real reason, tell the caller the same thing either way.
    log("registration rejected: email already in use");
    return errorResponse("Could not create your account. Please check your details.", 409);
  }

  try {
    const [user] = await db
      .insert(users)
      .values({
        name,
        email: normalisedEmail,
        phone,
        password: await hashPassword(password),
        role: "customer", // forced here - the frontend cannot choose it
      })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        phone: users.phone,
        address: users.address,
      });

    const token = await createToken(user.id, user.role);
    return setAuthCookie(NextResponse.json({ user }, { status: 201 }), token);
  } catch (error) {
    // Unique violation from a concurrent registration with the same email.
    if (isPgError(error, UNIQUE_VIOLATION)) {
      return errorResponse("Could not create your account. Please check your details.", 409);
    }
    log("registration failed", error);
    throw new ApiError("Registration failed. Please try again.", 500);
  }
});
