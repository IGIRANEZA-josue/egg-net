"use client";
// ADMIN DASHBOARD — the control centre.
// Numbers first, then the things an admin actually does: add a product, edit or
// delete one, work the order queue, manage customers.
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, rwf, formatDate } from "@/lib/client/api";
import StatusBadge from "@/components/StatusBadge";

type Dashboard = {
  // totalSales is money actually COLLECTED (paymentStatus = paid).
  // pendingSales is owed but not received. Neither includes cancelled orders.
  totalSales: number; pendingSales: number;
  totalOrders: number; totalCustomers: number; totalAdmins: number; totalUsers: number;
  totalProducts: number; availableProducts: number;
  pendingOrders: number; deliveredOrders: number;
  deliveries: number; pickups: number; awaitingPickup: number;
  lowStockProducts: { id: number; name: string; stock: number }[];
  recentOrders: { id: number; orderNumber: string; customerName: string; total: number; orderStatus: string; createdAt: string }[];
};

const TOOLS = [
  { href: "/admin/products/new", title: "Add product", text: "Name, price, package size, stock and photo." },
  { href: "/admin/products", title: "Edit or delete products", text: "Change prices, restock, hide or remove a product." },
  { href: "/admin/orders", title: "Manage orders", text: "Confirm, dispatch, deliver, or cancel with a reason." },
  { href: "/admin/customers", title: "Manage customers", text: "See every account and reset a forgotten password." },
  { href: "/admin/promotions", title: "Discounts & promotions", text: "Store-wide or product-level offers." },
  { href: "/admin/sales", title: "Sales report", text: "Collected revenue and best sellers." },
];

export default function AdminDashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Dashboard>("/api/admin/dashboard").then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="alert alert-error" role="alert">{error}</div>;
  if (!data) return <p className="muted">Loading dashboard...</p>;

  const stats = [
    { label: "Collected revenue", value: rwf(data.totalSales), href: "/admin/sales" },
    { label: "Awaiting payment", value: rwf(data.pendingSales), href: "/admin/orders" },
    { label: "Orders", value: data.totalOrders, href: "/admin/orders" },
    { label: "Pending orders", value: data.pendingOrders, href: "/admin/orders" },
    { label: "Users", value: `${data.totalUsers}`, sub: `${data.totalCustomers} customers · ${data.totalAdmins} admin${data.totalAdmins === 1 ? "" : "s"}`, href: "/admin/customers" },
    { label: "Products", value: `${data.availableProducts} / ${data.totalProducts}`, sub: "available / total", href: "/admin/products" },
    { label: "Low stock", value: data.lowStockProducts.length, href: "/admin/products" },
    { label: "Delivered", value: data.deliveredOrders, href: "/admin/orders" },
  ];

  return (
    <>
      <div className="admin-header">
        <h1 className="page-title" style={{ margin: 0 }}>Admin Dashboard</h1>
        <Link href="/admin/products/new" className="btn btn-primary">+ Add Product</Link>
      </div>

      {/* Numbers, each one a link into the screen that manages it. */}
      <div className="grid grid-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="card stat-card stat-card-link">
            <div className="value">{s.value}</div>
            <div className="label">{s.label}</div>
            {s.sub && <div className="stat-sub">{s.sub}</div>}
          </Link>
        ))}
      </div>

      {/* Delivery vs collection — the shape of the day. */}
      <div className="card fulfilment-split" style={{ marginTop: "1.5rem" }}>
        <h3>Today&apos;s fulfilment</h3>
        <div className="fulfilment-split-row">
          <div>
            <span className="value">{data.deliveries}</span>
            <span className="label">Deliveries</span>
          </div>
          <div>
            <span className="value">{data.pickups}</span>
            <span className="label">Pickups</span>
          </div>
          <div>
            <span className="value">{data.awaitingPickup}</span>
            <span className="label">Waiting at the counter</span>
          </div>
        </div>
        <p className="muted small">
          Pickups are customers outside the delivery area collecting at EPR Karugira.
          Open an order to see their distance and directions.
        </p>
      </div>

      {/* The management shortcuts, as cards rather than a list of links. */}
      <h2 className="section-title" style={{ fontSize: "1.5rem", margin: "2.5rem 0 1rem" }}>What you can manage</h2>
      <div className="grid grid-3">
        {TOOLS.map((t) => (
          <Link key={t.href + t.title} href={t.href} className="card tool-card">
            <strong>{t.title}</strong>
            <span>{t.text}</span>
            <span className="tool-arrow" aria-hidden="true">→</span>
          </Link>
        ))}
      </div>

      <div className="grid grid-2" style={{ marginTop: "2rem" }}>
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
    </>
  );
}
