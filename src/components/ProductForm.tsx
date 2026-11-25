"use client";
// Form used by both "Add Product" and "Edit Product" admin pages
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import type { Product } from "@/components/ProductCard";

type Props = { product?: Product };

export default function ProductForm({ product }: Props) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: product?.name || "",
    description: product?.description || "",
    price: product?.price?.toString() || "",
    packageSize: product?.packageSize?.toString() || "30",
    category: product?.category || "Chicken eggs",
    stock: product?.stock?.toString() || "0",
    discount: product?.discount?.toString() || "0",
    image: product?.image || "",
    isAvailable: product?.isAvailable ?? true,
  });
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  function update(field: string, value: string | boolean) {
    setForm({ ...form, [field]: value });
  }

  // Upload image to /api/upload (saved locally in public/uploads)
  async function handleImage(file: File | undefined) {
    if (!file) return;
    setUploading(true); setError("");
    try {
      const formData = new FormData();
      formData.append("image", file);
      const data = await api<{ url: string }>("/api/upload", { method: "POST", formData });
      update("image", data.url);
    } catch (e) { setError((e as Error).message); }
    finally { setUploading(false); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      if (product) await api(`/api/products/${product.id}`, { method: "PUT", body: form });
      else await api("/api/products", { method: "POST", body: form });
      router.push("/admin/products");
    } catch (err) { setError((err as Error).message); setSaving(false); }
  }

  return (
    <form className="card form" onSubmit={handleSubmit} style={{ maxWidth: 640 }}>
      {error && <div className="alert alert-error">{error}</div>}
      <div><label>Product name</label><input value={form.name} onChange={(e) => update("name", e.target.value)} required placeholder="Fresh Eggs - 30 Tray" /></div>
      <div><label>Description</label><textarea value={form.description} onChange={(e) => update("description", e.target.value)} /></div>
      <div className="form-row">
        <div><label>Price (RWF)</label><input type="number" min={1} value={form.price} onChange={(e) => update("price", e.target.value)} required /></div>
        <div><label>Package size (number of eggs)</label><input type="number" min={1} value={form.packageSize} onChange={(e) => update("packageSize", e.target.value)} required /></div>
      </div>
      <div className="form-row">
        <div>
          <label htmlFor="product-category">Category</label>
          <input
            id="product-category"
            list="product-category-options"
            value={form.category}
            onChange={(e) => update("category", e.target.value)}
          />
          <datalist id="product-category-options">
            <option value="Chicken eggs" />
            <option value="Duck eggs" />
            <option value="Quail eggs" />
            <option value="Other" />
          </datalist>
        </div>
        <div><label>Stock quantity</label><input type="number" min={0} value={form.stock} onChange={(e) => update("stock", e.target.value)} required /></div>
        <div><label>Product discount (%)</label><input type="number" min={0} max={100} value={form.discount} onChange={(e) => update("discount", e.target.value)} /></div>
      </div>
      <div>
        <label>Image</label>
        <input type="file" accept="image/*" onChange={(e) => handleImage(e.target.files?.[0])} />
        {uploading && <small className="muted">Uploading...</small>}
        <small className="muted">Or paste an image URL:</small>
        <input value={form.image} onChange={(e) => update("image", e.target.value)} placeholder="https://... or /uploads/..." />
        {form.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={form.image} alt="Product image preview" style={{ height: 120, borderRadius: 8, marginTop: 8 }} />
        )}
      </div>
      <label className="checkbox"><input type="checkbox" checked={form.isAvailable} onChange={(e) => update("isAvailable", e.target.checked)} /> Available for customers</label>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary" disabled={saving || uploading}>{saving ? "Saving..." : product ? "Save Changes" : "Add Product"}</button>
        <button type="button" className="btn btn-outline" onClick={() => router.push("/admin/products")}>Cancel</button>
      </div>
    </form>
  );
}
