// POST /api/auth/logout -> clears the HttpOnly session cookie.
// (The browser also clears its localStorage copy — see clearAuth().)
import { NextResponse } from "next/server";
import { withClearedSessionCookie } from "@/lib/auth";

export async function POST() {
  return withClearedSessionCookie(NextResponse.json({ message: "Logged out." }));
}
