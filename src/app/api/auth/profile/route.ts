// GET /api/auth/profile  -> current logged-in user
// PUT /api/auth/profile  -> update name / phone / address (and optionally password)
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser, hashPassword, errorResponse, comparePassword } from "@/lib/auth";
import { isValidPhone, tooLong, LIMITS } from "@/lib/validate";

export async function GET(request: Request) {
  const user = await requireUser(request);
  if (user instanceof NextResponse) return user;
  return NextResponse.json({ user });
}

export async function PUT(request: Request) {
  const user = await requireUser(request);
  if (user instanceof NextResponse) return user;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return errorResponse("Invalid request body.");

    const name = String(body.name || user.name).trim();
    const phone = String(body.phone ?? user.phone ?? "").trim();
    const address = String(body.address ?? user.address ?? "").trim();
    if (!name) return errorResponse("Name is required.");
    for (const [v, max, label] of [
      [name, LIMITS.name, "Name"],
      [phone, LIMITS.phone, "Phone"],
      [address, LIMITS.address, "Address"],
    ] as const) {
      const err = tooLong(v, max, label);
      if (err) return errorResponse(err);
    }
    if (phone && !isValidPhone(phone)) return errorResponse("Please enter a valid phone number.");

    const updates: { name: string; phone: string; address: string; password?: string } = { name, phone, address };
    if (body.password) {
      const next = String(body.password);
      if (next.length < 8) return errorResponse("Password must be at least 8 characters.");
      if (next.length > LIMITS.password) return errorResponse("Password is too long.");
      // Changing the password requires proving knowledge of the current one.
      const current = String(body.currentPassword || "");
      const [row] = await db.select({ password: users.password }).from(users).where(eq(users.id, user.id));
      if (!row || !(await comparePassword(current, row.password))) {
        return errorResponse("Current password is incorrect.", 403);
      }
      updates.password = await hashPassword(next);
    }

    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, user.id))
      .returning({ id: users.id, name: users.name, email: users.email, phone: users.phone, role: users.role, address: users.address, createdAt: users.createdAt });

    return NextResponse.json({ user: updated });
  } catch (err) {
    console.error("PUT /api/auth/profile failed:", err);
    return errorResponse("Could not update profile.", 500);
  }
}
