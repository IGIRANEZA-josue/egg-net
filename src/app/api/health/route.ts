import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { withApi } from "@/lib/api-handler";

export const dynamic = "force-dynamic";

const startedAt = Date.now();

// Keep `{ ok }` for existing monitors; add enough detail to diagnose a failure.
export const GET = withApi(async () => {
  const checks: Record<string, string> = {};
  let ok = true;

  try {
    await db.execute(sql`select 1`);
    checks.db = "ok";
  } catch {
    checks.db = "unreachable";
    ok = false;
  }

  return NextResponse.json(
    {
      ok,
      checks,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      version: process.env.npm_package_version ?? "unknown",
    },
    { status: ok ? 200 : 500 }
  );
});
