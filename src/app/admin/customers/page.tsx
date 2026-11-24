"use client";
// ADMIN CUSTOMERS: every account, with the one action that rescues a customer
// who cannot log in - issue a temporary password. Passwords are never read.
import { useEffect, useState } from "react";
import { api, formatDate, rwf } from "@/lib/client/api";

type Customer = {
  id: number; name: string; email: string; phone: string | null;
  createdAt: string; orderCount: number; totalSpent: number;
};

type ResetResult = { email: string; temporaryPassword: string };

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [reset, setReset] = useState<ResetResult | null>(null);

  function load() {
    api<{ customers: Customer[] }>("/api/admin/customers")
      .then((d) => setCustomers(d.customers))
      .catch((e) => setError((e as Error).message));
  }
  useEffect(load, []);

  async function resetPassword(customer: Customer) {
    if (!confirm(`Create a temporary password for ${customer.name}? Their current password stops working immediately.`)) return;
    setError("");
    setBusyId(customer.id);
    try {
      const data = await api<ResetResult>(`/api/admin/customers/${customer.id}/reset-password`, { method: "POST" });
      setReset(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  const q = search.toLowerCase();
  const visible = customers.filter((c) => (c.name + c.email + (c.phone || "")).toLowerCase().includes(q));

  return (
    <>
      <div className="admin-header">
        <h1 className="page-title" style={{ margin: 0 }}>Customers ({customers.length})</h1>
        <input placeholder="Search customers..." value={search} onChange={(e) => setSearch(e.target.value)} className="admin-search" />
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      {reset && (
        <div className="alert alert-success" role="status">
          <strong>Temporary password for {reset.email}:</strong>{" "}
          <code className="temp-password">{reset.temporaryPassword}</code>
          <br />
          <small>Shown once. The customer must change it at their next login.</small>{" "}
          <button type="button" className="btn btn-light btn-sm" onClick={() => setReset(null)}>Done</button>
        </div>
      )}

      <div className="card table-wrap" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Name</th><th>Email</th><th>Phone</th><th>Registered</th><th>Orders</th><th>Spent</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((c) => (
              <tr key={c.id}>
                <td><strong>{c.name}</strong></td>
                <td>{c.email}</td>
                <td>{c.phone || "—"}</td>
                <td>{formatDate(c.createdAt)}</td>
                <td>{c.orderCount}</td>
                <td>{rwf(c.totalSpent)}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => resetPassword(c)}
                    disabled={busyId === c.id}
                  >
                    {busyId === c.id ? "Creating…" : "Reset password"}
                  </button>
                </td>
              </tr>
            ))}
            {visible.length === 0 && <tr><td colSpan={7} className="muted">No customers found.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ marginTop: 8 }}>
        <small>Passwords are stored hashed and cannot be read. Resetting issues a one-time password the customer must change.</small>
      </p>
    </>
  );
}
