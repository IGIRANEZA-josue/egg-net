"use client";
// CUSTOMER DASHBOARD - the customer's home after login
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, rwf, formatDate, type User } from "@/lib/client/api";
import { useUser } from "@/lib/client/hooks";
import StatusBadge from "@/components/StatusBadge";
import OrderTracker from "@/components/OrderTracker";
import LoadingScreen from "@/components/LoadingScreen";

type Order = {
  id: number; orderNumber: string; createdAt: string; total: number;
  paymentStatus: string; orderStatus: string;
};

export default function CustomerDashboardPage() {
  const router = useRouter();
  const user = useUser();
  const [orders, setOrders] = useState<Order[] | null>(null);

  useEffect(() => {
    if (user === null) router.replace("/login");
  }, [user, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    api<{ orders: Order[] }>("/api/orders")
      .then((d) => { if (!cancelled) setOrders(d.orders); })
      .catch(() => { if (!cancelled) setOrders([]); });
    return () => { cancelled = true; };
  }, [user]);

  if (!user || orders === null) return <LoadingScreen label="Loading your dashboard" />;

  const totalSpent = orders
    .filter((o) => o.orderStatus !== "cancelled")
    .reduce((sum, o) => sum + o.total, 0);
  const latest = orders[0];
  const activeOrder = orders.find((o) => o.orderStatus !== "delivered" && o.orderStatus !== "cancelled");

  return (
    <div className="container" style={{ paddingBottom: "3rem" }}>
      <div className="admin-header" style={{ marginTop: "2.5rem" }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Muraho, {user.name.split(" ")[0]}</h1>
          <p className="mono muted" style={{ margin: 0 }}>Customer dashboard · {user.email}</p>
        </div>
        <Link href="/products" className="btn btn-primary btn-arrow">Shop Eggs</Link>
      </div>

      <div className="grid grid-3">
        <div className="card stat-card"><div className="value">{orders.length}</div><div className="label">Orders placed</div></div>
        <div className="card stat-card"><div className="value">{rwf(totalSpent)}</div><div className="label">Total spent</div></div>
        <div className="card stat-card">
          <div className="value">{latest ? <StatusBadge status={latest.orderStatus} /> : "—"}</div>
          <div className="label">Latest order</div>
        </div>
      </div>

      <div className="layout-2" style={{ marginTop: "1.5rem" }}>
        <div className="card">
          <h3>{activeOrder ? "On its way" : "Your latest order"}</h3>
          {!latest ? (
            <>
              <p className="muted">You have not placed an order yet. Pick a pack of fresh eggs and we will deliver it to your sector.</p>
              <Link href="/products" className="btn btn-primary btn-sm btn-arrow">Start shopping</Link>
            </>
          ) : (
            <>
              <p className="mono muted" style={{ margin: 0 }}>
                Order #{latest.orderNumber} · {formatDate(latest.createdAt)} · {rwf(latest.total)} · <StatusBadge status={latest.paymentStatus} />
              </p>
              <OrderTracker status={(activeOrder || latest).orderStatus} />
              <div style={{ display: "flex", gap: 8, marginTop: "1rem", flexWrap: "wrap" }}>
                <Link href={`/orders/${latest.id}`} className="btn btn-primary btn-sm">View order</Link>
                <Link href={`/orders/${latest.id}/invoice`} className="btn btn-outline btn-sm">Invoice</Link>
                <Link href="/orders" className="btn btn-outline btn-sm">All orders</Link>
              </div>
            </>
          )}
        </div>

        <div className="card">
          <h3>Quick actions</h3>
          <div className="quick-links">
            <Link href="/products">Browse egg products <span>→</span></Link>
            <Link href="/cart">Your cart <span>→</span></Link>
            <Link href="/orders">Order history <span>→</span></Link>
            <Link href="/profile">Profile & delivery details <span>→</span></Link>
            <Link href="/contact">Contact & support <span>→</span></Link>
          </div>
        </div>
      </div>

      {orders.length > 0 && (
        <div className="card table-wrap" style={{ marginTop: "1.5rem" }}>
          <h3>Recent orders</h3>
          <table>
            <thead><tr><th>Order</th><th>Date</th><th>Total</th><th>Payment</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {orders.slice(0, 5).map((o) => (
                <tr key={o.id}>
                  <td>#{o.orderNumber}</td>
                  <td>{formatDate(o.createdAt)}</td>
                  <td>{rwf(o.total)}</td>
                  <td><StatusBadge status={o.paymentStatus} /></td>
                  <td><StatusBadge status={o.orderStatus} /></td>
                  <td><Link href={`/orders/${o.id}`} className="btn btn-outline btn-sm">View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
