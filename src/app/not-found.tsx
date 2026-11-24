import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page container">
      <div className="card" style={{ maxWidth: 640, margin: "3rem auto" }}>
        <h1 className="page-title">Page not found</h1>
        <p className="muted">That page does not exist, or the egg has rolled away.</p>
        <div style={{ display: "flex", gap: 8, marginTop: "1rem" }}>
          <Link href="/products" className="btn btn-primary">Browse products</Link>
          <Link href="/" className="btn btn-outline">Go home</Link>
        </div>
      </div>
    </div>
  );
}
