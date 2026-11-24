// Shared helpers for route-level tests.
//
// Route handlers in Next are plain functions, so tests call them directly with a
// `Request` - no HTTP server, no port juggling.
import { db } from "@/db";
import { users, products, orders, orderItems } from "@/db/schema";
import { hashPassword, createToken } from "@/lib/auth";

export const VALID_DELIVERY = {
  fullName: "Aline Uwase",
  phone: "0788123456",
  province: "Kigali City",
  district: "Gasabo",
  sector: "Remera",
  address: "KG 11 Ave, house 24",
  instructions: "",
};

export async function makeUser(overrides: Partial<{ email: string; role: "admin" | "customer"; name: string }> = {}) {
  const [user] = await db
    .insert(users)
    .values({
      name: overrides.name ?? "Aline Uwase",
      email: overrides.email ?? `user-${Math.random().toString(36).slice(2, 10)}@example.com`,
      password: await hashPassword("Password123"),
      role: overrides.role ?? "customer",
    })
    .returning();
  return user;
}

export async function makeProduct(overrides: Partial<{ name: string; price: number; stock: number; isAvailable: boolean; discount: number }> = {}) {
  const [product] = await db
    .insert(products)
    .values({
      name: overrides.name ?? "Fresh Eggs - 10 Pack",
      price: overrides.price ?? 1500,
      packageSize: 10,
      stock: overrides.stock ?? 10,
      discount: overrides.discount ?? 0,
      isAvailable: overrides.isAvailable ?? true,
    })
    .returning();
  return product;
}

/** A Request carrying a valid session cookie for the given user. */
export async function authedRequest(
  user: { id: number; role: string },
  url: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
) {
  const token = await createToken(user.id, user.role);
  return new Request(url, {
    method: init.method ?? "GET",
    headers: {
      "content-type": "application/json",
      cookie: `egghub_token=${token}`,
      ...(init.headers ?? {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

export async function readJson<T = Record<string, unknown>>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export async function stockOf(productId: number) {
  const [row] = await db.select({ stock: products.stock }).from(products).where((await import("drizzle-orm")).eq(products.id, productId));
  return row.stock;
}

export async function orderRows() {
  return db.select().from(orders);
}

export async function itemRows() {
  return db.select().from(orderItems);
}
