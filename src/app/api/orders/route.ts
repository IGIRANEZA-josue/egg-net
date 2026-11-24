// POST /api/orders -> customer places an order (server re-checks everything)
// GET  /api/orders -> customer: own orders / admin: all orders
import { NextResponse } from "next/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { orders, orderItems, products } from "@/db/schema";
import { requireUser, requireAdmin, errorResponse } from "@/lib/auth";
import {
  getActivePromotion,
  getProductPromotions,
  calculateDiscount,
  effectivePrice,
} from "@/lib/pricing";
import { decideFulfilment, PICKUP } from "@/lib/fulfilment";
import { withApi, readJson, ApiError } from "@/lib/api-handler";
import { checkoutSchema, firstIssue } from "@/lib/validation";
import { parsePagination } from "@/lib/pagination";

// Thrown inside the transaction; mapped to a 409 with a shopping-friendly message.
class InsufficientStockError extends Error {
  available: number;
  constructor(name: string, available: number) {
    super(`Only ${available} of ${name} left in stock.`);
    this.name = "InsufficientStockError";
    this.available = available;
  }
}

export const POST = withApi(async ({ request, log }) => {
  const user = await requireUser(request);
  if (user instanceof NextResponse) return user;

  const body = await readJson(request);

  // Validate shape and bounds before touching the database. A 1 MB
  // `instructions` value used to be written straight through.
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) return errorResponse(firstIssue(parsed.error));
  const { items, delivery, paymentMethod } = parsed.data;

  // ---- delivery area ----
  // The customer's coordinates decide delivery vs pickup, and the decision
  // decides the fee. This is computed here, never trusted from the client: a
  // forged request can otherwise claim a 1 000 RWF delivery to anywhere. A
  // missing location is treated as pickup, which is the safe direction.
  const fulfilment = decideFulfilment(delivery);
  if (fulfilment.method === "pickup" && !delivery.pickupAcknowledged) {
    return errorResponse(
      `This order is for collection at ${PICKUP.name}. Please confirm that you will collect it.`,
      409,
      { fulfilment: { method: "pickup", fee: fulfilment.fee, message: fulfilment.message } }
    );
  }
  const deliveryFee = fulfilment.fee;

  // ---- idempotency ----
  // A double click, a retry on a flaky connection or a back-and-resubmit must
  // not create a second order and a second stock decrement.
  const idempotencyKey = request.headers.get("idempotency-key")?.trim() || null;
  if (idempotencyKey) {
    const [existing] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.idempotencyKey, idempotencyKey), eq(orders.customerId, user.id)));
    if (existing) return NextResponse.json({ order: existing, replayed: true }, { status: 200 });
  }

  // ---- merge duplicate lines BEFORE pricing ----
  // Sending the same product twice used to create two order_items rows and
  // decrement stock twice from a stale base.
  const mergedQuantities = new Map<number, number>();
  for (const item of items) {
    const total = (mergedQuantities.get(item.productId) ?? 0) + item.quantity;
    if (total > 1000) return errorResponse("Quantity is too large for one order.");
    mergedQuantities.set(item.productId, total);
  }
  const productIds = [...mergedQuantities.keys()];

  // ---- mock payment gate ----
  // Mobile Money / Card are only marked paid when PAYMENT_MODE=mock. Otherwise
  // they stay pending until an operator confirms - the old behaviour reported
  // revenue that was never collected.
  const paymentMode = process.env.PAYMENT_MODE === "mock" ? "mock" : "real";
  let paymentStatus: "paid" | "pending" = "pending";
  // TODO(payments): replace this block with a provider call (e.g. MTN MoMo
  // Collections), then add POST /api/payments/webhook that sets
  // orders.paymentStatus from the provider's signed callback.
  if (paymentMode === "mock" && (paymentMethod === "mobile_money" || paymentMethod === "card")) {
    paymentStatus = "paid";
  }

  try {
    const created = await db.transaction(async (tx) => {
      // Lock the product rows for the life of the transaction. Reading them
      // before the transaction (as this code used to) let two checkouts pass
      // validation against the same stock and oversell.
      const dbProducts = await tx
        .select()
        .from(products)
        .where(inArray(products.id, productIds))
        .for("update");

      // Product-scoped promotions (a promotion row can target one product).
      const productPromotions = await getProductPromotions(productIds, tx);

      let subtotal = 0;
      const lines: { productId: number; productName: string; price: number; quantity: number }[] = [];

      for (const [productId, quantity] of mergedQuantities) {
        const product = dbProducts.find((p) => p.id === productId);
        if (!product || product.deletedAt) return errorResponse("One of the products was not found.", 404);
        if (!product.isAvailable) return errorResponse(`${product.name} is not available.`);
        if (product.stock < quantity) {
          return errorResponse(`Only ${product.stock} of ${product.name} left in stock.`, 409);
        }

        // Product discount, then any product-scoped promotion on top of it.
        const base = effectivePrice(product.price, product.discount);
        const scoped = productPromotions.get(product.id) ?? null;
        const scopedOff = calculateDiscount(base, scoped);
        const price = base - scopedOff;

        subtotal += price * quantity;
        lines.push({ productId: product.id, productName: product.name, price, quantity });
      }

      const promotion = await getActivePromotion(tx);
      const discount = calculateDiscount(subtotal, promotion);
      const total = subtotal + deliveryFee - discount;

      // Order number comes from a Postgres sequence (drizzle/0001_*.sql):
      // the old Date.now()-based value collided under concurrency.
      const [{ orderNumber }] = await tx.execute<{ orderNumber: string }>(
        sql`select next_order_number() as "orderNumber"`
      ).then((r) => r.rows as { orderNumber: string }[]);

      const [order] = await tx
        .insert(orders)
        .values({
          orderNumber,
          customerId: user.id,
          customerName: delivery.fullName,
          phone: delivery.phone,
          province: delivery.province,
          district: delivery.district,
          sector: delivery.sector,
          address: delivery.address,
          instructions: delivery.instructions ?? "",
          fulfilmentMethod: fulfilment.method,
          latitude: typeof delivery.latitude === "number" ? delivery.latitude : null,
          longitude: typeof delivery.longitude === "number" ? delivery.longitude : null,
          distanceKm: fulfilment.distanceKm,
          subtotal,
          deliveryFee,
          discount,
          total,
          paymentMethod,
          paymentStatus,
          orderStatus: "pending",
          idempotencyKey,
          statusChangedAt: new Date(),
        })
        .returning();

      await tx.insert(orderItems).values(lines.map((l) => ({ ...l, orderId: order.id })));

      // Guarded decrement: `stock >= qty` makes the write itself the check, so
      // even without the row lock above an oversell cannot be written.
      for (const line of lines) {
        const [updated] = await tx
          .update(products)
          .set({ stock: sql`${products.stock} - ${line.quantity}`, updatedAt: new Date() })
          .where(and(eq(products.id, line.productId), sql`${products.stock} >= ${line.quantity}`))
          .returning({ id: products.id });
        if (!updated) throw new InsufficientStockError(line.productName, 0);
      }

      return order;
    });

    if (created instanceof NextResponse) return created;
    return NextResponse.json({ order: created, fulfilment }, { status: 201 });
  } catch (error) {
    if (error instanceof InsufficientStockError) return errorResponse(error.message, 409);
    // A concurrent request with the same idempotency key lost the unique race.
    if (typeof error === "object" && error && "code" in error && (error as { code: string }).code === "23505") {
      log("idempotency conflict", error);
      if (idempotencyKey) {
        const [existing] = await db
          .select()
          .from(orders)
          .where(and(eq(orders.idempotencyKey, idempotencyKey), eq(orders.customerId, user.id)));
        if (existing) return NextResponse.json({ order: existing, replayed: true }, { status: 200 });
      }
      return errorResponse("We could not place your order. Please try again.", 409);
    }
    log("order creation failed", error);
    throw new ApiError("Failed to place order. Please try again.", 500);
  }
});

export const GET = withApi(async ({ request }) => {
  const user = await requireUser(request);
  if (user instanceof NextResponse) return user;

  const { page, pageSize, offset } = parsePagination(request);
  const isAdmin = user.role === "admin";

  const where = isAdmin ? undefined : eq(orders.customerId, user.id);
  const rows = isAdmin
    ? await db.select().from(orders).orderBy(desc(orders.createdAt)).limit(pageSize).offset(offset)
    : await db
        .select()
        .from(orders)
        .where(where)
        .orderBy(desc(orders.createdAt))
        .limit(pageSize)
        .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .where(where);

  return NextResponse.json({ orders: rows, total: count, page, pageSize });
});
