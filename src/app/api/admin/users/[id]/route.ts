// GET    /api/admin/users/[id] -> one account with its order summary
// PATCH  /api/admin/users/[id] -> edit name/email/phone/address/role/status
// DELETE /api/admin/users/[id] -> remove an account that has no history
//
// Passwords are never read or returned by any of these.
import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users, orders, reviews } from "@/db/schema";
import { requireAdmin, errorResponse } from "@/lib/auth";
import { withApi, readJson, ApiError } from "@/lib/api-handler";
import { isPgError, UNIQUE_VIOLATION, FOREIGN_KEY_VIOLATION } from "@/lib/db-errors";

type Params = { id: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export const GET = withApi<Params>(async ({ request, params }) => {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const id = parseId(params.id);
  if (id === null) return errorResponse("Account not found.", 404);

  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      role: users.role,
      address: users.address,
      isActive: users.isActive,
      mustChangePassword: users.mustChangePassword,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, id));

  if (!user) return errorResponse("Account not found.", 404);

  const recentOrders = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      total: orders.total,
      orderStatus: orders.orderStatus,
      paymentStatus: orders.paymentStatus,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(eq(orders.customerId, id))
    .orderBy(desc(orders.createdAt))
    .limit(10);

  const [summary] = await db
    .select({
      orderCount: sql<number>`count(*)::int`,
      totalSpent: sql<number>`coalesce(sum(case when ${orders.paymentStatus} = 'paid' and ${orders.orderStatus} <> 'cancelled' then ${orders.total} else 0 end), 0)::int`,
    })
    .from(orders)
    .where(eq(orders.customerId, id));

  return NextResponse.json({ user, recentOrders, summary, isSelf: admin.id === id });
});

export const PATCH = withApi<Params>(async ({ request, params, log }) => {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const id = parseId(params.id);
  if (id === null) return errorResponse("Account not found.", 404);

  const body = await readJson(request);
  const updates: Partial<typeof users.$inferInsert> = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (name.length < 2) return errorResponse("Name must be at least 2 characters.");
    updates.name = name;
  }
  if (body.email !== undefined) {
    const email = String(body.email).trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return errorResponse("Enter a valid email address.");
    updates.email = email;
  }
  if (body.phone !== undefined) updates.phone = String(body.phone).trim();
  if (body.address !== undefined) updates.address = String(body.address).trim();

  if (body.role !== undefined) {
    const role = String(body.role);
    if (role !== "admin" && role !== "customer") return errorResponse("Role must be admin or customer.");
    // An admin must not be able to lock themselves out, and the last admin must
    // not be demoted - either would leave the shop unmanageable.
    if (admin.id === id && role !== "admin") {
      return errorResponse("You cannot remove your own admin access.", 409);
    }
    if (role !== "admin") {
      const [{ admins }] = await db
        .select({ admins: sql<number>`count(*)::int` })
        .from(users)
        .where(and(eq(users.role, "admin"), eq(users.isActive, true)));
      if (admins <= 1) return errorResponse("This is the only active admin account.", 409);
    }
    updates.role = role;
  }

  if (body.isActive !== undefined) {
    const isActive = Boolean(body.isActive);
    if (!isActive) {
      if (admin.id === id) return errorResponse("You cannot deactivate your own account.", 409);
      if (id === 1) return errorResponse("The founding admin account cannot be deactivated.", 409);
    }
    updates.isActive = isActive;
  }

  if (Object.keys(updates).length === 0) return errorResponse("Nothing to update.");

  try {
    const [updated] = await db.update(users).set(updates).where(eq(users.id, id)).returning({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      role: users.role,
      address: users.address,
      isActive: users.isActive,
    });
    if (!updated) return errorResponse("Account not found.", 404);
    return NextResponse.json({ user: updated });
  } catch (error) {
    if (isPgError(error, UNIQUE_VIOLATION)) {
      return errorResponse("Another account already uses that email.", 409);
    }
    log("admin user update failed", error);
    throw new ApiError("Could not save that account. Please try again.", 500);
  }
});

export const DELETE = withApi<Params>(async ({ request, params, log }) => {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const id = parseId(params.id);
  if (id === null) return errorResponse("Account not found.", 404);
  if (admin.id === id) return errorResponse("You cannot delete your own account.", 409);
  if (id === 1) return errorResponse("The founding admin account cannot be deleted.", 409);

  try {
    // Orders and reviews reference the account with ON DELETE RESTRICT, so an
    // account with history cannot be deleted. Say so plainly and offer the
    // alternative the schema actually supports.
    const [history] = await db
      .select({ orderCount: sql<number>`count(*)::int` })
      .from(orders)
      .where(eq(orders.customerId, id));
    if ((history?.orderCount ?? 0) > 0) {
      return errorResponse(
        "This account has order history, so it cannot be deleted. Deactivate it instead to block sign-in while keeping the records.",
        409
      );
    }

    // Reviews are the only thing the schema allows to cascade without losing
    // money or stock records, so clear them first.
    await db.delete(reviews).where(eq(reviews.customerId, id));
    const deleted = await db.delete(users).where(eq(users.id, id)).returning({ id: users.id });
    if (deleted.length === 0) return errorResponse("Account not found.", 404);
    return NextResponse.json({ message: "Account deleted." });
  } catch (error) {
    if (isPgError(error, FOREIGN_KEY_VIOLATION)) {
      return errorResponse(
        "This account is still referenced by other records. Deactivate it instead.",
        409
      );
    }
    log("admin user delete failed", error);
    throw new ApiError("Could not delete that account. Please try again.", 500);
  }
});
