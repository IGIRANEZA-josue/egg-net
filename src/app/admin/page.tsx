"use client";
// ADMIN OVERVIEW — one screen that answers "how is the shop doing?".
// Users, eggs, stock, movements and money, then the most recent activity.
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, rwf, formatDate } from "@/lib/client/api";
import StatusBadge from "@/components/StatusBadge";

type Movement = {
  id: number; direction: string; quantity: number; reason: string;
  source: string; createdAt: string; productName: string; orderNumber: string | null;
};

type Dashboard = {
  totalSales: number; pendingSales: number;
  totalOrders: number; totalCustomers: number; totalAdmins: number; totalUsers: number;
  totalProducts: number; availableProducts: number;
  pendingOrders: number; deliveredOrders: number;
  deliveries: number; pickups: number; awaitingPickup: number;
  lowStockProducts: { id: number; name: string; stock: number }[];
  recentOrders: { id: number; orderNumber: string; customerName: string; total: number; orderStatus: string; createdAt: string }[];
  totalStock: number; totalListings: number; activeListings: number;
  lowStockCount: number; outOfStockCount: number; stockValue: number;
  totalStockIn: number; totalStockOut: number; movementCount: number;
  recentMovements: Movement[];
  dailySales: { day: string; total: number }[];
};

export default function AdminDashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Dashboard>("/api/admin/dashboard")
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, []);

  if (error) return <div className="alert alert-error" role="alert">{error}</div>;
  if (!data) return <p className="muted">Loading the dashboard...</p>;

  // The chart needs a bar per day even when nothing was sold.
  const days = data.dailySales ?? [];
  const peak = Math.max(1, ...days.map((d) => d.total));

  return (
    <>
      <div className="section-head" style={{ marginBottom: "1.5rem" }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>Overview</h1>
        <Link href="/admin/inventory" className="btn btn-outline btn-sm">Record stock</Link>
      </div>

      {/* ---- the numbers ---- */}
      <div className="grid grid-4 admin-stats">
        <div className="card stat-card">
          <div className="value">{data.totalUsers}</div>
          <div className="label">Registered users</div>
          <p className="stat-sub">{data.totalCustomers} customers · {data.totalAdmins} admins</p>
        </div>
        <div className="card stat-card">
          <div className="value">{data.totalListings}</div>
          <div className="label">Egg listings</div>
          <p className="stat-sub">{data.activeListings} visible in the shop</p>
        </div>
        <div className="card stat-card">
          <div className="value">{data.totalStock.toLocaleString()}</div>
          <div className="label">Eggs in stock</div>
          <p className="stat-sub">{rwf(data.stockValue)} at list price</p>
        </div>
        <div className="card stat-card">
          <div className="value">{data.totalOrders}</div>
          <div className="label">Orders</div>
          <p className="stat-sub">{data.pendingOrders} awaiting action</p>
        </div>

        <div className="card stat-card">
          <div className="value">{data.totalStockIn.toLocaleString()}</div>
          <div className="label">Eggs received</div>
          <p className="stat-sub">All stock-in, ever</p>
        </div>
        <div className="card stat-card">
          <div className="value">{data.totalStockOut.toLocaleString()}</div>
          <div className="label">Eggs out</div>
          <p className="stat-sub">Sales and removals</p>
        </div>
        <div className="card stat-card">
          <div className="value">{rwf(data.totalSales)}</div>
          <div className="label">Collected</div>
          <p className="stat-sub">{rwf(data.pendingSales)} still owed</p>
        </div>
        <div className="card stat-card">
          <div className="value">{data.movementCount}</div>
          <div className="label">Inventory records</div>
          <p className="stat-sub">Every movement, logged</p>
        </div>
      </div>

      {/* ---- stock health + fulfilment ---- */}
      <div className="grid grid-2 admin-panels">
        <div className="card">
          <h2 className="panel-title">Stock health</h2>
          <ul className="admin-list">
            <li><span>Low stock (5 or fewer)</span><strong>{data.lowStockCount}</strong></li>
            <li><span>Out of stock</span><strong>{data.outOfStockCount}</strong></li>
            <li><span>Delivered orders</span><strong>{data.deliveredOrders}</strong></li>
            <li><span>Delivery / pickup</span><strong>{data.deliveries} / {data.pickups}</strong></li>
            <li><span>Pickups at the counter</span><strong>{data.awaitingPickup}</strong></li>
          </ul>
          <Link href="/admin/inventory" className="link-arrow">Manage inventory</Link>
        </div>

        <div className="card">
          <h2 className="panel-title">Collected, last 7 days</h2>
          {days.length === 0 ? (
            <p className="muted">No paid orders in the last week.</p>
          ) : (
            <div className="mini-chart" role="img" aria-label="Bar chart of daily collected revenue for the last 7 days">
              {days.map((d) => (
                <div key={d.day} className="mini-chart-bar">
                  <div className="mini-chart-fill" style={{ height: `${Math.max(4, (d.total / peak) * 100)}%` }} />
                  <span className="mini-chart-value">{d.total > 0 ? rwf(d.total) : ""}</span>
                  <span className="mini-chart-label">{d.day.slice(5)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ---- recent activity ---- */}
      <div className="grid grid-2 admin-panels">
        <div className="card">
          <h2 className="panel-title">Recent inventory activity</h2>
          {data.recentMovements.length === 0 ? (
            <p className="muted">
              Nothing recorded yet. <Link href="/admin/inventory">Record stock in</Link> to start the ledger.
            </p>
          ) : (
            <ul className="activity-list">
              {data.recentMovements.map((m) => (
                <li key={m.id}>
                  <span className={`activity-dot ${m.direction}`} aria-hidden="true" />
                  <div>
                    <strong>
                      {m.direction === "in" ? "+" : "−"}{m.quantity} · {m.productName}
                    </strong>
                    <small>{m.reason}{m.source ? ` · ${m.source}` : ""} · {formatDate(m.createdAt)}</small>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h2 className="panel-title">Recent orders</h2>
          {data.recentOrders.length === 0 ? (
            <p className="muted">No orders yet.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {data.recentOrders.map((o) => (
                    <tr key={o.id}>
                      <td className="mono"><Link href={`/admin/orders?order=${o.id}`}>{o.orderNumber}</Link></td>
                      <td>{o.customerName}</td>
                      <td>{rwf(o.total)}</td>
                      <td><StatusBadge status={o.orderStatus} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
