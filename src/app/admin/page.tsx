"use client";
// ADMIN DASHBOARD
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, rwf, formatDate } from "@/lib/client/api";
import StatusBadge from "@/components/StatusBadge";

type Dashboard = {
  totalSales: number; totalOrders: number; totalCustomers: number; totalProducts: number; lowStockCount: number; pendingOrders: number;
  lowStockProducts: { id: number; name: string; stock: number }[];
  recentOrders: { id: number; orderNumber: string; customerName: string; total: number; orderStatus: string; createdAt: string }[];
};

export default function AdminDashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Dashboard>("/api/admin/dashboard").then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <p className="muted">Loading dashboard...</p>;

  const stats = [
    { label: "Total Sales", value: rwf(data.totalSales) },
    { label: "Orders", value: data.totalOrders },
    { label: "Customers", value: data.totalCustomers },
    { label: "Products", value: data.totalProducts },
    { label: "Low Stock", value: data.lowStockCount },
    { label: "Pending Orders", value: data.pendingOrders },
  ];

  return (
    <>
      <div className="admin-header">
        <h1 className="page-title" style={{ margin: 0 }}>Admin Dashboard</h1>
        <Link href="/admin/products/new" className="btn btn-primary">+ Add Product</Link>
      </div>

      <div className="grid grid-3">
        {stats.map((s) => (
          <div className="card stat-card" key={s.label}><div className="value">{s.value}</div><div className="label">{s.label}</div></div>
        ))}
      </div>

      <div className="grid grid-2" style={{ marginTop: "1.5rem" }}>
        <div className="card">
          <h3>⚠ Low Stock Products</h3>
          {data.lowStockProducts.length === 0 ? <p className="muted">All products are well stocked.</p> : (
            data.lowStockProducts.map((p) => (
              <div key={p.id} className="summary-row">
                <span>{p.name}</span>
                <span className={p.stock === 0 ? "stock-out" : "stock-low"}>{p.stock === 0 ? "Out of stock" : `Only ${p.stock} remaining`}</span>
              </div>
            ))
          )}
          <Link href="/admin/products" className="btn btn-outline btn-sm" style={{ marginTop: 8 }}>Manage stock</Link>
        </div>
        <div className="card">
          <h3>Recent Orders</h3>
          {data.recentOrders.length === 0 ? <p className="muted">No orders yet.</p> : (
            data.recentOrders.map((o) => (
              <div key={o.id} className="summary-row" style={{ alignItems: "center" }}>
                <span><Link href={`/admin/orders?id=${o.id}`}><strong>#{o.orderNumber}</strong></Link><br /><small className="muted">{o.customerName} · {formatDate(o.createdAt)}</small></span>
                <span style={{ textAlign: "right" }}>{rwf(o.total)}<br /><StatusBadge status={o.orderStatus} /></span>
              </div>
            ))
          )}
          <Link href="/admin/orders" className="btn btn-outline btn-sm" style={{ marginTop: 8 }}>All orders</Link>
        </div>
      </div>

      <div className="card" style={{ marginTop: "1.5rem" }}>
        <h3>Admin tools</h3>
        <div className="quick-links">
          <Link href="/admin/products/new">Add / upload egg products <span>→</span></Link>
          <Link href="/admin/products">Edit products &amp; prices <span>→</span></Link>
          <Link href="/admin/products">Set stock &amp; delete products <span>→</span></Link>
          <Link href="/admin/orders">View customer orders <span>→</span></Link>
          <Link href="/admin/orders">Update order status <span>→</span></Link>
          <Link href="/admin/sales">View sales <span>→</span></Link>
          <Link href="/admin/customers">Manage customers <span>→</span></Link>
          <Link href="/admin/promotions">Discounts &amp; promotions <span>→</span></Link>
        </div>
      </div>
    </>
  );
}
