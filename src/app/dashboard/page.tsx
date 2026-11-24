"use client";
// CUSTOMER DASHBOARD - the customer's home after login
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, rwf, formatDate, getSavedUser, type User } from "@/lib/client/api";
import StatusBadge from "@/components/StatusBadge";
import OrderTracker from "@/components/OrderTracker";
import LoadingScreen from "@/components/LoadingScreen";

type Order = {
  id: number; orderNumber: string; createdAt: string; total: number;
  paymentStatus: string; orderStatus: string;
};

export default function CustomerDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = getSavedUser();
    if (!saved) { router.replace("/login"); return; }
    // Hydrating from localStorage, which is unavailable during SSR.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUser(saved);
    api<{ orders: Order[] }>("/api/orders")
      .then((d) => setOrders(d.orders))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading || !user) return <LoadingScreen label="Loading your dashboard" />;

  const totalSpent = orders
    .filter((o) => o.orderStatus !== "cancelled")
    .reduce((sum, o) => sum + o.total, 0);
  const latest = orders[0];
  const activeOrders = orders.filter((o) => o.orderStatus !== "delivered" && o.orderStatus !== "cancelled");
  // One object drives the tracker, the header and every link. Previously the
  // header/tracker used `activeOrder` while the number and links used `latest`,
  // so the card could label one order with another order's progress.
  const focus = activeOrders[0] ?? latest;

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
          <h3>{activeOrders.length ? "On its way" : "Your latest order"}</h3>
          {!focus ? (
            <>
              <p className="muted">You have not placed an order yet. Pick a pack of fresh eggs and we will deliver it to your sector.</p>
              <Link href="/products" className="btn btn-primary btn-sm btn-arrow">Start shopping</Link>
            </>
          ) : (
            <>
              <p className="mono muted" style={{ margin: 0 }}>
                Order #{focus.orderNumber} · {formatDate(focus.createdAt)} · {rwf(focus.total)} · <StatusBadge status={focus.paymentStatus} />
              </p>
              <OrderTracker status={focus.orderStatus} />
              {activeOrders.length > 1 && (
                <p className="muted" style={{ marginTop: 8 }}>
                  You have {activeOrders.length} orders in progress. <Link href="/orders">See all orders</Link>.
                </p>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: "1rem", flexWrap: "wrap" }}>
                <Link href={`/orders/${focus.id}`} className="btn btn-primary btn-sm">View order</Link>
                <Link href={`/orders/${focus.id}/invoice`} className="btn btn-outline btn-sm">Invoice</Link>
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
