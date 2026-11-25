// GET /api/admin/dashboard -> summary numbers for the admin dashboard
//
// Everything is aggregated in SQL. This used to select every order, every
// product and every customer into memory and reduce them in JavaScript.
import { NextResponse } from "next/server";
import { and, desc, eq, gte, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { orders, users, products, stockMovements } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { withApi } from "@/lib/api-handler";

const LOW_STOCK_LIMIT = 5;

export const GET = withApi(async ({ request }) => {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const notCancelled = ne(orders.orderStatus, "cancelled");

  const [
    [collected],
    [pending],
    [orderCounts],
    [customerCount],
    [productStats],
    recent,
    lowStock,
    [userCounts],
    [fulfilmentCounts],
    [eggStats],
    [ledgerTotals],
    movements,
  ] = await Promise.all([
    // "Collected" is money actually received. Before this, the dashboard summed
    // every non-cancelled order regardless of paymentStatus - including mock
    // payments that were never collected.
    db
      .select({ total: sql<number>`coalesce(sum(${orders.total}), 0)::int` })
      .from(orders)
      .where(and(notCancelled, eq(orders.paymentStatus, "paid"))),
    db
      .select({ total: sql<number>`coalesce(sum(${orders.total}), 0)::int` })
      .from(orders)
      .where(and(notCancelled, eq(orders.paymentStatus, "pending"))),
    db
      .select({
        total: sql<number>`count(*)::int`,
        pendingOrders: sql<number>`count(*) filter (where ${orders.orderStatus} = 'pending')::int`,
        delivered: sql<number>`count(*) filter (where ${orders.orderStatus} = 'delivered')::int`,
      })
      .from(orders),
    db.select({ total: sql<number>`count(*)::int` }).from(users).where(eq(users.role, "customer")),
    db
      .select({
        total: sql<number>`count(*)::int`,
        available: sql<number>`count(*) filter (where ${products.isAvailable} and ${products.deletedAt} is null)::int`,
      })
      .from(products),
    db.select().from(orders).orderBy(desc(orders.createdAt)).limit(5),
    db
      .select({ id: products.id, name: products.name, stock: products.stock })
      .from(products)
      .where(and(eq(products.isAvailable, true), isNull(products.deletedAt), sql`${products.stock} <= ${LOW_STOCK_LIMIT}`))
      .orderBy(products.stock)
      .limit(20),
    // Everyone who can log in, split by role - the dashboard used to count
    // customers only, so an operator could not see how many admins existed.
    db
      .select({
        customers: sql<number>`count(*) filter (where ${users.role} = 'customer')::int`,
        admins: sql<number>`count(*) filter (where ${users.role} = 'admin')::int`,
        total: sql<number>`count(*)::int`,
      })
      .from(users),
    // Delivery vs collection, so staff know how much of the day is dispatch.
    db
      .select({
        deliveries: sql<number>`count(*) filter (where ${orders.fulfilmentMethod} = 'delivery')::int`,
        pickups: sql<number>`count(*) filter (where ${orders.fulfilmentMethod} = 'pickup')::int`,
        // Pickups still waiting at the counter.
        awaitingPickup: sql<number>`count(*) filter (where ${orders.fulfilmentMethod} = 'pickup' and ${orders.orderStatus} in ('pending','confirmed','preparing','out_for_delivery'))::int`,
      })
      .from(orders)
      .where(notCancelled),
    // Egg stock across every live listing: the number the shop actually has.
    db
      .select({
        totalStock: sql<number>`coalesce(sum(${products.stock}), 0)::int`,
        listings: sql<number>`count(*)::int`,
        activeListings: sql<number>`count(*) filter (where ${products.isAvailable})::int`,
        lowStock: sql<number>`count(*) filter (where ${products.stock} <= ${LOW_STOCK_LIMIT})::int`,
        outOfStock: sql<number>`count(*) filter (where ${products.stock} = 0)::int`,
        stockValue: sql<number>`coalesce(sum(${products.stock} * ${products.price}), 0)::int`,
      })
      .from(products)
      .where(isNull(products.deletedAt)),
    // Lifetime movement through the ledger, not just today.
    db
      .select({
        totalIn: sql<number>`coalesce(sum(case when ${stockMovements.direction} = 'in' then ${stockMovements.quantity} else 0 end), 0)::int`,
        totalOut: sql<number>`coalesce(sum(case when ${stockMovements.direction} = 'out' then ${stockMovements.quantity} else 0 end), 0)::int`,
        entries: sql<number>`count(*)::int`,
      })
      .from(stockMovements),
    // The activity feed: newest inventory movements with the product name.
    db
      .select({
        id: stockMovements.id,
        direction: stockMovements.direction,
        quantity: stockMovements.quantity,
        reason: stockMovements.reason,
        source: stockMovements.source,
        createdAt: stockMovements.createdAt,
        productName: products.name,
        orderNumber: orders.orderNumber,
      })
      .from(stockMovements)
      .innerJoin(products, eq(stockMovements.productId, products.id))
      .leftJoin(orders, eq(stockMovements.orderId, orders.id))
      .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
      .limit(8),
  ]);

  // Last 7 days of collected revenue, bucketed in Rwanda local time.
  // `AT TIME ZONE` needs a literal (Postgres cannot resolve a bind parameter
  // inside the GROUP BY expression); TZ is a constant, not user input.
  const tz = "Africa/Kigali";
  const localDay = sql.raw(`("orders"."created_at" at time zone '${tz}')::date`);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const daily = await db
    .select({
      day: sql<string>`to_char(${localDay}, 'YYYY-MM-DD')`,
      total: sql<number>`coalesce(sum(${orders.total}), 0)::int`,
    })
    .from(orders)
    .where(and(notCancelled, eq(orders.paymentStatus, "paid"), gte(orders.createdAt, sevenDaysAgo)))
    .groupBy(localDay);

  return NextResponse.json({
    totalSales: collected?.total ?? 0,      // kept: now means "collected"
    pendingSales: pending?.total ?? 0,      // new: owed but not received
    totalOrders: orderCounts?.total ?? 0,
    pendingOrders: orderCounts?.pendingOrders ?? 0,
    deliveredOrders: orderCounts?.delivered ?? 0,
    totalCustomers: customerCount?.total ?? 0,
    totalProducts: productStats?.total ?? 0,
    availableProducts: productStats?.available ?? 0,
    recentOrders: recent,
    lowStockProducts: lowStock,
    dailySales: daily,
    // Accounts, by role. totalCustomers is set above.
    totalAdmins: userCounts?.admins ?? 0,
    totalUsers: userCounts?.total ?? 0,
    // Delivery vs collection.
    deliveries: fulfilmentCounts?.deliveries ?? 0,
    pickups: fulfilmentCounts?.pickups ?? 0,
    awaitingPickup: fulfilmentCounts?.awaitingPickup ?? 0,
    // Eggs and inventory.
    totalStock: eggStats?.totalStock ?? 0,
    totalListings: eggStats?.listings ?? 0,
    activeListings: eggStats?.activeListings ?? 0,
    lowStockCount: eggStats?.lowStock ?? 0,
    outOfStockCount: eggStats?.outOfStock ?? 0,
    stockValue: eggStats?.stockValue ?? 0,
    totalStockIn: ledgerTotals?.totalIn ?? 0,
    totalStockOut: ledgerTotals?.totalOut ?? 0,
    movementCount: ledgerTotals?.entries ?? 0,
    recentMovements: movements,
  });
});
