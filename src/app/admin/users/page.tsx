"use client";
// ADMIN USERS — every account on the platform: search, filter, open, edit,
// suspend or delete. Passwords are never shown or requested.
import { useCallback, useEffect, useState } from "react";
import { api, rwf, formatDate } from "@/lib/client/api";

type UserRow = {
  id: number; name: string; email: string; phone: string | null;
  role: string; address: string | null; isActive: boolean;
  createdAt: string; orderCount: number; totalSpent: number;
};

type UserDetail = {
  user: UserRow & { mustChangePassword: boolean };
  recentOrders: { id: number; orderNumber: string; total: number; orderStatus: string; paymentStatus: string; createdAt: string }[];
  summary: { orderCount: number; totalSpent: number };
  isSelf: boolean;
};

const ROLE_FILTERS = [
  { value: "", label: "All roles" },
  { value: "customer", label: "Customers" },
  { value: "admin", label: "Admins" },
];
const STATUS_FILTERS = [
  { value: "", label: "Any status" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Deactivated" },
];

export default function AdminUsersPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [counts, setCounts] = useState({ total: 0, customers: 0, admins: 0, active: 0, inactive: 0 });
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<UserDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", address: "", role: "customer" });
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(() => {
    setError("");
    const params = new URLSearchParams({ pageSize: "200" });
    if (search.trim()) params.set("search", search.trim());
    if (role) params.set("role", role);
    if (status) params.set("status", status);
    api<{ users: UserRow[]; total: number; customers: number; admins: number; active: number; inactive: number }>(
      `/api/admin/users?${params}`
    )
      .then((d) => {
        setRows(d.users);
        setCounts({ total: d.total, customers: d.customers, admins: d.admins, active: d.active, inactive: d.inactive });
      })
      .catch((e) => setError((e as Error).message));
  }, [search, role, status]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(load, [load]);

  async function openUser(id: number) {
    setError("");
    setEditing(false);
    setConfirmDelete(false);
    try {
      const d = await api<UserDetail>(`/api/admin/users/${id}`);
      setSelected(d);
      setForm({
        name: d.user.name,
        email: d.user.email,
        phone: d.user.phone ?? "",
        address: d.user.address ?? "",
        role: d.user.role,
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function save() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/admin/users/${selected.user.id}`, { method: "PATCH", body: form });
      setNotice(`Saved ${form.name}.`);
      setEditing(false);
      await openUser(selected.user.id);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const next = !selected.user.isActive;
      await api(`/api/admin/users/${selected.user.id}`, { method: "PATCH", body: { isActive: next } });
      setNotice(next ? `${selected.user.name} can sign in again.` : `${selected.user.name} can no longer sign in.`);
      await openUser(selected.user.id);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/admin/users/${selected.user.id}`, { method: "DELETE" });
      setNotice(`${selected.user.name} was deleted.`);
      setSelected(null);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  return (
    <>
      <div className="section-head">
        <h1 className="page-title" style={{ marginBottom: 0 }}>Users</h1>
        <p className="muted mono" style={{ margin: 0 }}>
          {counts.total} accounts · {counts.active} active · {counts.inactive} deactivated
        </p>
      </div>

      {notice && <div className="alert alert-success" role="status">{notice}</div>}
      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <div className="card admin-filters">
        <div>
          <label htmlFor="user-search">Search</label>
          <input
            id="user-search"
            type="search"
            placeholder="Name, email or phone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="user-role">Role</label>
          <select id="user-role" value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLE_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="user-status">Status</label>
          <select id="user-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
      </div>

      <div className="table-wrap card">
        <table>
          <thead>
            <tr>
              <th>Name</th><th>Email</th><th>Phone</th><th>Role</th>
              <th>Registered</th><th>Orders</th><th>Spent</th><th>Status</th><th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={9} className="muted">No accounts match those filters.</td></tr>
            ) : rows.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td className="mono">{u.email}</td>
                <td>{u.phone || "—"}</td>
                <td><span className={`badge ${u.role === "admin" ? "badge-blue" : "badge-gray"}`}>{u.role}</span></td>
                <td className="mono">{formatDate(u.createdAt)}</td>
                <td>{u.orderCount}</td>
                <td>{rwf(u.totalSpent)}</td>
                <td>
                  <span className={`badge ${u.isActive ? "badge-yellow" : "badge-red"}`}>
                    {u.isActive ? "Active" : "Deactivated"}
                  </span>
                </td>
                <td><button type="button" className="btn btn-outline btn-sm" onClick={() => openUser(u.id)}>Open</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="admin-drawer" role="dialog" aria-modal="true" aria-label={`Account details for ${selected.user.name}`}>
          <div className="card admin-drawer-card">
            <div className="admin-drawer-head">
              <div>
                <h2 className="panel-title" style={{ marginBottom: 0 }}>{selected.user.name}</h2>
                <p className="mono muted" style={{ margin: 0 }}>{selected.user.email}</p>
              </div>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setSelected(null)}>Close</button>
            </div>

            {editing ? (
              <div className="form">
                <div><label htmlFor="edit-name">Name</label>
                  <input id="edit-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div><label htmlFor="edit-email">Email</label>
                  <input id="edit-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div><label htmlFor="edit-phone">Phone</label>
                  <input id="edit-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div><label htmlFor="edit-address">Address</label>
                  <input id="edit-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
                <div><label htmlFor="edit-role">Role</label>
                  <select id="edit-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                    <option value="customer">customer</option>
                    <option value="admin">admin</option>
                  </select></div>
                <div className="admin-actions">
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>Save changes</button>
                  <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <ul className="admin-list">
                  <li><span>Phone</span><strong>{selected.user.phone || "—"}</strong></li>
                  <li><span>Address</span><strong>{selected.user.address || "—"}</strong></li>
                  <li><span>Registered</span><strong>{formatDate(selected.user.createdAt)}</strong></li>
                  <li><span>Orders</span><strong>{selected.summary.orderCount}</strong></li>
                  <li><span>Total spent</span><strong>{rwf(selected.summary.totalSpent)}</strong></li>
                  <li><span>Status</span><strong>{selected.user.isActive ? "Active" : "Deactivated"}</strong></li>
                </ul>

                <div className="admin-actions">
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditing(true)}>Edit details</button>
                  {!selected.isSelf && (
                    <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={toggleActive}>
                      {selected.user.isActive ? "Deactivate" : "Reactivate"}
                    </button>
                  )}
                  {!selected.isSelf && (
                    confirmDelete
                      ? <button type="button" className="btn btn-outline btn-sm danger" disabled={busy} onClick={remove}>Confirm delete</button>
                      : <button type="button" className="btn btn-outline btn-sm" onClick={() => setConfirmDelete(true)}>Delete</button>
                  )}
                </div>
                {selected.isSelf && <p className="muted mono">This is your own account.</p>}

                <h3 className="panel-title" style={{ marginTop: "1.25rem" }}>Recent orders</h3>
                {selected.recentOrders.length === 0 ? (
                  <p className="muted">No orders.</p>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Order</th><th>Total</th><th>Status</th><th>Date</th></tr></thead>
                      <tbody>
                        {selected.recentOrders.map((o) => (
                          <tr key={o.id}>
                            <td className="mono">{o.orderNumber}</td>
                            <td>{rwf(o.total)}</td>
                            <td>{o.orderStatus} · {o.paymentStatus}</td>
                            <td className="mono">{formatDate(o.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
