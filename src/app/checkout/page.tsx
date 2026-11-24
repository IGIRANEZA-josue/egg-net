"use client";
// CHECKOUT PAGE: delivery details + payment method -> POST /api/orders
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, rwf, getSavedUser } from "@/lib/client/api";
import LoadingScreen from "@/components/LoadingScreen";
import { getCart, cartSubtotal, clearCart, previewDiscount, type CartItem } from "@/lib/client/cart";
import { saveDeliveryNotice } from "@/lib/client/notice";

const PROVINCES = ["Kigali City", "Northern Province", "Southern Province", "Eastern Province", "Western Province"];

export default function CheckoutPage() {
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);
  const [promotion, setPromotion] = useState<{ name: string; type: string; value: number } | null>(null);
  const [deliveryFee, setDeliveryFee] = useState(1000);
  const [paymentMethod, setPaymentMethod] = useState("mobile_money");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [needLogin, setNeedLogin] = useState(false);
  const [delivery, setDelivery] = useState({
    fullName: "", phone: "", province: "Kigali City", district: "", sector: "", address: "", instructions: "",
  });

  useEffect(() => {
    const user = getSavedUser();
    if (!user) { router.push("/login"); return; }
    const cart = getCart();
    if (cart.length === 0) { router.push("/cart"); return; }
    // Browser-only stores cannot be read during SSR, so this has to happen after
    // mount. It is a one-way hydration, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(cart);
    // Pre-fill from the profile
    setDelivery((d) => ({ ...d, fullName: user.name, phone: user.phone || "", address: user.address || "" }));
    api<{ promotion: typeof promotion; deliveryFee: number }>("/api/promotions/active")
      .then((d) => { setPromotion(d.promotion); setDeliveryFee(d.deliveryFee); })
      .catch(() => {});
  }, [router]);

  const subtotal = cartSubtotal(items);
  const discount = previewDiscount(subtotal, promotion);
  const total = subtotal + deliveryFee - discount;

  function update(field: string, value: string) {
    setDelivery({ ...delivery, [field]: value });
  }

  async function placeOrder(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // Only product IDs + quantities are sent. The server calculates prices and totals.
      const data = await api<{ order: { id: number; orderNumber: string } }>("/api/orders", {
        method: "POST",
        body: {
          items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          delivery,
          paymentMethod,
        },
      });
      // show the green "your order is being delivered" message at the top of the site
      const user = getSavedUser();
      if (user) {
        saveDeliveryNotice({ id: data.order.id, orderNumber: data.order.orderNumber, customerId: user.id });
      }
      clearCart();
      router.push(`/orders/${data.order.id}?placed=1`);
    } catch (err) {
      setError((err as Error).message);
      // If the server cannot recognise the customer, offer a one-click login
      // instead of a dead end (the cart and the form are kept).
      if (/login/i.test((err as Error).message)) setNeedLogin(true);
      setLoading(false);
    }
  }

  return (
    <div className="page container">
      <h1 className="page-title">Checkout</h1>
      {error && <div className="alert alert-error">{error}</div>}
      {needLogin && (
        <div className="alert alert-warning" style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
          <span>Your saved login has expired. Login once more and your order will go through — your cart is kept.</span>
          <Link href="/login?next=/checkout" className="btn btn-sm btn-primary">Login and continue</Link>
        </div>
      )}
      {loading && <LoadingScreen label="Placing your order" full />}

      <form onSubmit={placeOrder} className="layout-2">
        <div className="card form">
          <h3>Delivery Information</h3>
          <div className="form-row">
            <div><label>Full name</label><input value={delivery.fullName} onChange={(e) => update("fullName", e.target.value)} required /></div>
            <div><label>Phone number</label><input value={delivery.phone} onChange={(e) => update("phone", e.target.value)} required placeholder="07XXXXXXXX" /></div>
          </div>
          <div className="form-row">
            <div>
              <label>Province</label>
              <select value={delivery.province} onChange={(e) => update("province", e.target.value)}>
                {PROVINCES.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div><label>District</label><input value={delivery.district} onChange={(e) => update("district", e.target.value)} required placeholder="e.g. Gasabo" /></div>
          </div>
          <div className="form-row">
            <div><label>Sector</label><input value={delivery.sector} onChange={(e) => update("sector", e.target.value)} required placeholder="e.g. Remera" /></div>
            <div><label>Delivery address</label><input value={delivery.address} onChange={(e) => update("address", e.target.value)} required placeholder="Street / house / landmark" /></div>
          </div>
          <div><label>Additional instructions (optional)</label><textarea value={delivery.instructions} onChange={(e) => update("instructions", e.target.value)} /></div>

          <h3 style={{ marginTop: "1rem" }}>Payment Method</h3>
          <label className="checkbox"><input type="radio" name="pay" checked={paymentMethod === "mobile_money"} onChange={() => setPaymentMethod("mobile_money")} /> Mobile Money (MTN / Airtel)</label>
          <label className="checkbox"><input type="radio" name="pay" checked={paymentMethod === "cash"} onChange={() => setPaymentMethod("cash")} /> Cash on Delivery</label>
          <label className="checkbox"><input type="radio" name="pay" checked={paymentMethod === "card"} onChange={() => setPaymentMethod("card")} /> Card</label>
          <div className="alert alert-warning" style={{ marginTop: 8 }}>
            Development mode: no real payment provider is connected. Mobile Money and Card use a test flow that marks the order as paid. Cash stays pending until delivery.
          </div>
        </div>

        <div className="card">
          <h3>Order Summary</h3>
          {items.map((i) => (
            <div className="summary-row" key={i.productId}>
              <span>{i.name} × {i.quantity}</span><span>{rwf(i.price * i.quantity)}</span>
            </div>
          ))}
          <hr style={{ border: 0, borderTop: "1px solid var(--border)" }} />
          <div className="summary-row"><span>Products</span><span>{rwf(subtotal)}</span></div>
          <div className="summary-row"><span>Delivery</span><span>{rwf(deliveryFee)}</span></div>
          <div className="summary-row"><span>Discount {promotion && <small className="badge">{promotion.name}</small>}</span><span>- {rwf(discount)}</span></div>
          <div className="summary-row summary-total"><span>Total</span><span>{rwf(total)}</span></div>
          <button className="btn btn-primary btn-block" style={{ marginTop: "1rem" }} disabled={loading}>
            {loading ? "Placing order..." : "Place Order"}
          </button>
        </div>
      </form>
    </div>
  );
}
