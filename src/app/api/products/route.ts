// GET  /api/products   -> public list (supports ?search= and ?inStock=true)
//                          ?all=true (include unavailable) is ADMIN-only
// POST /api/products   -> ADMIN only: create a product
import { NextResponse } from "next/server";
import { db } from "@/db";
import { products } from "@/db/schema";
import { desc, eq, and, gt, ilike, or, SQL } from "drizzle-orm";
import { requireAdmin, getUserFromRequest, errorResponse } from "@/lib/auth";
import { readProductBody } from "@/lib/validate-product";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = (searchParams.get("search") || "").trim().slice(0, 100);
    const inStock = searchParams.get("inStock") === "true";
    const wantAll = searchParams.get("all") === "true";

    const conditions: SQL[] = [];

    if (wantAll) {
      // Only admins may see unavailable products.
      const user = await getUserFromRequest(request);
      if (!user || user.role !== "admin") return errorResponse("Admin access only.", 403);
    } else {
      conditions.push(eq(products.isAvailable, true));
    }
    if (inStock) conditions.push(gt(products.stock, 0));
    if (search) {
      const pattern = `%${search.replace(/[%_]/g, "\\$&")}%`;
      conditions.push(or(ilike(products.name, pattern), ilike(products.description, pattern))!);
    }

    const list = await db
      .select()
      .from(products)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(products.createdAt))
      .limit(500);

    return NextResponse.json({ products: list });
  } catch (err) {
    console.error("GET /api/products failed:", err);
    return errorResponse("We could not load products. Please try again.", 503);
  }
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return errorResponse("Invalid request body.");
    const result = readProductBody(body);
    if (result.error || !result.data) return errorResponse(result.error || "Invalid data.");

    const [product] = await db.insert(products).values(result.data).returning();
    return NextResponse.json({ product }, { status: 201 });
  } catch (err) {
    console.error("POST /api/products failed:", err);
    return errorResponse("Could not create product.", 500);
  }
}
