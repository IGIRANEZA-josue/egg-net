// Validation for POST /api/orders. Extracted so it can be unit-tested.
import { isPaymentMethod, type PaymentMethod } from "@/lib/payments";
import { isValidPhone, tooLong, LIMITS } from "@/lib/validate";

export type OrderItemInput = { productId: number; quantity: number };
export type DeliveryInput = {
  fullName: string; phone: string; province: string; district: string;
  sector: string; address: string; instructions: string;
};

export type OrderInput = {
  items: OrderItemInput[];
  delivery: DeliveryInput;
  paymentMethod: PaymentMethod;
};

const MAX_LINES = 50;
const MAX_QTY_PER_LINE = 1000;

export function readOrderBody(body: Record<string, unknown>): { data?: OrderInput; error?: string } {
  const rawItems = Array.isArray(body.items) ? body.items : [];
  const delivery = (body.delivery || {}) as Record<string, unknown>;
  const paymentMethod = body.paymentMethod;

  if (rawItems.length === 0) return { error: "Your cart is empty." };
  if (rawItems.length > MAX_LINES) return { error: "Too many different products in one order." };
  if (!isPaymentMethod(paymentMethod)) return { error: "Please select a valid payment method." };

  // Merge duplicate product lines (same product sent twice = one line).
  const merged = new Map<number, number>();
  for (const raw of rawItems) {
    const item = raw as Record<string, unknown>;
    const productId = Number(item?.productId);
    const quantity = Number(item?.quantity);
    if (!Number.isInteger(productId) || productId <= 0) return { error: "Invalid product in cart." };
    if (!Number.isInteger(quantity) || quantity <= 0) return { error: "Invalid quantity in cart." };
    if (quantity > MAX_QTY_PER_LINE) return { error: "Quantity per product is too large." };
    merged.set(productId, (merged.get(productId) || 0) + quantity);
  }
  for (const qty of merged.values()) {
    if (qty > MAX_QTY_PER_LINE) return { error: "Quantity per product is too large." };
  }

  const required: (keyof DeliveryInput)[] = ["fullName", "phone", "province", "district", "sector", "address"];
  const clean = {} as DeliveryInput;
  for (const field of required) {
    const value = String(delivery[field] ?? "").trim();
    if (!value) return { error: `Delivery ${field} is required.` };
    (clean as Record<string, string>)[field] = value;
  }
  clean.instructions = String(delivery.instructions ?? "").trim();

  if (!isValidPhone(clean.phone)) return { error: "Please enter a valid phone number (e.g. 078XXXXXXX)." };

  const lengthChecks: [string, number, string][] = [
    [clean.fullName, LIMITS.name, "Full name"],
    [clean.phone, LIMITS.phone, "Phone"],
    [clean.province, LIMITS.place, "Province"],
    [clean.district, LIMITS.place, "District"],
    [clean.sector, LIMITS.place, "Sector"],
    [clean.address, LIMITS.address, "Address"],
    [clean.instructions, LIMITS.instructions, "Instructions"],
  ];
  for (const [value, max, label] of lengthChecks) {
    const err = tooLong(value, max, label);
    if (err) return { error: err };
  }

  return {
    data: {
      items: [...merged.entries()].map(([productId, quantity]) => ({ productId, quantity })),
      delivery: clean,
      paymentMethod,
    },
  };
}
