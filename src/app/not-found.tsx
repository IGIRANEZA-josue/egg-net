// 404 page — keeps the printed-catalogue style.
import Link from "next/link";
import EggMark from "@/components/EggMark";

export default function NotFound() {
  return (
    <div className="page container text-center">
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "1rem", color: "var(--ink)" }}>
        <EggMark size={64} />
      </div>
      <h1 className="page-title">Page not found</h1>
      <p className="muted">The page you are looking for does not exist — it may have been moved or removed.</p>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: "1.5rem" }}>
        <Link href="/" className="btn btn-primary">Go Home</Link>
        <Link href="/products" className="btn btn-outline">Browse Products</Link>
      </div>
    </div>
  );
}
