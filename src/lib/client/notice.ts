"use client";
// "Your order is on its way" notice shown at the top of the site after checkout.
// Saved in localStorage (like the cart) so it can appear on every page.

export type DeliveryNotice = {
  id: number;
  orderNumber: string;
  customerId: number; // only the customer who placed the order sees the notice
};

const KEY = "egghub_delivery_notice";

let cachedRaw: string | null | undefined;
let cachedNotice: DeliveryNotice | null = null;

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveDeliveryNotice(notice: DeliveryNotice) {
  const raw = JSON.stringify(notice);
  try {
    window.localStorage.setItem(KEY, raw);
  } catch {
    // storage blocked — the in-memory copy still works for this session
  }
  cachedRaw = raw;
  cachedNotice = notice;
  window.dispatchEvent(new Event("egghub-delivery"));
}

export function getDeliveryNotice(): DeliveryNotice | null {
  if (typeof window === "undefined") return null;
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedNotice = raw ? (JSON.parse(raw) as DeliveryNotice) : null;
    } catch {
      cachedNotice = null;
    }
  }
  return cachedNotice;
}

export function clearDeliveryNotice() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  cachedRaw = null;
  cachedNotice = null;
  window.dispatchEvent(new Event("egghub-delivery"));
}
