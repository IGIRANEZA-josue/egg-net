"use client";
// CHECKOUT PAGE: confirm where you are, then delivery details + payment.
//
// The order is either DELIVERED (inside the radius around EPR Karugira) or
// COLLECTED at EPR Karugira. The customer's coordinates decide which, and the
// same rule runs again on the server (src/lib/fulfilment.ts) - the screen can
// only ever show what the server will charge.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, rwf, getSavedUser } from "@/lib/client/api";
import LoadingScreen from "@/components/LoadingScreen";
import { getCart, cartSubtotal, clearCart, previewDiscount, type CartItem } from "@/lib/client/cart";
import { saveDeliveryNotice } from "@/lib/client/notice";
import {
  decideFulfilment,
  PICKUP,
  DELIVERY_RADIUS_KM,
  type FulfilmentDecision,
} from "@/lib/fulfilment";

const PROVINCES = ["Kigali City", "Northern Province", "Southern Province", "Eastern Province", "Western Province"];

type Coords = { latitude: number; longitude: number } | null;
type LocationState = "unknown" | "locating" | "found" | "denied" | "unsupported" | "manual";

export default function CheckoutPage() {
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);
  const [promotion, setPromotion] = useState<{ name: string; type: string; value: number } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("mobile_money");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [needLogin, setNeedLogin] = useState(false);

  // ---- location ----
  const [coords, setCoords] = useState<Coords>(null);
  const [locationState, setLocationState] = useState<LocationState>("unknown");
  const [locationNote, setLocationNote] = useState("");
  const [pickupAcknowledged, setPickupAcknowledged] = useState(false);

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
    setDelivery((d) => ({ ...d, fullName: user.name, phone: user.phone || "", address: user.address || "" }));
    api<{ promotion: typeof promotion }>("/api/promotions/active")
      .then((d) => setPromotion(d.promotion))
      .catch(() => {});
  }, [router]);

  // Derived, not stored: the decision always follows the coordinates and can
  // never drift out of sync. The server recomputes it from the same helper.
  const fulfilment: FulfilmentDecision = decideFulfilment(coords ?? {});

  function useMyLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationState("unsupported");
      setLocationNote("This browser cannot share a location. Enter the coordinates below, or collect your order.");
      return;
    }
    setLocationState("locating");
    setLocationNote("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = {
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6)),
        };
        setCoords(next);
        setPickupAcknowledged(false);
        setLocationState("found");
        setLocationNote(`Location confirmed, accurate to about ${Math.round(position.coords.accuracy)} m.`);
      },
      (err) => {
        setCoords(null);
        setLocationState("denied");
        setLocationNote(
          err.code === err.PERMISSION_DENIED
            ? "Location permission was refused. Allow it in your browser, paste coordinates below, or collect your order."
            : "We could not get a location fix. Try again, paste coordinates below, or collect your order."
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  }

  function setManual(field: "latitude" | "longitude", raw: string) {
    const value = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(value)) {
      setCoords(null);
      setLocationState("manual");
      return;
    }
    const next = { ...(coords ?? { latitude: 0, longitude: 0 }), [field]: value };
    setCoords(next);
    setLocationState("manual");
  }

  const subtotal = cartSubtotal(items);
  const discount = previewDiscount(subtotal, promotion);
  const isPickup = fulfilment.method === "pickup";
  const fee = fulfilment.fee;
  const total = subtotal + fee - discount;
  const canPlace = !loading && (!isPickup || pickupAcknowledged);

  function update(field: string, value: string) {
    setDelivery({ ...delivery, [field]: value });
  }

  async function placeOrder(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (isPickup && !pickupAcknowledged) {
      setError(`Please confirm that you will collect your order at ${PICKUP.name}.`);
      return;
    }
    setLoading(true);
    try {
      // Only product IDs + quantities are sent. The server calculates prices,
      // the fee and the delivery/pickup decision.
      const data = await api<{ order: { id: number; orderNumber: string } }>("/api/orders", {
        method: "POST",
        body: {
          items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          delivery: {
            ...delivery,
            latitude: coords?.latitude ?? null,
            longitude: coords?.longitude ?? null,
            pickupAcknowledged,
          },
          paymentMethod,
        },
      });
      // The green banner reads differently for a pickup order.
      const user = getSavedUser();
      if (user) {
        saveDeliveryNotice({
          id: data.order.id,
          orderNumber: data.order.orderNumber,
          customerId: user.id,
          method: isPickup ? "pickup" : "delivery",
        });
      }
      clearCart();
      router.push(`/orders/${data.order.id}?placed=1`);
    } catch (err) {
      setError((err as Error).message);
      if (/login/i.test((err as Error).message)) setNeedLogin(true);
      setLoading(false);
    }
  }

  return (
    <div className="page container">
      <h1 className="page-title">Checkout</h1>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {needLogin && (
        <div className="alert alert-warning" style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
          <span>Your saved login has expired. Login once more and your order will go through — your cart is kept.</span>
          <Link href="/login?next=/checkout" className="btn btn-sm btn-primary">Login and continue</Link>
        </div>
      )}
      {loading && <LoadingScreen label="Placing your order" full />}

      <form onSubmit={placeOrder} className="layout-2">
        <div className="form">
          {/* ---------- 1. LOCATION: the rule that decides everything below ---------- */}
          <section className={`card location-card ${isPickup ? "is-pickup" : fulfilment ? "is-delivery" : ""}`} aria-labelledby="loc-title">
            <div className="location-head">
              <span className="step-num">1</span>
              <h3 id="loc-title">Where are you?</h3>
            </div>
            <p className="muted location-lead">
              We deliver up to <strong>{DELIVERY_RADIUS_KM} km</strong> from {PICKUP.name}. Further than that,
              your order waits for you at {PICKUP.name} in {PICKUP.sector}, {PICKUP.district}.
            </p>

            <div className="location-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={useMyLocation}
                disabled={locationState === "locating"}
              >
                {locationState === "locating" ? "Finding you…" : "Use my location"}
              </button>
              {coords && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => { setCoords(null); setPickupAcknowledged(false); setLocationState("unknown"); setLocationNote(""); }}
                >
                  Clear
                </button>
              )}
            </div>

            {locationState !== "found" && (
              <details className="location-manual">
                <summary>My location is not working — enter coordinates</summary>
                <div className="form-row">
                  <div>
                    <label htmlFor="lat">Latitude</label>
                    <input
                      id="lat" inputMode="decimal" placeholder="-1.9702"
                      defaultValue={coords?.latitude ?? ""}
                      onChange={(e) => setManual("latitude", e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="lon">Longitude</label>
                    <input
                      id="lon" inputMode="decimal" placeholder="30.0771"
                      defaultValue={coords?.longitude ?? ""}
                      onChange={(e) => setManual("longitude", e.target.value)}
                    />
                  </div>
                </div>
                <p className="muted small">On Google Maps, press and hold your spot, then copy the two numbers.</p>
              </details>
            )}

            {locationNote && <p className="muted location-note" role="status">{locationNote}</p>}

            <div className={`fulfilment-result ${isPickup ? "pickup" : "delivery"}`} role="status">
              <strong>{isPickup ? `Pickup at ${PICKUP.name}` : "Delivery"}</strong>
              <p>{fulfilment.message}</p>
              {isPickup && (
                <div className="pickup-details">
                  <p><strong>Collect from:</strong> {PICKUP.name}, {PICKUP.cell} cell, {PICKUP.sector} sector, {PICKUP.district}.</p>
                  <p><strong>Directions:</strong> {PICKUP.directions}</p>
                  <p><strong>Open:</strong> {PICKUP.hours} · {PICKUP.phone}</p>
                </div>
              )}
            </div>

            {isPickup && (
              <label className="checkbox pickup-confirm">
                <input
                  type="checkbox"
                  checked={pickupAcknowledged}
                  onChange={(e) => setPickupAcknowledged(e.target.checked)}
                />
                I understand this order will not be delivered, and I will collect it at {PICKUP.name}.
              </label>
            )}
          </section>

          {/* ---------- 2. CONTACT + ADDRESS ---------- */}
          <section className="card form" aria-labelledby="addr-title">
            <div className="location-head">
              <span className="step-num">2</span>
              <h3 id="addr-title">{isPickup ? "Your details" : "Delivery information"}</h3>
            </div>
            <div className="form-row">
              <div><label htmlFor="co-name">Full name</label><input id="co-name" autoComplete="name" value={delivery.fullName} onChange={(e) => update("fullName", e.target.value)} required /></div>
              <div><label htmlFor="co-phone">Phone number</label><input id="co-phone" autoComplete="tel" value={delivery.phone} onChange={(e) => update("phone", e.target.value)} required placeholder="07XXXXXXXX" /></div>
            </div>
            <div className="form-row">
              <div>
                <label htmlFor="co-province">Province</label>
                <select id="co-province" value={delivery.province} onChange={(e) => update("province", e.target.value)}>
                  {PROVINCES.map((p) => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div><label htmlFor="co-district">District</label><input id="co-district" value={delivery.district} onChange={(e) => update("district", e.target.value)} required placeholder="e.g. Kicukiro" /></div>
            </div>
            <div className="form-row">
              <div><label htmlFor="co-sector">Sector</label><input id="co-sector" value={delivery.sector} onChange={(e) => update("sector", e.target.value)} required placeholder="e.g. Kigarama" /></div>
              <div>
                <label htmlFor="co-address">{isPickup ? "Where you are (optional)" : "Delivery address"}</label>
                <input
                  id="co-address"
                  autoComplete="street-address"
                  value={delivery.address}
                  onChange={(e) => update("address", e.target.value)}
                  required={!isPickup}
                  placeholder={isPickup ? "For our records, e.g. Huye" : "Street / house / landmark"}
                />
              </div>
            </div>
            <div><label htmlFor="co-notes">Additional instructions (optional)</label><textarea id="co-notes" value={delivery.instructions} onChange={(e) => update("instructions", e.target.value)} /></div>
          </section>

          {/* ---------- 3. PAYMENT ---------- */}
          <section className="card form" aria-labelledby="pay-title">
            <div className="location-head">
              <span className="step-num">3</span>
              <h3 id="pay-title">Payment method</h3>
            </div>
            <label className="checkbox"><input type="radio" name="pay" checked={paymentMethod === "mobile_money"} onChange={() => setPaymentMethod("mobile_money")} /> Mobile Money (MTN / Airtel)</label>
            <label className="checkbox"><input type="radio" name="pay" checked={paymentMethod === "cash"} onChange={() => setPaymentMethod("cash")} /> Cash {isPickup ? "on collection" : "on delivery"}</label>
            <label className="checkbox"><input type="radio" name="pay" checked={paymentMethod === "card"} onChange={() => setPaymentMethod("card")} /> Card</label>
            <div className="alert alert-warning" style={{ marginTop: 8 }}>
              Development mode: no real payment provider is connected. Mobile Money and Card use a test flow that marks the order as paid. Cash stays pending until {isPickup ? "collection" : "delivery"}.
            </div>
          </section>
        </div>

        {/* ---------- SUMMARY ---------- */}
        <div className="card">
          <h3>Order Summary</h3>
          {items.map((i) => (
            <div className="summary-row" key={i.productId}>
              <span>{i.name} × {i.quantity}</span><span>{rwf(i.price * i.quantity)}</span>
            </div>
          ))}
          <hr style={{ border: 0, borderTop: "1px solid var(--border)" }} />
          <div className="summary-row"><span>Products</span><span>{rwf(subtotal)}</span></div>
          <div className="summary-row">
            <span>{isPickup ? "Pickup handling" : "Delivery"}</span>
            <span>{fee === 0 ? "—" : rwf(fee)}</span>
          </div>
          <div className="summary-row"><span>Discount {promotion && <small className="badge">{promotion.name}</small>}</span><span>- {rwf(discount)}</span></div>
          <div className="summary-row summary-total"><span>Total</span><span>{rwf(total)}</span></div>
          <p className="muted small" style={{ marginTop: "0.6rem" }}>
            {isPickup
              ? `Collect at ${PICKUP.name}. No delivery fee; ${rwf(fee)} handling applies.`
              : "Includes delivery inside the area."}
          </p>
          <button className="btn btn-primary btn-block" style={{ marginTop: "1rem" }} disabled={!canPlace}>
            {loading ? "Placing order…" : isPickup ? "Confirm pickup order" : "Place order"}
          </button>
        </div>
      </form>
    </div>
  );
}
