// GET  /api/products   -> public list (supports ?search= and ?inStock=true)
// POST /api/products   -> ADMIN only: create a product
import { NextResponse } from "next/server";
import { db } from "@/db";
import { products } from "@/db/schema";
import { desc } from "drizzle-orm";
import { requireAdmin, errorResponse } from "@/lib/auth";
import { readProductBody } from "@/lib/validate-product";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("search") || "").toLowerCase();
  const inStock = searchParams.get("inStock") === "true";
  const all = searchParams.get("all") === "true"; // admin uses this to see unavailable items too

  let list = await db.select().from(products).orderBy(desc(products.createdAt));

  if (!all) list = list.filter((p) => p.isAvailable);
  if (search) list = list.filter((p) => p.name.toLowerCase().includes(search) || (p.description || "").toLowerCase().includes(search));
  if (inStock) list = list.filter((p) => p.stock > 0);

  return NextResponse.json({ products: list });
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const result = readProductBody(await request.json());
    if (result.error || !result.data) return errorResponse(result.error || "Invalid data.");

    const [product] = await db.insert(products).values(result.data).returning();
    return NextResponse.json({ product }, { status: 201 });
  } catch {
    return errorResponse("Could not create product.", 500);
  }
}
