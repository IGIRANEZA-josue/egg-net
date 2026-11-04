// POST /api/orders -> customer places an order (server re-checks everything)
// GET  /api/orders -> customer: own orders / admin: all orders
//
// Concurrency safety: product rows are locked (FOR UPDATE) inside the
// transaction and stock is decremented atomically, so two simultaneous
// checkouts can never oversell. Order numbers come from a DB sequence.
import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, orderItems, products } from "@/db/schema";
import { eq, desc, inArray, and, gte, sql } from "drizzle-orm";
import { requireUser, errorResponse } from "@/lib/auth";
import { DELIVERY_FEE, getActivePromotion, calculateDiscount, effectivePrice } from "@/lib/pricing";
import { processPayment } from "@/lib/payments";
import { readOrderBody } from "@/lib/validate-order";

export async function POST(request: Request) {
  const user = await requireUser(request);
  if (user instanceof NextResponse) return user;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return errorResponse("Invalid request body.");

    const parsed = readOrderBody(body);
    if (parsed.error || !parsed.data) return errorResponse(parsed.error || "Invalid order.");
    const { items, delivery, paymentMethod } = parsed.data;

    const created = await db.transaction(async (tx) => {
      // Lock the product rows so concurrent orders queue up instead of racing.
      const ids = items.map((i) => i.productId);
      const dbProducts = await tx
        .select()
        .from(products)
        .where(inArray(products.id, ids))
        .for("update");

      let subtotal = 0;
      const lines: { productId: number; productName: string; price: number; quantity: number }[] = [];

      for (const item of items) {
        const product = dbProducts.find((p) => p.id === item.productId);
        if (!product) throw new OrderError("One of the products was not found.", 404);
        if (!product.isAvailable) throw new OrderError(`${product.name} is not available.`);
        if (product.stock === 0) throw new OrderError(`${product.name} is out of stock.`);
        if (item.quantity > product.stock) {
          throw new OrderError(`Only ${product.stock} of ${product.name} left in stock.`);
        }
        const price = effectivePrice(product.price, product.discount);
        subtotal += price * item.quantity;
        lines.push({ productId: product.id, productName: product.name, price, quantity: item.quantity });
      }

      // Server-side totals — the frontend never decides prices.
      const promotion = await getActivePromotion();
      const discount = calculateDiscount(subtotal, promotion);
      const deliveryFee = DELIVERY_FEE;
      const total = subtotal + deliveryFee - discount;

      // Payment goes through the provider abstraction (currently a labelled mock).
      const payment = await processPayment(paymentMethod, total);

      // Atomic decrement: the gte() guard makes overselling impossible even
      // if the lock above were ever removed.
      for (const line of lines) {
        const [updated] = await tx
          .update(products)
          .set({ stock: sql`${products.stock} - ${line.quantity}`, updatedAt: new Date() })
          .where(and(eq(products.id, line.productId), gte(products.stock, line.quantity)))
          .returning({ id: products.id });
        if (!updated) throw new OrderError(`${line.productName} just went out of stock. Please refresh your cart.`);
      }

      const seqResult = await tx.execute(sql`select nextval('order_number_seq') as next`);
      const next = (seqResult.rows[0] as { next: string }).next;

      const [order] = await tx
        .insert(orders)
        .values({
          orderNumber: `EGG${next}`,
          customerId: user.id,
          customerName: delivery.fullName,
          phone: delivery.phone,
          province: delivery.province,
          district: delivery.district,
          sector: delivery.sector,
          address: delivery.address,
          instructions: delivery.instructions,
          subtotal,
          deliveryFee,
          discount,
          total,
          paymentMethod,
          paymentStatus: payment.status,
          orderStatus: "pending",
        })
        .returning();

      await tx.insert(orderItems).values(lines.map((l) => ({ ...l, orderId: order.id })));
      return order;
    });

    return NextResponse.json({ order: created }, { status: 201 });
  } catch (err) {
    if (err instanceof OrderError) return errorResponse(err.message, err.status);
    console.error("POST /api/orders failed:", err);
    return errorResponse("Failed to place order. Please try again.", 500);
  }
}

class OrderError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function GET(request: Request) {
  const user = await requireUser(request);
  if (user instanceof NextResponse) return user;

  try {
    const list =
      user.role === "admin"
        ? await db.select().from(orders).orderBy(desc(orders.createdAt)).limit(500)
        : await db
            .select()
            .from(orders)
            .where(eq(orders.customerId, user.id))
            .orderBy(desc(orders.createdAt))
            .limit(200);
    return NextResponse.json({ orders: list });
  } catch (err) {
    console.error("GET /api/orders failed:", err);
    return errorResponse("We could not load your orders. Please try again.", 503);
  }
}
