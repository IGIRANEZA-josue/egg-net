"use client";
// ADMIN: Edit Product
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ProductForm from "@/components/ProductForm";
import { api } from "@/lib/client/api";
import type { Product } from "@/components/ProductCard";

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ product: Product }>(`/api/products/${id}`).then((d) => setProduct(d.product)).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!product) return <p className="muted">Loading...</p>;
  return (
    <>
      <h1 className="page-title">Edit Product</h1>
      <ProductForm product={product} />
    </>
  );
}
