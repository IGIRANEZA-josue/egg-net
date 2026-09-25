// POST /api/orders -> customer places an order (server re-checks everything)
// GET  /api/orders -> customer: own orders / admin: all orders
import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, orderItems, products } from "@/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { requireUser, errorResponse } from "@/lib/auth";
import { DELIVERY_FEE, getActivePromotion, calculateDiscount, effectivePrice } from "@/lib/pricing";

const PAYMENT_METHODS = ["mobile_money", "cash", "card"];

type CartItemInput = { productId: number; quantity: number };

export async function POST(request: Request) {
  const user = await requireUser(request);
  if (user instanceof NextResponse) return user;

  try {
    const body = await request.json();
    const items: CartItemInput[] = Array.isArray(body.items) ? body.items : [];
    const delivery = body.delivery || {};
    const paymentMethod = String(body.paymentMethod || "");

    // ---- validate input ----
    if (items.length === 0) return errorResponse("Your cart is empty.");
    if (!PAYMENT_METHODS.includes(paymentMethod)) return errorResponse("Please select a valid payment method.");
    const required = ["fullName", "phone", "province", "district", "sector", "address"];
    for (const field of required) {
      if (!String(delivery[field] || "").trim()) return errorResponse(`Delivery ${field} is required.`);
    }

    // ---- load products from the database (never trust the frontend prices) ----
    const ids = items.map((i) => Number(i.productId));
    const dbProducts = await db.select().from(products).where(inArray(products.id, ids));

    let subtotal = 0;
    const lines: { productId: number; productName: string; price: number; quantity: number }[] = [];

    for (const item of items) {
      const product = dbProducts.find((p) => p.id === Number(item.productId));
      const quantity = Number(item.quantity);
      if (!product) return errorResponse("One of the products was not found.", 404);
      if (!product.isAvailable) return errorResponse(`${product.name} is not available.`);
      if (!Number.isInteger(quantity) || quantity <= 0) return errorResponse(`Invalid quantity for ${product.name}.`);
      if (product.stock === 0) return errorResponse(`${product.name} is out of stock.`);
      if (quantity > product.stock) return errorResponse(`Only ${product.stock} of ${product.name} left in stock.`);

      const price = effectivePrice(product.price, product.discount);
      subtotal += price * quantity;
      lines.push({ productId: product.id, productName: product.name, price, quantity });
    }

    // ---- server-side totals ----
    const promotion = await getActivePromotion();
    const discount = calculateDiscount(subtotal, promotion);
    const deliveryFee = DELIVERY_FEE;
    const total = subtotal + deliveryFee - discount;

    // ---- MOCK PAYMENT (development only) ----
    // No real payment provider is connected. Cash = pending until delivered.
    // Mobile money / card are marked "paid" by this test flow. Replace this with a real
    // provider (e.g. MTN MoMo API) and use PAYMENT_API_KEY from .env when going live.
    const paymentStatus = paymentMethod === "cash" ? "pending" : "paid";

    // ---- save order + items + reduce stock (all in one transaction) ----
    const created = await db.transaction(async (tx) => {
      const [order] = await tx
        .insert(orders)
        .values({
          orderNumber: "EGG" + Date.now().toString().slice(-6),
          customerId: user.id,
          customerName: String(delivery.fullName).trim(),
          phone: String(delivery.phone).trim(),
          province: String(delivery.province).trim(),
          district: String(delivery.district).trim(),
          sector: String(delivery.sector).trim(),
          address: String(delivery.address).trim(),
          instructions: String(delivery.instructions || "").trim(),
          subtotal,
          deliveryFee,
          discount,
          total,
          paymentMethod,
          paymentStatus,
          orderStatus: "pending",
        })
        .returning();

      await tx.insert(orderItems).values(lines.map((l) => ({ ...l, orderId: order.id })));

      // reduce stock for each product
      for (const line of lines) {
        const product = dbProducts.find((p) => p.id === line.productId)!;
        await tx
          .update(products)
          .set({ stock: product.stock - line.quantity, updatedAt: new Date() })
          .where(eq(products.id, line.productId));
      }
      return order;
    });

    return NextResponse.json({ order: created }, { status: 201 });
  } catch {
    return errorResponse("Failed to place order. Please try again.", 500);
  }
}

export async function GET(request: Request) {
  const user = await requireUser(request);
  if (user instanceof NextResponse) return user;

  const list =
    user.role === "admin"
      ? await db.select().from(orders).orderBy(desc(orders.createdAt))
      : await db.select().from(orders).where(eq(orders.customerId, user.id)).orderBy(desc(orders.createdAt));

  return NextResponse.json({ orders: list });
}
