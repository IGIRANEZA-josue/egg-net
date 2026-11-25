"use client";
// ADMIN INVENTORY — the movement of eggs.
//
// Two forms (receive / remove) and the ledger underneath. Both forms post to
// endpoints that change products.stock and write a ledger row in one
// transaction, so the number and its history cannot disagree.
import { useCallback, useEffect, useState } from "react";
import { api, formatDate } from "@/lib/client/api";
import type { Product } from "@/components/ProductCard";

type Movement = {
  id: number; direction: string; quantity: number; reason: string;
  source: string; note: string | null; createdAt: string;
  productId: number; productName: string; category: string; orderNumber: string | null;
};

type Ledger = {
  movements: Movement[];
  total: number;
  totals: { totalIn: number; totalOut: number; entries: number; onHand: number; listings: number; lowStock: number };
};

const IN_SOURCES = ["Farm delivery", "Supplier purchase", "Returned by customer", "Stock count correction", "Other"];
const OUT_REASONS = ["Sale", "Damaged or broken", "Expired", "Donated", "Stock count correction", "Other"];

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function AdminInventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [direction, setDirection] = useState<"" | "in" | "out">("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const [stockInForm, setStockInForm] = useState({
    productId: "", quantity: "", source: "Farm delivery", receivedOn: today(), note: "",
  });
  const [stockOutForm, setStockOutForm] = useState({
    productId: "", quantity: "", reason: "Sale", note: "",
  });

  const loadProducts = useCallback(() => {
    api<{ products: Product[] }>("/api/products?all=true&pageSize=200")
      .then((d) => setProducts(d.products))
      .catch((e) => setError((e as Error).message));
  }, []);

  const loadLedger = useCallback(() => {
    const params = new URLSearchParams({ pageSize: "100" });
    if (direction) params.set("direction", direction);
    if (search.trim()) params.set("search", search.trim());
    api<Ledger>(`/api/admin/inventory?${params}`)
      .then(setLedger)
      .catch((e) => setError((e as Error).message));
  }, [direction, search]);

  useEffect(loadProducts, [loadProducts]);
  useEffect(loadLedger, [loadLedger]);

  function refreshAll() {
    loadProducts();
    loadLedger();
  }

  async function submitIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const res = await api<{ message: string }>("/api/admin/inventory/stock-in", {
        method: "POST",
        body: {
          productId: Number(stockInForm.productId),
          quantity: Number(stockInForm.quantity),
          source: stockInForm.source,
          reason: stockInForm.source,
          receivedOn: stockInForm.receivedOn,
          note: stockInForm.note,
        },
      });
      setNotice(res.message);
      setStockInForm({ ...stockInForm, quantity: "", note: "" });
      refreshAll();
    } catch (err) {
      setError((err as Error).message);
    } finally { setBusy(false); }
  }

  async function submitOut(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const res = await api<{ message: string }>("/api/admin/inventory/stock-out", {
        method: "POST",
        body: {
          productId: Number(stockOutForm.productId),
          quantity: Number(stockOutForm.quantity),
          reason: stockOutForm.reason,
          note: stockOutForm.note,
        },
      });
      setNotice(res.message);
      setStockOutForm({ ...stockOutForm, quantity: "", note: "" });
      refreshAll();
    } catch (err) {
      setError((err as Error).message);
    } finally { setBusy(false); }
  }

  const totals = ledger?.totals;

  return (
    <>
      <div className="section-head">
        <h1 className="page-title" style={{ marginBottom: 0 }}>Inventory</h1>
      </div>

      {notice && <div className="alert alert-success" role="status">{notice}</div>}
      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <div className="grid grid-4 admin-stats">
        <div className="card stat-card">
          <div className="value">{totals?.onHand.toLocaleString() ?? "—"}</div>
          <div className="label">Eggs on hand</div>
          <p className="stat-sub">Across {totals?.listings ?? 0} listings</p>
        </div>
        <div className="card stat-card">
          <div className="value">{totals?.totalIn.toLocaleString() ?? "—"}</div>
          <div className="label">Total received</div>
          <p className="stat-sub">Every stock-in</p>
        </div>
        <div className="card stat-card">
          <div className="value">{totals?.totalOut.toLocaleString() ?? "—"}</div>
          <div className="label">Total out</div>
          <p className="stat-sub">Sales and removals</p>
        </div>
        <div className="card stat-card">
          <div className="value">{totals?.lowStock ?? 0}</div>
          <div className="label">Low stock</div>
          <p className="stat-sub">5 or fewer left</p>
        </div>
      </div>

      <div className="grid grid-2 admin-panels">
        {/* ---- stock in ---- */}
        <form className="card form" onSubmit={submitIn}>
          <h2 className="panel-title">Egg input — stock in</h2>
          <div>
            <label htmlFor="in-product">Egg listing</label>
            <select id="in-product" required value={stockInForm.productId}
              onChange={(e) => setStockInForm({ ...stockInForm, productId: e.target.value })}>
              <option value="">Choose a listing</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name} — {p.stock} in stock</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="in-qty">Quantity received</label>
            <input id="in-qty" type="number" min={1} step={1} required value={stockInForm.quantity}
              onChange={(e) => setStockInForm({ ...stockInForm, quantity: e.target.value })} />
          </div>
          <div>
            <label htmlFor="in-source">Source</label>
            <select id="in-source" value={stockInForm.source}
              onChange={(e) => setStockInForm({ ...stockInForm, source: e.target.value })}>
              {IN_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="in-date">Received on</label>
            <input id="in-date" type="date" max={today()} value={stockInForm.receivedOn}
              onChange={(e) => setStockInForm({ ...stockInForm, receivedOn: e.target.value })} />
          </div>
          <div>
            <label htmlFor="in-note">Note (optional)</label>
            <input id="in-note" value={stockInForm.note}
              onChange={(e) => setStockInForm({ ...stockInForm, note: e.target.value })} />
          </div>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Recording..." : "Record stock in"}</button>
        </form>

        {/* ---- stock out ---- */}
        <form className="card form" onSubmit={submitOut}>
          <h2 className="panel-title">Egg output — stock out</h2>
          <div>
            <label htmlFor="out-product">Egg listing</label>
            <select id="out-product" required value={stockOutForm.productId}
              onChange={(e) => setStockOutForm({ ...stockOutForm, productId: e.target.value })}>
              <option value="">Choose a listing</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name} — {p.stock} in stock</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="out-qty">Quantity</label>
            <input id="out-qty" type="number" min={1} step={1} required value={stockOutForm.quantity}
              onChange={(e) => setStockOutForm({ ...stockOutForm, quantity: e.target.value })} />
          </div>
          <div>
            <label htmlFor="out-reason">Reason</label>
            <select id="out-reason" value={stockOutForm.reason}
              onChange={(e) => setStockOutForm({ ...stockOutForm, reason: e.target.value })}>
              {OUT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="out-note">Note (optional)</label>
            <input id="out-note" value={stockOutForm.note}
              onChange={(e) => setStockOutForm({ ...stockOutForm, note: e.target.value })} />
          </div>
          <p className="muted mono">Stock can never go below zero.</p>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Recording..." : "Record stock out"}</button>
        </form>
      </div>

      {/* ---- ledger ---- */}
      <div className="card">
        <div className="section-head" style={{ marginBottom: "1rem" }}>
          <h2 className="panel-title" style={{ marginBottom: 0 }}>Movement history</h2>
          <div className="admin-filters-inline">
            <input type="search" placeholder="Search product or reason" value={search}
              onChange={(e) => setSearch(e.target.value)} aria-label="Search movements" />
            <select value={direction} onChange={(e) => setDirection(e.target.value as "" | "in" | "out")} aria-label="Filter by direction">
              <option value="">All movements</option>
              <option value="in">Stock in</option>
              <option value="out">Stock out</option>
            </select>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Date</th><th>Listing</th><th>Movement</th><th>Quantity</th><th>Reason</th><th>Source</th><th>Order</th></tr>
            </thead>
            <tbody>
              {!ledger || ledger.movements.length === 0 ? (
                <tr><td colSpan={7} className="muted">No movements recorded yet.</td></tr>
              ) : ledger.movements.map((m) => (
                <tr key={m.id}>
                  <td className="mono">{formatDate(m.createdAt)}</td>
                  <td>{m.productName}<br /><small className="muted">{m.category}</small></td>
                  <td>
                    <span className={`badge ${m.direction === "in" ? "badge-yellow" : "badge-gray"}`}>
                      {m.direction === "in" ? "In" : "Out"}
                    </span>
                  </td>
                  <td className={m.direction === "in" ? "stock-in-qty" : "stock-out-qty"}>
                    {m.direction === "in" ? "+" : "−"}{m.quantity}
                  </td>
                  <td>{m.reason}<br /><small className="muted">{m.note}</small></td>
                  <td>{m.source || "—"}</td>
                  <td className="mono">{m.orderNumber || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
