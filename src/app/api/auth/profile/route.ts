// GET /api/auth/profile  -> current logged-in user
// PUT /api/auth/profile  -> update name / phone / address (and optionally password)
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser, hashPassword, errorResponse } from "@/lib/auth";

export async function GET(request: Request) {
  const user = await requireUser(request);
  if (user instanceof NextResponse) return user;
  return NextResponse.json({ user });
}

export async function PUT(request: Request) {
  const user = await requireUser(request);
  if (user instanceof NextResponse) return user;

  try {
    const body = await request.json();
    const name = String(body.name || user.name).trim();
    const phone = String(body.phone ?? user.phone ?? "").trim();
    const address = String(body.address ?? user.address ?? "").trim();
    if (!name) return errorResponse("Name is required.");

    const updates: { name: string; phone: string; address: string; password?: string } = { name, phone, address };
    if (body.password) {
      if (String(body.password).length < 6) return errorResponse("Password must be at least 6 characters.");
      updates.password = await hashPassword(String(body.password));
    }

    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, user.id))
      .returning({ id: users.id, name: users.name, email: users.email, phone: users.phone, role: users.role, address: users.address, createdAt: users.createdAt });

    return NextResponse.json({ user: updated });
  } catch {
    return errorResponse("Could not update profile.", 500);
  }
}
