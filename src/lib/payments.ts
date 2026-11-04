// Payment provider abstraction.
//
// ┌─────────────────────────────────────────────────────────────────────┐
// │  MOCK IMPLEMENTATION — no real money moves.                          │
// │  To go live: implement charge() with your provider (e.g. MTN MoMo    │
// │  Collections API) using PAYMENT_API_KEY, and add a webhook route     │
// │  that updates orders.paymentStatus when the provider confirms.       │
// └─────────────────────────────────────────────────────────────────────┘
//
// The rest of the app only talks to processPayment(), so swapping the mock
// for a real provider touches this file (plus the webhook) and nothing else.

export type PaymentMethod = "mobile_money" | "cash" | "card";
export type PaymentResult = { status: "pending" | "paid" | "failed"; reference?: string };

export const PAYMENT_METHODS: PaymentMethod[] = ["mobile_money", "cash", "card"];

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return PAYMENT_METHODS.includes(value as PaymentMethod);
}

export async function processPayment(
  method: PaymentMethod,
  _amountRwf: number
): Promise<PaymentResult> {
  if (method === "cash") {
    // Cash on delivery: collected by the courier, admin marks it paid.
    return { status: "pending" };
  }
  // MOCK: mobile money / card are instantly "paid" so the demo flow works end
  // to end. A real implementation would return "pending" and wait for the
  // provider webhook before marking the order paid.
  return { status: "paid", reference: `MOCK-${Date.now()}` };
}
