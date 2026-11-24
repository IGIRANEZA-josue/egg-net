"use client";
// Route-level error boundary. Without this, a thrown error showed Next's default
// page - and with no boundary at all, a render crash left a blank screen.
import { useEffect } from "react";
import Link from "next/link";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app] render error", error);
  }, [error]);

  return (
    <div className="page container">
      <div className="card" style={{ maxWidth: 640, margin: "3rem auto" }}>
        <h1 className="page-title">Something went wrong</h1>
        <p className="muted">
          We could not load this page. Your cart and your orders are safe — try again, and if it keeps happening please
          contact us.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: "1rem" }}>
          <button className="btn btn-primary" onClick={reset}>Try again</button>
          <Link className="btn btn-outline" href="/">Go home</Link>
        </div>
      </div>
    </div>
  );
}
