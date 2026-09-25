"use client";
// PRODUCT DETAILS PAGE: big image, info, quantity selector, add to cart, reviews
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, rwf, formatDate, getSavedUser } from "@/lib/client/api";
import { addToCart } from "@/lib/client/cart";
import { type Product, finalPrice, StockLabel, ProductThumb } from "@/components/ProductCard";

type Review = { id: number; customerName: string; rating: number; comment: string | null; createdAt: string };

export default function ProductDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [average, setAverage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ product: Product }>(`/api/products/${id}`)
      .then((data) => setProduct(data.product))
      .catch((err) => setError(err.message));
    api<{ reviews: Review[]; average: number }>(`/api/reviews/product/${id}`)
      .then((data) => { setReviews(data.reviews); setAverage(data.average); })
      .catch(() => {});
  }, [id]);

  if (error) return <div className="page container"><div className="alert alert-error">{error}</div></div>;
  if (!product) return <div className="page container"><p className="muted">Loading...</p></div>;

  function handleAdd() {
    if (!product) return;
    if (!getSavedUser()) { router.push("/login"); return; }
    const err = addToCart({ productId: product.id, name: product.name, price: finalPrice(product), image: product.image || "", stock: product.stock }, quantity);
    setMessage(err || `Added ${quantity} to cart ✓`);
  }

  return (
    <div className="page container">
      <p><Link href="/products" className="muted">← Back to products</Link></p>
      <div className="grid grid-2 card" style={{ padding: "1.5rem" }}>
        <ProductThumb product={product} className="detail-image" />
        <div>
          <h1 style={{ color: "var(--green-dark)" }}>{product.name}</h1>
          <span className="badge">Package: {product.packageSize} eggs</span>
          {average > 0 && <span className="badge badge-yellow" style={{ marginLeft: 8 }}>★ {average} ({reviews.length})</span>}
          <p style={{ marginTop: "1rem" }}>{product.description}</p>
          <div className="price" style={{ fontSize: "1.6rem" }}>
            {rwf(finalPrice(product))}
            {product.discount > 0 && <span className="old-price">{rwf(product.price)}</span>}
          </div>
          <p><StockLabel stock={product.stock} /></p>

          {product.stock > 0 && (
            <div style={{ margin: "1rem 0" }}>
              <label>Quantity</label>
              <div className="qty">
                <button onClick={() => setQuantity(Math.max(1, quantity - 1))}>−</button>
                <span>{quantity}</span>
                <button onClick={() => setQuantity(Math.min(product.stock, quantity + 1))}>+</button>
              </div>
            </div>
          )}

          <button className="btn btn-primary" onClick={handleAdd} disabled={product.stock === 0}>
            {product.stock === 0 ? "Out of Stock" : "Add to Cart"}
          </button>
          {message && <p className={message.includes("✓") ? "stock-ok" : "stock-out"}>{message}</p>}
        </div>
      </div>

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ color: "var(--green-dark)" }}>Customer Reviews</h2>
        {reviews.length === 0 ? (
          <p className="muted">No reviews yet. Customers can review after their order is delivered.</p>
        ) : (
          <div className="grid grid-2">
            {reviews.map((r) => (
              <div key={r.id} className="card">
                <strong>{r.customerName}</strong> <span className="badge badge-yellow">{r.rating} / 5</span>
                <p style={{ marginTop: 6 }}>{r.comment}</p>
                <small className="muted">{formatDate(r.createdAt)}</small>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
