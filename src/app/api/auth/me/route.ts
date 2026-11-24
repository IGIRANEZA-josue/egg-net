// GET /api/auth/me -> the current user, or 401. Lets the UI render auth state
// without caching a credential.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { withApi } from "@/lib/api-handler";

export const GET = withApi(async ({ request }) => {
  const user = await requireUser(request);
  if (user instanceof NextResponse) return user;
  return NextResponse.json({ user });
});
