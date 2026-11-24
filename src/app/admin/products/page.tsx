"use client";
// ADMIN PRODUCTS: list, quick stock edit, availability toggle, delete
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, rwf } from "@/lib/client/api";
import type { Product } from "@/components/ProductCard";
import EggMark from "@/components/EggMark";

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [message, setMessage] = useState("");

  function load() {
    api<{ products: Product[] }>("/api/products?all=true").then((d) => setProducts(d.products));
  }
  useEffect(load, []);

  async function save(product: Product, changes: Partial<Product>) {
    setMessage("");
    try {
      await api(`/api/products/${product.id}`, { method: "PUT", body: { ...product, ...changes } });
      load();
    } catch (e) { setMessage((e as Error).message); }
  }

  async function remove(product: Product) {
    if (!confirm(`Delete "${product.name}"?`)) return;
    try {
      await api(`/api/products/${product.id}`, { method: "DELETE" });
      load();
    } catch (e) { setMessage((e as Error).message); }
  }

  return (
    <>
      <div className="admin-header">
        <h1 className="page-title" style={{ margin: 0 }}>Products</h1>
        <Link href="/admin/products/new" className="btn btn-primary">+ Add Product</Link>
      </div>
      {message && <div className="alert alert-error">{message}</div>}
      <div className="card table-wrap" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Image</th><th>Name</th><th>Package</th><th>Price</th><th>Stock</th><th>Available</th><th>Actions</th></tr></thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image} alt={p.name} className="thumb" />
                  ) : (
                    <div className="thumb product-image-placeholder" style={{ color: "var(--ink)" }}><EggMark size={22} /></div>
                  )}
                </td>
                <td><strong>{p.name}</strong>{p.discount > 0 && <span className="badge badge-yellow" style={{ marginLeft: 6 }}>-{p.discount}%</span>}</td>
                <td>{p.packageSize} eggs</td>
                <td>{rwf(p.price)}</td>
                <td>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <input type="number" min={0} defaultValue={p.stock} className="admin-stock-input" onBlur={(e) => { const v = Number(e.target.value); if (v !== p.stock) save(p, { stock: v }); }} />
                    {p.stock === 0 ? <span className="stock-out">Out</span> : p.stock <= 5 ? <span className="stock-low">Low</span> : null}
                  </div>
                </td>
                <td>
                  <label className="checkbox"><input type="checkbox" checked={p.isAvailable} onChange={(e) => save(p, { isAvailable: e.target.checked })} /> {p.isAvailable ? "Yes" : "No"}</label>
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <Link href={`/admin/products/${p.id}/edit`} className="btn btn-outline btn-sm">Edit</Link>{" "}
                  <button className="btn btn-danger btn-sm" onClick={() => remove(p)}>Delete</button>
                </td>
              </tr>
            ))}
            {products.length === 0 && <tr><td colSpan={7} className="muted">No products yet. Add your first product.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ marginTop: 8 }}><small>Tip: change the stock number and click outside the box to save it.</small></p>
    </>
  );
}
