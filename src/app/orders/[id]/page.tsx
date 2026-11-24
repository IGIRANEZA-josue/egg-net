"use client";
// ORDER DETAILS PAGE: confirmation, tracking, items, invoice link, reviews
import { useEffect, useState, useCallback, Suspense } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, rwf, formatDate, statusLabel, getSavedUser } from "@/lib/client/api";
import StatusBadge from "@/components/StatusBadge";
import OrderTracker from "@/components/OrderTracker";
import { PICKUP, DELIVERY_RADIUS_KM } from "@/lib/fulfilment";

type OrderData = {
  id: number; orderNumber: string; createdAt: string; customerName: string; phone: string;
  province: string; district: string; sector: string; address: string; instructions: string | null;
  fulfilmentMethod: string; distanceKm: number | null;
  subtotal: number; deliveryFee: number; discount: number; total: number;
  paymentMethod: string; paymentStatus: string; orderStatus: string;
};
type OrderItem = { id: number; productId: number; productName: string; price: number; quantity: number };

function OrderDetailsContent() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const justPlaced = searchParams.get("placed") === "1";
  const [order, setOrder] = useState<OrderData | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [reviewed, setReviewed] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [reviewForm, setReviewForm] = useState<{ productId: number; rating: number; comment: string } | null>(null);
  const [reviewMessage, setReviewMessage] = useState("");

  const load = useCallback(() => {
    api<{ order: OrderData; items: OrderItem[]; reviewedProductIds: number[] }>(`/api/orders/${id}`)
      .then((d) => { setOrder(d.order); setItems(d.items); setReviewed(d.reviewedProductIds); })
      .catch((err) => setError(err.message));
  }, [id]);

  useEffect(() => {
    if (!getSavedUser()) { router.push("/login"); return; }
    load();
  }, [load, router]);

  async function submitReview(e: React.FormEvent) {
    e.preventDefault();
    if (!reviewForm || !order) return;
    setReviewMessage("");
    try {
      await api("/api/reviews", { method: "POST", body: { orderId: order.id, ...reviewForm } });
      setReviewMessage("Thank you for your review ✓");
      setReviewForm(null);
      load();
    } catch (err) {
      setReviewMessage((err as Error).message);
    }
  }

  if (error) return <div className="page container"><div className="alert alert-error">{error}</div></div>;
  if (!order) return <div className="page container"><p className="muted">Loading...</p></div>;

  return (
    <div className="page container">
      {justPlaced && (
        <div className="alert alert-delivery">
          Your order is coming. Order number: <strong>#{order.orderNumber}</strong>
        </div>
      )}
      <div className="admin-header">
        <h1 className="page-title" style={{ margin: 0 }}>Order #{order.orderNumber}</h1>
        <Link href={`/orders/${order.id}/invoice`} className="btn btn-outline">View Invoice</Link>
      </div>

      <div className="layout-2">
        <div>
          <div className="card" style={{ marginBottom: "1.25rem" }}>
            <h3>Order Tracking</h3>
            <p>Current status: <StatusBadge status={order.orderStatus} /></p>
            <OrderTracker status={order.orderStatus} />
          </div>

          <div className="card">
            <h3>Products</h3>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Product</th><th>Price</th><th>Qty</th><th>Subtotal</th>{order.orderStatus === "delivered" && <th>Review</th>}</tr></thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.productName}</td>
                      <td>{rwf(item.price)}</td>
                      <td>{item.quantity}</td>
                      <td>{rwf(item.price * item.quantity)}</td>
                      {order.orderStatus === "delivered" && (
                        <td>
                          {reviewed.includes(item.productId) ? <span className="badge">Reviewed</span> : (
                            <button className="btn btn-outline btn-sm" onClick={() => setReviewForm({ productId: item.productId, rating: 5, comment: "" })}>Write review</button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {reviewMessage && <div className={`alert ${reviewMessage.includes("✓") ? "alert-success" : "alert-error"}`} style={{ marginTop: 12 }}>{reviewMessage}</div>}
            {reviewForm && (
              <form className="form" onSubmit={submitReview} style={{ marginTop: "1rem", borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
                <h3>Your review</h3>
                <div>
                  <label>Rating</label>
                  <select value={reviewForm.rating} onChange={(e) => setReviewForm({ ...reviewForm, rating: Number(e.target.value) })}>
                    {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)} ({n})</option>)}
                  </select>
                </div>
                <div><label>Comment</label><textarea value={reviewForm.comment} onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })} /></div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-primary">Submit Review</button>
                  <button type="button" className="btn btn-outline" onClick={() => setReviewForm(null)}>Cancel</button>
                </div>
              </form>
            )}
          </div>
        </div>

        <div className="card">
          <h3>Summary</h3>
          <p className="muted">{formatDate(order.createdAt)}</p>
          <div className="summary-row"><span>Subtotal</span><span>{rwf(order.subtotal)}</span></div>
          <div className="summary-row">
            <span>{order.fulfilmentMethod === "pickup" ? "Pickup handling" : "Delivery"}</span>
            <span>{rwf(order.deliveryFee)}</span>
          </div>
          <div className="summary-row"><span>Discount</span><span>- {rwf(order.discount)}</span></div>
          <div className="summary-row summary-total"><span>Total</span><span>{rwf(order.total)}</span></div>
          <hr style={{ border: 0, borderTop: "1px solid var(--border)", margin: "1rem 0" }} />
          <p><strong>Payment:</strong> {statusLabel(order.paymentMethod)} · <StatusBadge status={order.paymentStatus} /></p>
          {order.fulfilmentMethod === "pickup" ? (
            <div className="pickup-block">
              <p><strong>Collect from:</strong> {PICKUP.name}<br />{PICKUP.cell} cell, {PICKUP.sector} sector, {PICKUP.district}<br />{PICKUP.hours}</p>
              <p className="muted small">
                {PICKUP.directions}
                {typeof order.distanceKm === "number"
                  ? ` Your order was placed ${order.distanceKm} km away, outside our ${DELIVERY_RADIUS_KM} km delivery area.`
                  : " We could not confirm your location, so this order is for collection."}
              </p>
            </div>
          ) : (
            <p><strong>Deliver to:</strong><br />{order.customerName}<br />{order.phone}<br />{order.address}, {order.sector}, {order.district}, {order.province}</p>
          )}
          {order.instructions && <p><strong>Instructions:</strong> {order.instructions}</p>}
        </div>
      </div>
    </div>
  );
}

// useSearchParams must be inside a Suspense boundary in Next.js
export default function OrderDetailsPage() {
  return (
    <Suspense fallback={<div className="page container"><p className="muted">Loading...</p></div>}>
      <OrderDetailsContent />
    </Suspense>
  );
}
