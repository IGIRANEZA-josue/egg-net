"use client";
// INVOICE / RECEIPT PAGE - print friendly (use the browser "Print" -> "Save as PDF")
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, rwf, formatDate, statusLabel, getSavedUser } from "@/lib/client/api";

type Order = {
  id: number; orderNumber: string; createdAt: string; customerName: string; phone: string;
  province: string; district: string; sector: string; address: string;
  subtotal: number; deliveryFee: number; discount: number; total: number;
  paymentMethod: string; paymentStatus: string; orderStatus: string;
};
type Item = { id: number; productName: string; price: number; quantity: number };

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getSavedUser()) { router.push("/login"); return; }
    api<{ order: Order; items: Item[] }>(`/api/orders/${id}`)
      .then((d) => { setOrder(d.order); setItems(d.items); })
      .catch((err) => setError(err.message));
  }, [id, router]);

  if (error) return <div className="page container"><div className="alert alert-error">{error}</div></div>;
  if (!order) return <div className="page container"><p className="muted">Loading...</p></div>;

  return (
    <div className="page container">
      <div className="no-print" style={{ maxWidth: 760, margin: "0 auto 1rem", display: "flex", gap: 8 }}>
        <button className="btn btn-primary" onClick={() => window.print()}>Print / Save as PDF</button>
        <button className="btn btn-outline" onClick={() => router.back()}>Back</button>
      </div>

      <div className="invoice">
        <div className="invoice-header">
          <div>
            <h2>EggHub Rwanda</h2>
            <p className="muted">Fresh Eggs. Easy Ordering. Reliable Delivery.<br />Kigali, Rwanda · +250 788 000 000</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <h3>INVOICE</h3>
            <p>Order #{order.orderNumber}<br />{formatDate(order.createdAt)}</p>
          </div>
        </div>

        <div className="grid grid-2" style={{ marginBottom: "1rem" }}>
          <div>
            <strong>Customer</strong>
            <p>{order.customerName}<br />{order.phone}</p>
          </div>
          <div>
            <strong>Delivery address</strong>
            <p>{order.address}<br />{order.sector}, {order.district}<br />{order.province}</p>
          </div>
        </div>

        <table>
          <thead><tr><th>Product</th><th>Quantity</th><th>Price</th><th>Subtotal</th></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}><td>{i.productName}</td><td>{i.quantity}</td><td>{rwf(i.price)}</td><td>{rwf(i.price * i.quantity)}</td></tr>
            ))}
          </tbody>
        </table>

        <div style={{ maxWidth: 320, marginLeft: "auto", marginTop: "1rem" }}>
          <div className="summary-row"><span>Subtotal</span><span>{rwf(order.subtotal)}</span></div>
          <div className="summary-row"><span>Delivery fee</span><span>{rwf(order.deliveryFee)}</span></div>
          <div className="summary-row"><span>Discount</span><span>- {rwf(order.discount)}</span></div>
          <div className="summary-row summary-total"><span>Total</span><span>{rwf(order.total)}</span></div>
        </div>

        <div style={{ marginTop: "1.5rem", borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
          <p><strong>Payment method:</strong> {statusLabel(order.paymentMethod)}</p>
          <p><strong>Payment status:</strong> {statusLabel(order.paymentStatus)}</p>
          <p><strong>Order status:</strong> {statusLabel(order.orderStatus)}</p>
          <p className="muted" style={{ marginTop: "1rem" }}>Thank you for shopping with EggHub Rwanda.</p>
        </div>
      </div>
    </div>
  );
}
