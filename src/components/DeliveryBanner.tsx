"use client";
// Green banner at the very top of the page: "Your order is being delivered."
// Appears after a logged-in customer places an order, and disappears once the
// order is delivered (or when the customer closes it).
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, getSavedUser } from "@/lib/client/api";
import { getDeliveryNotice, clearDeliveryNotice, type DeliveryNotice } from "@/lib/client/notice";

export default function DeliveryBanner() {
  const [notice, setNotice] = useState<DeliveryNotice | null>(null);

  useEffect(() => {
    function refresh() {
      const saved = getDeliveryNotice();
      const user = getSavedUser();
      // only show it to the customer who placed the order
      if (saved && user && saved.customerId === user.id) setNotice(saved);
      else setNotice(null);
    }
    refresh();
    window.addEventListener("egghub-delivery", refresh);
    window.addEventListener("egghub-auth", refresh);
    return () => {
      window.removeEventListener("egghub-delivery", refresh);
      window.removeEventListener("egghub-auth", refresh);
    };
  }, []);

  // hide the banner automatically once the order is delivered or cancelled
  useEffect(() => {
    if (!notice) return;
    api<{ order: { orderStatus: string } }>(`/api/orders/${notice.id}`)
      .then((data) => {
        if (data.order.orderStatus === "delivered" || data.order.orderStatus === "cancelled") {
          clearDeliveryNotice();
        }
      })
      .catch(() => {}); // if it fails, just keep showing the notice
  }, [notice]);

  if (!notice) return null;

  return (
    <div className="delivery-notice" role="status">
      <div className="container delivery-notice-inner">
        <p>
          <strong>Your order is coming</strong>
          <span className="delivery-notice-meta">Order #{notice.orderNumber}</span>
        </p>
        <Link href={`/orders/${notice.id}`}>Track order</Link>
        <button onClick={clearDeliveryNotice} aria-label="Close message">×</button>
      </div>
    </div>
  );
}
