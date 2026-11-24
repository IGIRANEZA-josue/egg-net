// ABOUT PAGE
import { DELIVERY_RADIUS_KM, PICKUP } from "@/lib/fulfilment";

export default function AboutPage() {
  return (
    <div className="page container" style={{ maxWidth: 800 }}>
      <h1 className="page-title">About EggHub Rwanda</h1>
      <div style={{ height: "clamp(220px, 32vw, 380px)", overflow: "hidden", marginBottom: "2.5rem", WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, #000 25%, #000 100%)", maskImage: "linear-gradient(to bottom, transparent 0%, #000 25%, #000 100%)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/delivery-halftone.svg" alt="Halftone illustration of an egg crate on a delivery bike" width={900} height={1200} style={{ width: "100%", height: "100%", objectFit: "cover", filter: "grayscale(1) contrast(1.06)", mixBlendMode: "multiply" }} />
      </div>
      <div className="card">
        <p>
          <strong>EggHub Rwanda</strong> is an online platform that makes it easier for customers to buy
          fresh eggs. Customers can browse available egg products, place orders, select delivery
          options, and track their orders from the comfort of their home or business.
        </p>
        <p>
          We serve households, restaurants, hotels, and shops across Rwanda with egg packages of
          different sizes — from a small 6-pack to full trays for large kitchens.
        </p>
        <h3 style={{ marginTop: "1.5rem" }}>Our Promise</h3>
        <ul>
          <li>Fresh, quality eggs every time</li>
          <li>Simple ordering and clear prices in RWF</li>
          <li>Delivery within {DELIVERY_RADIUS_KM} km of {PICKUP.name}, and collection there beyond that</li>
          <li>Honest order tracking from placement to delivery or collection</li>
        </ul>
      </div>
    </div>
  );
}
