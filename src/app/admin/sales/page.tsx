"use client";
// ADMIN SALES: simple statistics with a small CSS bar chart (no chart library needed)
import { useEffect, useState } from "react";
import { api, rwf, formatDate } from "@/lib/client/api";
import StatusBadge from "@/components/StatusBadge";

type Sales = {
  totalSales: number; totalOrders: number; productsSold: number;
  topProducts: { productId: number; name: string; quantity: number; revenue: number }[];
  recentOrders: { id: number; orderNumber: string; customerName: string; total: number; orderStatus: string; createdAt: string }[];
  salesByDay: { date: string; total: number }[];
};

export default function AdminSalesPage() {
  const [data, setData] = useState<Sales | null>(null);
  useEffect(() => { api<Sales>("/api/admin/sales").then(setData); }, []);
  if (!data) return <p className="muted">Loading sales...</p>;

  const maxDay = Math.max(1, ...data.salesByDay.map((d) => d.total));

  return (
    <>
      <h1 className="page-title">Sales</h1>
      <div className="grid grid-3">
        <div className="card stat-card"><div className="value">{rwf(data.totalSales)}</div><div className="label">Total Sales</div></div>
        <div className="card stat-card"><div className="value">{data.totalOrders}</div><div className="label">Orders</div></div>
        <div className="card stat-card"><div className="value">{data.productsSold}</div><div className="label">Products Sold</div></div>
      </div>

      <div className="grid grid-2" style={{ marginTop: "1.5rem" }}>
        <div className="card">
          <h3>Sales – last 7 days</h3>
          <div className="bar-chart">
            {data.salesByDay.map((d) => (
              <div key={d.date} className="bar" style={{ height: `${(d.total / maxDay) * 100}%` }} title={`${d.date}: ${rwf(d.total)}`}>
                <span>{d.date.slice(5)}</span>
              </div>
            ))}
          </div>
          <div style={{ height: 24 }} />
        </div>
        <div className="card">
          <h3>Most Ordered Products</h3>
          {data.topProducts.length === 0 ? <p className="muted">No sales yet.</p> : (
            <table>
              <thead><tr><th>Product</th><th>Qty</th><th>Revenue</th></tr></thead>
              <tbody>{data.topProducts.map((p) => <tr key={p.productId}><td>{p.name}</td><td>{p.quantity}</td><td>{rwf(p.revenue)}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card table-wrap" style={{ marginTop: "1.5rem" }}>
        <h3>Recent Orders</h3>
        <table>
          <thead><tr><th>Order</th><th>Customer</th><th>Date</th><th>Total</th><th>Status</th></tr></thead>
          <tbody>
            {data.recentOrders.map((o) => (
              <tr key={o.id}><td>#{o.orderNumber}</td><td>{o.customerName}</td><td>{formatDate(o.createdAt)}</td><td>{rwf(o.total)}</td><td><StatusBadge status={o.orderStatus} /></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
