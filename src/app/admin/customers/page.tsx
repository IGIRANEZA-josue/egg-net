"use client";
// ADMIN CUSTOMERS: list registered customers (no passwords are ever sent)
import { useEffect, useState } from "react";
import { api, formatDate } from "@/lib/client/api";

type Customer = { id: number; name: string; email: string; phone: string | null; createdAt: string; orderCount: number };

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api<{ customers: Customer[] }>("/api/admin/customers").then((d) => setCustomers(d.customers));
  }, []);

  const visible = customers.filter((c) => (c.name + c.email + (c.phone || "")).toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <div className="admin-header">
        <h1 className="page-title" style={{ margin: 0 }}>Customers ({customers.length})</h1>
        <input placeholder="Search customers..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 260 }} />
      </div>
      <div className="card table-wrap" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Registered</th><th>Orders</th></tr></thead>
          <tbody>
            {visible.map((c) => (
              <tr key={c.id}><td><strong>{c.name}</strong></td><td>{c.email}</td><td>{c.phone || "—"}</td><td>{formatDate(c.createdAt)}</td><td>{c.orderCount}</td></tr>
            ))}
            {visible.length === 0 && <tr><td colSpan={5} className="muted">No customers found.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
