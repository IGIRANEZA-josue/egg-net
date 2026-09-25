"use client";
// ORDER HISTORY PAGE (customer)
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, rwf, formatDate, getSavedUser } from "@/lib/client/api";
import StatusBadge from "@/components/StatusBadge";

type Order = { id: number; orderNumber: string; createdAt: string; total: number; paymentStatus: string; orderStatus: string };

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getSavedUser()) { router.push("/login"); return; }
    api<{ orders: Order[] }>("/api/orders").then((d) => setOrders(d.orders)).finally(() => setLoading(false));
  }, [router]);

  return (
    <div className="page container">
      <h1 className="page-title">My Orders</h1>
      {loading ? <p className="muted">Loading...</p> : orders.length === 0 ? (
        <div className="card text-center"><p>You have no orders yet.</p><Link href="/products" className="btn btn-primary">Shop Eggs</Link></div>
      ) : (
        <div className="grid grid-2">
          {orders.map((o) => (
            <div className="card" key={o.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3>Order #{o.orderNumber}</h3>
                <StatusBadge status={o.orderStatus} />
              </div>
              <p className="muted">{formatDate(o.createdAt)}</p>
              <p><strong>{rwf(o.total)}</strong> · Payment: <StatusBadge status={o.paymentStatus} /></p>
              <Link href={`/orders/${o.id}`} className="btn btn-outline btn-sm">View Order</Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
