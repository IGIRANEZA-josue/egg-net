"use client";
// Shopping cart stored in localStorage (like services/cart.js).
// The backend re-checks prices and stock at checkout, so this is only for display.

import { safeRead, safeWrite } from "./storage";

export type CartItem = {
  productId: number;
  name: string;
  price: number; // display price (after product discount)
  image: string;
  stock: number; // used to stop the customer adding more than available
  quantity: number;
};

const KEY = "egghub_cart";

function notify() {
  window.dispatchEvent(new Event("egghub-cart"));
}

function isCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(item.productId) &&
    typeof item.name === "string" &&
    Number.isFinite(item.price) &&
    Number.isFinite(item.stock) &&
    Number.isFinite(item.quantity) &&
    (item.quantity as number) > 0
  );
}

export function getCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  const items = safeRead<CartItem[]>(KEY, (value) => {
    if (!Array.isArray(value)) return null;
    // Discard only the broken entries rather than the whole cart.
    const clean = value.filter(isCartItem).map((item) => ({
      ...item,
      image: typeof item.image === "string" ? item.image : "",
      quantity: Math.max(1, Math.floor(item.quantity)),
    }));
    return clean;
  });
  return items ?? [];
}

function saveCart(items: CartItem[]) {
  safeWrite(KEY, items);
  notify();
}

/** Replace the cart wholesale - used after refreshing against the live API. */
export function setCart(items: CartItem[]) {
  saveCart(items);
}

// Add a product (or increase its quantity). Returns an error message if not possible.
export function addToCart(item: Omit<CartItem, "quantity">, quantity = 1): string | null {
  const cart = getCart();
  const existing = cart.find((c) => c.productId === item.productId);
  const newQty = (existing ? existing.quantity : 0) + quantity;
  if (newQty > item.stock) return `Only ${item.stock} available in stock.`;

  if (existing) {
    existing.quantity = newQty;
    existing.stock = item.stock;
    existing.price = item.price;
  } else {
    cart.push({ ...item, quantity });
  }
  saveCart(cart);
  return null;
}

export function updateQuantity(productId: number, quantity: number) {
  const cart = getCart();
  const item = cart.find((c) => c.productId === productId);
  if (!item) return;
  if (quantity <= 0) {
    saveCart(cart.filter((c) => c.productId !== productId));
    return;
  }
  item.quantity = Math.min(quantity, item.stock);
  saveCart(cart);
}

export function removeFromCart(productId: number) {
  saveCart(getCart().filter((c) => c.productId !== productId));
}

export function clearCart() {
  saveCart([]);
}

export function cartCount() {
  return getCart().reduce((sum, item) => sum + item.quantity, 0);
}

export function cartSubtotal(items: CartItem[]) {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

// Same discount rule as the server, used only to PREVIEW the total in the browser
export function previewDiscount(subtotal: number, promotion: { type: string; value: number } | null) {
  if (!promotion || subtotal <= 0) return 0;
  if (promotion.type === "percentage") return Math.round((subtotal * promotion.value) / 100);
  return Math.min(promotion.value, subtotal);
}
