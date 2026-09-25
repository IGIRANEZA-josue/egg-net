"use client";
// HOME PAGE — editorial hero, halftone photography, wordmark strip, numbered features
import Link from "next/link";
import { useEffect, useState } from "react";
import ProductCard, { type Product } from "@/components/ProductCard";
import { api } from "@/lib/client/api";

const FEATURES = [
  { title: "Fresh Products", text: "Eggs collected and packed the same week, checked tray by tray." },
  { title: "Easy Ordering", text: "Pick a package, add it to your cart, checkout in under two minutes." },
  { title: "Reliable Delivery", text: "To your province, district and sector — with status you can follow." },
  { title: "Secure Payments", text: "Mobile Money, cash on delivery or card. Your order is always confirmed." },
];

export default function HomePage() {
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    api<{ products: Product[] }>("/api/products")
      .then((data) => setProducts(data.products.slice(0, 4)))
      .catch(() => setProducts([]));
  }, []);

  return (
    <>
      <section className="hero">
        <div className="container">
          <h1>
            Fresh Eggs
            <br />
            Delivered to You.
          </h1>
          <p>
            Buy fresh eggs easily and conveniently. Browse our products, place your
            order, and get your eggs delivered.
          </p>
          <div className="hero-actions">
            <Link href="/products" className="btn btn-primary btn-arrow">Shop Eggs</Link>
            <Link href="/products" className="link-arrow">View Products</Link>
          </div>
        </div>
        <div className="hero-media">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/hero-halftone.jpg" alt="Hands passing a fresh egg" />
        </div>
      </section>

      <section className="strip">
        <div className="container">
          <p className="strip-label">Trusted by kitchens across Rwanda</p>
          <div className="wordmarks">
            <span className="wm-caps">Kigali Kitchen</span>
            <span className="wm-serif">Nyamirambo Café</span>
            <span className="wm-mono">Shokola</span>
            <span>Umuceri Bakery</span>
            <span className="wm-caps">Hotel Chez Lando</span>
            <span className="wm-mono">Kimironko Market</span>
            <span className="wm-serif">Inema Deli</span>
          </div>
        </div>
      </section>

      <section className="section container" style={{ paddingTop: 0 }}>
        <div className="feature-list">
          {FEATURES.map((f, i) => (
            <div className="item" key={f.title}>
              <span className="num">0{i + 1}</span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section container" style={{ paddingTop: 0 }}>
        <div className="section-head">
          <h2 className="section-title">Featured Products</h2>
          <Link href="/products" className="link-arrow">See all</Link>
        </div>
        {products.length === 0 ? (
          <p className="muted">No products yet. Please check back soon.</p>
        ) : (
          <div className="grid grid-4">
            {products.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </section>
    </>
  );
}
