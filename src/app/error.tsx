"use client";
// Global error boundary — a friendly page instead of a white screen.
import { useEffect } from "react";
import Link from "next/link";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="page container text-center">
      <h1 className="page-title">Something went wrong</h1>
      <p className="muted">An unexpected error occurred. Please try again — if it keeps happening, contact support.</p>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: "1.5rem" }}>
        <button className="btn btn-primary" onClick={reset}>Try Again</button>
        <Link href="/" className="btn btn-outline">Go Home</Link>
      </div>
    </div>
  );
}
