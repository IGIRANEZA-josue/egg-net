// GET /api/admin/inventory -> the movement ledger, newest first.
//   ?direction=in|out  ?productId=  ?search=  ?page=  ?pageSize=
// Also returns the totals the inventory screen shows above the table.
import { NextResponse } from "next/server";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { products, stockMovements, orders } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { withApi } from "@/lib/api-handler";
import { parsePagination } from "@/lib/pagination";

export const GET = withApi(async ({ request }) => {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { searchParams } = new URL(request.url);
  const { page, pageSize, offset } = parsePagination(request);
  const direction = searchParams.get("direction") ?? "";
  const rawProductId = Number(searchParams.get("productId"));
  const search = (searchParams.get("search") ?? "").trim();

  const conditions = [];
  if (direction === "in" || direction === "out") conditions.push(eq(stockMovements.direction, direction));
  if (Number.isInteger(rawProductId) && rawProductId > 0) {
    conditions.push(eq(stockMovements.productId, rawProductId));
  }
  if (search) {
    conditions.push(
      or(
        ilike(products.name, `%${search}%`),
        ilike(stockMovements.reason, `%${search}%`),
        ilike(stockMovements.source, `%${search}%`),
        ilike(stockMovements.note, `%${search}%`)
      )!
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const [movements, [totals]] = await Promise.all([
    db
      .select({
        id: stockMovements.id,
        direction: stockMovements.direction,
        quantity: stockMovements.quantity,
        reason: stockMovements.reason,
        source: stockMovements.source,
        note: stockMovements.note,
        createdAt: stockMovements.createdAt,
        productId: stockMovements.productId,
        productName: products.name,
        category: products.category,
        orderNumber: orders.orderNumber,
      })
      .from(stockMovements)
      .innerJoin(products, eq(stockMovements.productId, products.id))
      .leftJoin(orders, eq(stockMovements.orderId, orders.id))
      .where(where)
      .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(stockMovements)
      .innerJoin(products, eq(stockMovements.productId, products.id))
      .where(where),
  ]);

  // Totals are for the whole ledger, not the filtered page: "how much has ever
  // come in" should not change when an admin filters by product.
  const [lifetime] = await db
    .select({
      totalIn: sql<number>`coalesce(sum(case when ${stockMovements.direction} = 'in' then ${stockMovements.quantity} else 0 end), 0)::int`,
      totalOut: sql<number>`coalesce(sum(case when ${stockMovements.direction} = 'out' then ${stockMovements.quantity} else 0 end), 0)::int`,
      entries: sql<number>`count(*)::int`,
    })
    .from(stockMovements);

  const [onHand] = await db
    .select({
      availableEggs: sql<number>`coalesce(sum(${products.stock}), 0)::int`,
      listings: sql<number>`count(*)::int`,
      lowStock: sql<number>`count(*) filter (where ${products.stock} <= 5)::int`,
    })
    .from(products)
    .where(sql`${products.deletedAt} is null`);

  return NextResponse.json({
    movements,
    total: totals?.total ?? 0,
    page,
    pageSize,
    totals: {
      totalIn: lifetime?.totalIn ?? 0,
      totalOut: lifetime?.totalOut ?? 0,
      entries: lifetime?.entries ?? 0,
      onHand: onHand?.availableEggs ?? 0,
      listings: onHand?.listings ?? 0,
      lowStock: onHand?.lowStock ?? 0,
    },
  });
});
