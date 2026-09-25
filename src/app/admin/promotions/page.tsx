"use client";
// ADMIN PROMOTIONS: create / toggle / delete store-wide discounts
import { useEffect, useState } from "react";
import { api, formatDate } from "@/lib/client/api";

type Promotion = { id: number; name: string; type: string; value: number; startDate: string; endDate: string; active: boolean };

const today = new Date().toISOString().slice(0, 10);

export default function AdminPromotionsPage() {
  const [list, setList] = useState<Promotion[]>([]);
  const [form, setForm] = useState({ name: "", type: "percentage", value: "10", startDate: today, endDate: today, active: true });
  const [message, setMessage] = useState("");

  function load() { api<{ promotions: Promotion[] }>("/api/promotions").then((d) => setList(d.promotions)); }
  useEffect(load, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    try {
      await api("/api/promotions", { method: "POST", body: form });
      setForm({ ...form, name: "" });
      setMessage("Promotion created ✓");
      load();
    } catch (err) { setMessage((err as Error).message); }
  }

  async function toggle(p: Promotion) {
    await api(`/api/promotions/${p.id}`, { method: "PUT", body: { ...p, active: !p.active } });
    load();
  }

  async function remove(p: Promotion) {
    if (!confirm(`Delete "${p.name}"?`)) return;
    await api(`/api/promotions/${p.id}`, { method: "DELETE" });
    load();
  }

  return (
    <>
      <h1 className="page-title">Discounts & Promotions</h1>
      <div className="layout-2">
        <div className="card table-wrap" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>Name</th><th>Discount</th><th>Period</th><th>Active</th><th></th></tr></thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id}>
                  <td><strong>{p.name}</strong></td>
                  <td>{p.type === "percentage" ? `${p.value}%` : `${p.value.toLocaleString()} RWF`}</td>
                  <td><small>{formatDate(p.startDate)} → {formatDate(p.endDate)}</small></td>
                  <td><label className="checkbox"><input type="checkbox" checked={p.active} onChange={() => toggle(p)} /> {p.active ? "Yes" : "No"}</label></td>
                  <td><button className="btn btn-danger btn-sm" onClick={() => remove(p)}>Delete</button></td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={5} className="muted">No promotions yet.</td></tr>}
            </tbody>
          </table>
        </div>

        <form className="card form" onSubmit={create}>
          <h3>New Promotion</h3>
          {message && <div className={`alert ${message.includes("✓") ? "alert-success" : "alert-error"}`}>{message}</div>}
          <div><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Weekend Offer" /></div>
          <div className="form-row">
            <div>
              <label>Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed amount (RWF)</option>
              </select>
            </div>
            <div><label>Value</label><input type="number" min={1} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} required /></div>
          </div>
          <div className="form-row">
            <div><label>Start date</label><input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required /></div>
            <div><label>End date</label><input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required /></div>
          </div>
          <label className="checkbox"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active</label>
          <button className="btn btn-primary">Create Promotion</button>
          <small className="muted">Only one promotion is applied at a time (the first active one). The discount is calculated on the server at checkout.</small>
        </form>
      </div>
    </>
  );
}
