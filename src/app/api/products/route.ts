// GET  /api/products   -> public list (supports ?search=, ?inStock=true, ?all=true)
// POST /api/products   -> ADMIN only: create a product
import { NextResponse } from "next/server";
import { and, asc, desc, eq, gt, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { requireAdmin, errorResponse } from "@/lib/auth";
import { readProductBody } from "@/lib/validate-product";
import { withApi, readJson, ApiError } from "@/lib/api-handler";
import { parsePagination } from "@/lib/pagination";

export const GET = withApi(async ({ request }) => {
  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("search") || "").trim();
  const inStock = searchParams.get("inStock") === "true";
  const all = searchParams.get("all") === "true";

  // `?all=true` shows hidden and out-of-stock items, which is admin-only data.
  // It used to be unauthenticated: anyone could enumerate unavailable stock.
  if (all) {
    const admin = await requireAdmin(request);
    if (admin instanceof NextResponse) return admin;
  }

  const { page, pageSize, offset } = parsePagination(request);

  const conditions = [isNull(products.deletedAt)];
  if (!all) conditions.push(eq(products.isAvailable, true));
  if (inStock) conditions.push(gt(products.stock, 0));
  if (search) {
    conditions.push(or(ilike(products.name, `%${search}%`), ilike(products.description, `%${search}%`))!);
  }
  const where = and(...conditions);

  const sort = searchParams.get("sort") || "newest";
  const orderBy =
    sort === "price_asc"
      ? asc(products.price)
      : sort === "price_desc"
        ? desc(products.price)
        : sort === "size"
          ? asc(products.packageSize)
          : desc(products.createdAt);

  const [list, [{ count }]] = await Promise.all([
    db.select().from(products).where(where).orderBy(orderBy).limit(pageSize).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(products).where(where),
  ]);

  return NextResponse.json({ products: list, total: count, page, pageSize });
});

export const POST = withApi(async ({ request, log }) => {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const body = await readJson(request);
  const result = readProductBody(body);
  if (result.error || !result.data) return errorResponse(result.error || "Invalid data.");

  try {
    const [product] = await db.insert(products).values(result.data).returning();
    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    log("product create failed", error);
    throw new ApiError("Could not create product.", 500);
  }
});
