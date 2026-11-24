// POST /api/admin/customers/:id/reset-password -> issue a temporary password.
//
// There was no admin-side reset path at all: a customer who forgot their
// password was permanently locked out.
import { NextResponse } from "next/server";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdmin, hashPassword, errorResponse } from "@/lib/auth";
import { withApi, ApiError } from "@/lib/api-handler";
import { parseId } from "@/lib/parse-id";

type Params = { id: string };

export const POST = withApi<Params>(async ({ request, params, log }) => {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const id = parseId(params.id);
  if (id === null) return errorResponse("Customer not found.", 404);

  const [customer] = await db.select({ id: users.id, role: users.role, email: users.email }).from(users).where(eq(users.id, id));
  if (!customer || customer.role !== "customer") return errorResponse("Customer not found.", 404);

  // Readable but random: 4 words-free base32 chunk.
  const temporaryPassword = crypto.randomBytes(9).toString("base64url").slice(0, 12);

  try {
    await db
      .update(users)
      .set({ password: await hashPassword(temporaryPassword), mustChangePassword: true })
      .where(eq(users.id, id));

    // Returned exactly once; it is not stored in plaintext anywhere.
    return NextResponse.json({
      message: "Temporary password created. Share it with the customer, who must change it at next login.",
      email: customer.email,
      temporaryPassword,
    });
  } catch (error) {
    log("admin reset failed", error);
    throw new ApiError("Could not reset this password. Please try again.", 500);
  }
});
