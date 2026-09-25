"use client";
// Small helper to show a "your order is being delivered" notice at the top of the site.
// It is saved in localStorage (like the cart) so it can appear on every page after checkout.

export type DeliveryNotice = {
  id: number;
  orderNumber: string;
  customerId: number; // only the customer who placed the order sees the notice
};

const KEY = "egghub_delivery_notice";

export function saveDeliveryNotice(notice: DeliveryNotice) {
  localStorage.setItem(KEY, JSON.stringify(notice));
  window.dispatchEvent(new Event("egghub-delivery"));
}

export function getDeliveryNotice(): DeliveryNotice | null {
  const raw = localStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as DeliveryNotice) : null;
}

export function clearDeliveryNotice() {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("egghub-delivery"));
}
