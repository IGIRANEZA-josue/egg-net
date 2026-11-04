"use client";
// React hooks backed by useSyncExternalStore — the correct way to read
// browser-storage state (auth, cart, delivery notice) without setState-in-effect
// cascades. Components re-render automatically when login/cart changes,
// including changes from another tab (the "storage" event).
import { useSyncExternalStore } from "react";
import { getSavedUser, type User } from "./api";
import { getCart, cartCount, type CartItem } from "./cart";
import { getDeliveryNotice, type DeliveryNotice } from "./notice";

function subscribe(events: string[], callback: () => void) {
  for (const e of events) window.addEventListener(e, callback);
  window.addEventListener("storage", callback);
  return () => {
    for (const e of events) window.removeEventListener(e, callback);
    window.removeEventListener("storage", callback);
  };
}

const subAuth = (cb: () => void) => subscribe(["egghub-auth"], cb);
const subCart = (cb: () => void) => subscribe(["egghub-cart"], cb);
const subNotice = (cb: () => void) => subscribe(["egghub-delivery", "egghub-auth"], cb);

// undefined = still hydrating (server snapshot); null = logged out.
export function useUser(): User | null | undefined {
  return useSyncExternalStore(subAuth, getSavedUser, () => undefined);
}

export function useCartItems(): CartItem[] {
  return useSyncExternalStore(subCart, getCart, () => []);
}

export function useCartCount(): number {
  return useSyncExternalStore(subCart, cartCount, () => 0);
}

export function useDeliveryNotice(): DeliveryNotice | null {
  return useSyncExternalStore(subNotice, getDeliveryNotice, () => null);
}
