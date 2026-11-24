"use client";
// ADMIN SALES: statistics with a small CSS bar chart (no chart library needed).
// Only paid, non-cancelled orders count as revenue, and days are bucketed in
// Rwanda local time (Africa/Kigali) rather than UTC.
import { useEffect, useState } from "react";
import { api, rwf } from "@/lib/client/api";

type Sales = {
  topProducts: { productId: number; name: string; quantity: number; revenue: number }[];
  dailySales: { date: string; total: number }[];
  collectedSales: number;
  paidOrders: number;
};

export default function AdminSalesPage() {
  const [data, setData] = useState<Sales | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api<Sales>("/api/admin/sales")
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) return <div className="alert alert-error" role="alert">{error}</div>;
  if (!data) return <p className="muted">Loading sales...</p>;

  const maxDay = Math.max(1, ...data.dailySales.map((d) => d.total));
  const productsSold = data.topProducts.reduce((sum, p) => sum + p.quantity, 0);

  return (
    <>
      <h1 className="page-title">Sales</h1>
      <div className="grid grid-3">
        <div className="card stat-card">
          <div className="value">{rwf(data.collectedSales)}</div>
          <div className="label">Collected (paid orders only)</div>
        </div>
        <div className="card stat-card">
          <div className="value">{data.paidOrders}</div>
          <div className="label">Paid orders</div>
        </div>
        <div className="card stat-card">
          <div className="value">{productsSold}</div>
          <div className="label">Products sold (top 5)</div>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginTop: "1.5rem" }}>
        <div className="card">
          <h3>Collected sales — last 7 days</h3>
          <div className="bar-chart">
            {data.dailySales.map((d) => (
              <div key={d.date} className="bar" style={{ height: `${(d.total / maxDay) * 100}%` }} title={`${d.date}: ${rwf(d.total)}`}>
                <span>{d.date.slice(5)}</span>
              </div>
            ))}
          </div>
          <div style={{ height: 24 }} />
        </div>

        <div className="card">
          <h3>Most Ordered Products</h3>
          {data.topProducts.length === 0 ? (
            <p className="muted">No paid sales yet.</p>
          ) : (
            <table>
              <thead><tr><th>Product</th><th>Qty</th><th>Revenue</th></tr></thead>
              <tbody>
                {data.topProducts.map((p) => (
                  <tr key={p.productId}><td>{p.name}</td><td>{p.quantity}</td><td>{rwf(p.revenue)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
