"use client";
// Shopping cart stored in localStorage (like services/cart.js).
// The backend re-checks prices and stock at checkout, so this is only for display.

export type CartItem = {
  productId: number;
  name: string;
  price: number; // display price (after product discount)
  image: string;
  stock: number; // used to stop the customer adding more than available
  quantity: number;
};

const KEY = "egghub_cart";
const EMPTY: CartItem[] = [];

// Cached snapshot so useSyncExternalStore gets a stable reference.
let cachedRaw: string | null | undefined;
let cachedItems: CartItem[] = EMPTY;

function notify() {
  window.dispatchEvent(new Event("egghub-cart"));
}

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function getCart(): CartItem[] {
  if (typeof window === "undefined") return EMPTY;
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      const parsed = raw ? (JSON.parse(raw) as CartItem[]) : EMPTY;
      cachedItems = Array.isArray(parsed) ? parsed : EMPTY;
    } catch {
      cachedItems = EMPTY;
    }
  }
  return cachedItems;
}

function saveCart(items: CartItem[]) {
  const raw = JSON.stringify(items);
  try {
    window.localStorage.setItem(KEY, raw);
  } catch {
    // storage blocked: keep the in-memory snapshot so the session still works
  }
  cachedRaw = raw;
  cachedItems = items;
  notify();
}

// Add a product (or increase its quantity). Returns an error message if not possible.
export function addToCart(item: Omit<CartItem, "quantity">, quantity = 1): string | null {
  const cart = [...getCart()];
  const index = cart.findIndex((c) => c.productId === item.productId);
  const existing = index >= 0 ? cart[index] : undefined;
  const newQty = (existing ? existing.quantity : 0) + quantity;
  if (newQty > item.stock) return `Only ${item.stock} available in stock.`;

  if (existing) {
    cart[index] = { ...existing, quantity: newQty, stock: item.stock, price: item.price };
  } else {
    cart.push({ ...item, quantity });
  }
  saveCart(cart);
  return null;
}

export function updateQuantity(productId: number, quantity: number) {
  const cart = [...getCart()];
  const index = cart.findIndex((c) => c.productId === productId);
  if (index < 0) return;
  if (quantity <= 0) {
    saveCart(cart.filter((c) => c.productId !== productId));
    return;
  }
  cart[index] = { ...cart[index], quantity: Math.min(quantity, cart[index].stock) };
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
