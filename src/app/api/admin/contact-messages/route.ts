// GET /api/admin/contact-messages -> messages submitted from the contact form.
import { NextResponse } from "next/server";
import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { contactMessages } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { withApi } from "@/lib/api-handler";
import { parsePagination } from "@/lib/pagination";

export const GET = withApi(async ({ request }) => {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { page, pageSize, offset } = parsePagination(request);
  const [list, [{ count }]] = await Promise.all([
    db.select().from(contactMessages).orderBy(desc(contactMessages.createdAt)).limit(pageSize).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(contactMessages),
  ]);
  return NextResponse.json({ messages: list, total: count, page, pageSize });
});
