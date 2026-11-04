"use client";
// Banner at the very top of the page: "Your order is on its way."
// Appears after a logged-in customer places an order, and disappears once the
// order is delivered/cancelled (or when the customer closes it).
import { useEffect } from "react";
import Link from "next/link";
import { api } from "@/lib/client/api";
import { clearDeliveryNotice } from "@/lib/client/notice";
import { useUser, useDeliveryNotice } from "@/lib/client/hooks";

export default function DeliveryBanner() {
  const user = useUser();
  const saved = useDeliveryNotice();
  // only show it to the customer who placed the order
  const notice = saved && user && saved.customerId === user.id ? saved : null;

  // hide the banner automatically once the order is delivered or cancelled
  useEffect(() => {
    if (!notice) return;
    let cancelled = false;
    api<{ order: { orderStatus: string } }>(`/api/orders/${notice.id}`)
      .then((data) => {
        if (!cancelled && (data.order.orderStatus === "delivered" || data.order.orderStatus === "cancelled")) {
          clearDeliveryNotice();
        }
      })
      .catch(() => {}); // if it fails, just keep showing the notice
    return () => { cancelled = true; };
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
