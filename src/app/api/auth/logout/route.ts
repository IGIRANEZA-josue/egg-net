// POST /api/auth/logout -> clear the session cookie server-side.
//
// Clearing it on the client was never enough: the cookie is HttpOnly now, so
// only the server can expire it.
import { NextResponse } from "next/server";
import { clearAuthCookie } from "@/lib/auth";
import { withApi } from "@/lib/api-handler";

export const POST = withApi(async () => {
  return clearAuthCookie(NextResponse.json({ message: "Logged out." }));
});
