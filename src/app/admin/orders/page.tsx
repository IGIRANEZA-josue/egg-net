"use client";
// ADMIN ORDERS: list all orders, filter by status, view details, update order/payment status
import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, rwf, formatDate, statusLabel } from "@/lib/client/api";
import StatusBadge from "@/components/StatusBadge";
import { PICKUP, DELIVERY_RADIUS_KM } from "@/lib/fulfilment";

type Order = {
  id: number; orderNumber: string; customerName: string; phone: string; total: number;
  paymentMethod: string; paymentStatus: string; orderStatus: string; createdAt: string;
  cancellationReason: string | null; refundRequired: boolean;
  province: string; district: string; sector: string; address: string; instructions: string | null;
  fulfilmentMethod: string; distanceKm: number | null;
  subtotal: number; deliveryFee: number; discount: number;
};
type Item = { id: number; productName: string; price: number; quantity: number };

const ORDER_STATUSES = ["pending", "confirmed", "preparing", "out_for_delivery", "delivered", "cancelled"];
// Mirrors the server's table in /api/orders/[id]/status. The UI offers only the
// legal next states so the admin is never surprised by a 409.
const ORDER_TRANSITIONS: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["out_for_delivery", "cancelled"],
  out_for_delivery: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};
const PAYMENT_STATUSES = ["pending", "paid", "failed"];

function AdminOrdersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Order | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [message, setMessage] = useState("");
  const [pendingCancel, setPendingCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const load = useCallback(() => {
    setError("");
    api<{ orders: Order[]; total: number }>(`/api/admin/orders?pageSize=200${filter ? `&status=${filter}` : ""}`)
      .then((d) => setOrders(d.orders))
      .catch((e) => setError((e as Error).message));
  }, [filter]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(load, [load]);

  const openOrder = useCallback(async (orderId: number) => {
    try {
      const d = await api<{ order: Order; items: Item[] }>(`/api/orders/${orderId}`);
      setSelected(d.order);
      setItems(d.items);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  // The dashboard links here with ?id=<order>. Previously the parameter was
  // ignored, so the admin landed on an unselected list.
  // Fetching in an effect is a legitimate side effect (it talks to the server);
  // the rule cannot tell it apart from a render cascade.
  const deepLinkId = Number(searchParams.get("id"));
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (Number.isSafeInteger(deepLinkId) && deepLinkId > 0) void openOrder(deepLinkId);
  }, [deepLinkId, openOrder]);

  function selectOrder(order: Order) {
    void openOrder(order.id);
    // Keep the URL shareable without adding a history entry per click.
    router.replace(`/admin/orders?id=${order.id}${filter ? `&status=${filter}` : ""}`, { scroll: false });
  }

  // Cancelling needs a reason, and the server restocks inside a transaction.
  function requestStatusChange(field: "orderStatus", value: string) {
    if (field === "orderStatus" && value === "cancelled") {
      setPendingCancel(true);
      return;
    }
    void updateStatus(field, value);
  }

  async function updateStatus(field: "orderStatus" | "paymentStatus", value: string, reason?: string) {
    if (!selected) return;
    setMessage("");
    try {
      const d = await api<{ order: Order }>(`/api/orders/${selected.id}/status`, {
        method: "PUT",
        body: { [field]: value, ...(reason ? { reason } : {}) },
      });
      setPendingCancel(false);
      setCancelReason("");
      setSelected(d.order);
      setMessage("Status updated ✓");
      load();
    } catch (e) {
      setMessage((e as Error).message);
      // Put the select back on the real value when the server refused.
      const refreshed = await api<{ order: Order }>(`/api/orders/${selected.id}`).catch(() => null);
      if (refreshed) setSelected(refreshed.order);
    }
  }

  return (
    <>
      <div className="admin-header">
        <h1 className="page-title" style={{ margin: 0 }}>Orders</h1>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="admin-filter">
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
        </select>
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}

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
                  <td><button className="btn btn-outline btn-sm" onClick={() => selectOrder(o)}>View</button></td>
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

              <label htmlFor="order-status">Order status</label>
              <select id="order-status" value={selected.orderStatus} onChange={(e) => requestStatusChange("orderStatus", e.target.value)}>
                {/* Only the legal next states are offered - the API rejects the rest. */}
                <option value={selected.orderStatus}>{statusLabel(selected.orderStatus)}</option>
                {ORDER_TRANSITIONS[selected.orderStatus]?.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
              </select>
              {pendingCancel && (
                <div className="alert alert-warning" style={{ marginTop: 8 }}>
                  <p style={{ marginTop: 0 }}>Why is this order being cancelled? The stock goes back to inventory.</p>
                  <input
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="e.g. Customer asked to cancel"
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={() => updateStatus("orderStatus", "cancelled", cancelReason)} disabled={!cancelReason.trim()}>
                      Confirm cancellation
                    </button>
                    <button className="btn btn-outline btn-sm" onClick={() => { setPendingCancel(false); setCancelReason(""); }}>
                      Keep order
                    </button>
                  </div>
                </div>
              )}
              {selected.refundRequired && (
                <div className="alert alert-error" style={{ marginTop: 8 }} role="alert">
                  This order was paid and then cancelled — a refund is owed to the customer.
                </div>
              )}
              {selected.cancellationReason && (
                <p className="muted" style={{ marginTop: 8 }}>Cancelled: {selected.cancellationReason}</p>
              )}
              <label htmlFor="payment-status" style={{ marginTop: 10 }}>Payment status ({statusLabel(selected.paymentMethod)})</label>
              <select id="payment-status" value={selected.paymentStatus} onChange={(e) => updateStatus("paymentStatus", e.target.value)}>
                {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
              </select>

              <h3 style={{ marginTop: "1rem" }}>Products</h3>
              {items.map((i) => (
                <div className="summary-row" key={i.id}><span>{i.productName} × {i.quantity}</span><span>{rwf(i.price * i.quantity)}</span></div>
              ))}
              <div className="summary-row">
                <span>{selected.fulfilmentMethod === "pickup" ? "Pickup handling" : "Delivery"}</span>
                <span>{rwf(selected.deliveryFee)}</span>
              </div>
              <div className="summary-row"><span>Discount</span><span>- {rwf(selected.discount)}</span></div>
              <div className="summary-row summary-total"><span>Total</span><span>{rwf(selected.total)}</span></div>

              <h3 style={{ marginTop: "1rem" }}>
                {selected.fulfilmentMethod === "pickup" ? "Collection" : "Delivery"}
              </h3>
              {selected.fulfilmentMethod === "pickup" ? (
                <div className="alert alert-warning" style={{ marginBottom: "0.75rem" }}>
                  <strong>Pickup — do not dispatch a rider.</strong> Customer collects at {PICKUP.name}.
                  {typeof selected.distanceKm === "number"
                    ? ` They were ${selected.distanceKm} km away (limit ${DELIVERY_RADIUS_KM} km).`
                    : " No location was given."}
                </div>
              ) : (
                <p>
                  {selected.distanceKm != null ? `${selected.distanceKm} km from ${PICKUP.name}. ` : ""}
                  {selected.address}, {selected.sector}, {selected.district}, {selected.province}
                </p>
              )}
              <p>{selected.customerName} · {selected.phone}</p>
              {selected.instructions && <p><em>{selected.instructions}</em></p>}
              <Link href={`/orders/${selected.id}/invoice`} className="btn btn-outline btn-sm">Print Invoice</Link>
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default function AdminOrdersPage() {
  // useSearchParams needs a Suspense boundary during static prerendering.
  return (
    <Suspense fallback={<p className="muted">Loading orders...</p>}>
      <AdminOrdersContent />
    </Suspense>
  );
}
