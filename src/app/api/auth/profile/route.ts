// GET /api/auth/profile  -> current logged-in user
// PUT /api/auth/profile  -> update name / phone / address (and optionally password)
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser, hashPassword, comparePassword, errorResponse } from "@/lib/auth";
import { withApi, readJson, ApiError } from "@/lib/api-handler";
import { passwordChangeSchema, passwordWeakness, firstIssue } from "@/lib/validation";

export const GET = withApi(async ({ request }) => {
  const user = await requireUser(request);
  if (user instanceof NextResponse) return user;
  return NextResponse.json({ user });
});

export const PUT = withApi(async ({ request, log }) => {
  const user = await requireUser(request);
  if (user instanceof NextResponse) return user;

  const body = await readJson(request);
  const name = String(body.name || user.name).trim();
  const phone = String(body.phone ?? user.phone ?? "").trim();
  const address = String(body.address ?? user.address ?? "").trim();
  if (!name) return errorResponse("Name is required.");
  if (phone.length > 20) return errorResponse("Please enter a valid phone number.");
  if (address.length > 200) return errorResponse("Please use 200 characters or fewer for the address.");

  const updates: { name: string; phone: string; address: string; password?: string; mustChangePassword?: boolean } = {
    name,
    phone,
    address,
  };

  if (body.password) {
    // Changing a password requires the current one. Without this, a stolen
    // session (or an unlocked laptop) silently became a permanent takeover.
    // Default to "" so a missing field yields the friendly message in the
    // schema rather than Zod's "expected string, received undefined".
    const parsed = passwordChangeSchema.safeParse({
      currentPassword: String(body.currentPassword ?? ""),
      newPassword: String(body.password),
    });
    if (!parsed.success) return errorResponse(firstIssue(parsed.error));

    const weak = passwordWeakness(parsed.data.newPassword, user.email);
    if (weak) return errorResponse(weak);

    const [record] = await db.select({ password: users.password }).from(users).where(eq(users.id, user.id));
    if (!record) return errorResponse("Please login to continue.", 401);

    const matches = await comparePassword(parsed.data.currentPassword, record.password);
    if (!matches) return errorResponse("Your current password is incorrect.");

    updates.password = await hashPassword(parsed.data.newPassword);
    updates.mustChangePassword = false;
  }

  try {
    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, user.id))
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        role: users.role,
        address: users.address,
        mustChangePassword: users.mustChangePassword,
        createdAt: users.createdAt,
      });

    return NextResponse.json({ user: updated });
  } catch (error) {
    log("profile update failed", error);
    throw new ApiError("Could not update profile. Please try again.", 500);
  }
});
