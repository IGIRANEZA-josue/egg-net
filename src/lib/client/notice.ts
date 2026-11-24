"use client";
// Small helper to show a "your order is being delivered" notice at the top of the site.
// It is saved in localStorage (like the cart) so it can appear on every page after checkout.

import { safeRead, safeRemove, safeWrite } from "./storage";

export type DeliveryNotice = {
  id: number;
  orderNumber: string;
  customerId: number; // only the customer who placed the order sees the notice
  // "pickup" orders are collected, not delivered, so the banner must not say
  // the order is on its way.
  method?: "delivery" | "pickup";
};

const KEY = "egghub_delivery_notice";

export function saveDeliveryNotice(notice: DeliveryNotice) {
  safeWrite(KEY, notice);
  window.dispatchEvent(new Event("egghub-delivery"));
}

export function getDeliveryNotice(): DeliveryNotice | null {
  return safeRead<DeliveryNotice>(KEY, (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const notice = value as Record<string, unknown>;
    if (!Number.isSafeInteger(notice.id) || typeof notice.orderNumber !== "string") return null;
    return {
      id: notice.id as number,
      orderNumber: notice.orderNumber,
      customerId: Number(notice.customerId) || 0,
      method: notice.method === "pickup" ? "pickup" : "delivery",
    };
  });
}

export function clearDeliveryNotice() {
  safeRemove(KEY);
  window.dispatchEvent(new Event("egghub-delivery"));
}
