"use client";
// One product card used on the Home and Products pages
import Link from "next/link";
import { useState } from "react";
import { rwf, getSavedUser } from "@/lib/client/api";
import { addToCart } from "@/lib/client/cart";
import { useRouter } from "next/navigation";
import EggMark from "@/components/EggMark";

export type Product = {
  id: number;
  name: string;
  description: string | null;
  price: number;
  packageSize: number;
  stock: number;
  image: string | null;
  isAvailable: boolean;
  discount: number;
};

// Price after the product's own % discount
export function finalPrice(product: Product) {
  if (!product.discount) return product.price;
  return Math.round(product.price - (product.price * product.discount) / 100);
}

export function StockLabel({ stock }: { stock: number }) {
  if (stock === 0) return <span className="stock-out">Out of Stock</span>;
  if (stock <= 5) return <span className="stock-low">Only {stock} left</span>;
  return <span className="stock-ok">In stock · {stock} packs</span>;
}

export function ProductThumb({ product, className }: { product: Product; className?: string }) {
  return product.image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={product.image} alt={product.name} className={className} />
  ) : (
    <div className={`product-image-placeholder ${className || ""}`} style={{ color: "var(--ink)" }}>
      <EggMark size={54} title={product.name} />
    </div>
  );
}

export default function ProductCard({ product }: { product: Product }) {
  const [message, setMessage] = useState("");
  const router = useRouter();
  const outOfStock = product.stock === 0;

  function handleAdd() {
    if (!getSavedUser()) { router.push("/login"); return; }
    const error = addToCart({
      productId: product.id,
      name: product.name,
      price: finalPrice(product),
      image: product.image || "",
      stock: product.stock,
    });
    setMessage(error || "Added to cart");
    setTimeout(() => setMessage(""), 2000);
  }

  return (
    <div className="card product-card">
      <Link href={`/products/${product.id}`}>
        <ProductThumb product={product} />
      </Link>
      <div className="product-body">
        <Link href={`/products/${product.id}`}><h3>{product.name}</h3></Link>
        <div><span className="badge">{product.packageSize} Eggs</span></div>
        <p className="muted" style={{ fontSize: "0.85rem" }}>{product.description}</p>
        <div className="price">
          {rwf(finalPrice(product))}
          {product.discount > 0 && <span className="old-price">{rwf(product.price)}</span>}
        </div>
        <StockLabel stock={product.stock} />
        <button className={`btn ${outOfStock ? "btn-outline" : "btn-primary"} btn-block`} onClick={handleAdd} disabled={outOfStock}>
          {outOfStock ? "Out of Stock" : "Add to Cart"}
        </button>
        {message && <small className={message === "Added to cart" ? "stock-ok" : "stock-out"}>{message}</small>}
      </div>
    </div>
  );
}
