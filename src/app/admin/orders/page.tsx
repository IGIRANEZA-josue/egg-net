"use client";
// ADMIN ORDERS: list all orders, filter by status, view details, update order/payment status
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api, rwf, formatDate, statusLabel } from "@/lib/client/api";
import StatusBadge from "@/components/StatusBadge";

type Order = {
  id: number; orderNumber: string; customerName: string; phone: string; total: number;
  paymentMethod: string; paymentStatus: string; orderStatus: string; createdAt: string;
  province: string; district: string; sector: string; address: string; instructions: string | null;
  subtotal: number; deliveryFee: number; discount: number;
};
type Item = { id: number; productName: string; price: number; quantity: number };

const ORDER_STATUSES = ["pending", "confirmed", "preparing", "out_for_delivery", "delivered", "cancelled"];
const PAYMENT_STATUSES = ["pending", "paid", "failed"];

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Order | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [message, setMessage] = useState("");

  const load = useCallback(() => {
    api<{ orders: Order[] }>(`/api/admin/orders${filter ? `?status=${filter}` : ""}`).then((d) => setOrders(d.orders));
  }, [filter]);
  useEffect(load, [load]);

  async function openOrder(order: Order) {
    const d = await api<{ order: Order; items: Item[] }>(`/api/orders/${order.id}`);
    setSelected(d.order);
    setItems(d.items);
  }

  async function updateStatus(field: "orderStatus" | "paymentStatus", value: string) {
    if (!selected) return;
    setMessage("");
    try {
      const d = await api<{ order: Order }>(`/api/orders/${selected.id}/status`, { method: "PUT", body: { [field]: value } });
      setSelected(d.order);
      setMessage("Status updated ✓");
      load();
    } catch (e) { setMessage((e as Error).message); }
  }

  return (
    <>
      <div className="admin-header">
        <h1 className="page-title" style={{ margin: 0 }}>Orders</h1>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 200 }}>
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
        </select>
      </div>

      <div className="layout-2">
        <div className="card table-wrap" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Payment</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} style={{ background: selected?.id === o.id ? "var(--green-light)" : undefined }}>
                  <td><strong>#{o.orderNumber}</strong><br /><small className="muted">{formatDate(o.createdAt)}</small></td>
                  <td>{o.customerName}<br /><small className="muted">{o.phone}</small></td>
                  <td>{rwf(o.total)}</td>
                  <td><StatusBadge status={o.paymentStatus} /></td>
                  <td><StatusBadge status={o.orderStatus} /></td>
                  <td><button className="btn btn-outline btn-sm" onClick={() => openOrder(o)}>View</button></td>
                </tr>
              ))}
              {orders.length === 0 && <tr><td colSpan={6} className="muted">No orders found.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="card">
          {!selected ? <p className="muted">Select an order to see details and update its status.</p> : (
            <>
              <h3>Order #{selected.orderNumber}</h3>
              <p className="muted">{formatDate(selected.createdAt)}</p>
              {message && <div className={`alert ${message.includes("✓") ? "alert-success" : "alert-error"}`}>{message}</div>}

              <label>Order status</label>
              <select value={selected.orderStatus} onChange={(e) => updateStatus("orderStatus", e.target.value)}>
                {ORDER_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
              </select>
              <label style={{ marginTop: 10 }}>Payment status ({statusLabel(selected.paymentMethod)})</label>
              <select value={selected.paymentStatus} onChange={(e) => updateStatus("paymentStatus", e.target.value)}>
                {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
              </select>

              <h3 style={{ marginTop: "1rem" }}>Products</h3>
              {items.map((i) => (
                <div className="summary-row" key={i.id}><span>{i.productName} × {i.quantity}</span><span>{rwf(i.price * i.quantity)}</span></div>
              ))}
              <div className="summary-row"><span>Delivery</span><span>{rwf(selected.deliveryFee)}</span></div>
              <div className="summary-row"><span>Discount</span><span>- {rwf(selected.discount)}</span></div>
              <div className="summary-row summary-total"><span>Total</span><span>{rwf(selected.total)}</span></div>

              <h3 style={{ marginTop: "1rem" }}>Delivery</h3>
              <p>{selected.customerName} · {selected.phone}<br />{selected.address}, {selected.sector}, {selected.district}, {selected.province}</p>
              {selected.instructions && <p><em>{selected.instructions}</em></p>}
              <Link href={`/orders/${selected.id}/invoice`} className="btn btn-outline btn-sm">Print Invoice</Link>
            </>
          )}
        </div>
      </div>
    </>
  );
}
