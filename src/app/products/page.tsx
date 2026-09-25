"use client";
// PRODUCTS PAGE: list, search and filter products
import { useEffect, useState } from "react";
import ProductCard, { type Product } from "@/components/ProductCard";
import { api } from "@/lib/client/api";

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sort, setSort] = useState("newest");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ products: Product[] }>("/api/products")
      .then((data) => setProducts(data.products))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, []);

  // Filtering happens in the browser - simple and fast for a small shop
  let visible = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  if (inStockOnly) visible = visible.filter((p) => p.stock > 0);
  if (sort === "price_asc") visible = [...visible].sort((a, b) => a.price - b.price);
  if (sort === "price_desc") visible = [...visible].sort((a, b) => b.price - a.price);
  if (sort === "size") visible = [...visible].sort((a, b) => a.packageSize - b.packageSize);

  return (
    <div className="page container">
      <h1 className="page-title">Our Egg Products</h1>

      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div className="form-row">
          <div>
            <label>Search</label>
            <input placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div>
            <label>Sort by</label>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="newest">Newest</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
              <option value="size">Package size</option>
            </select>
          </div>
        </div>
        <label className="checkbox" style={{ marginTop: "0.75rem" }}>
          <input type="checkbox" checked={inStockOnly} onChange={(e) => setInStockOnly(e.target.checked)} />
          Show in-stock products only
        </label>
      </div>

      {loading ? (
        <p className="muted">Loading products...</p>
      ) : visible.length === 0 ? (
        <p className="muted">No products found.</p>
      ) : (
        <div className="grid grid-4">
          {visible.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      )}
    </div>
  );
}
