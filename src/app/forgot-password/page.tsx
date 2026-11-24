"use client";
// FORGOT PASSWORD - always shows the same confirmation, never reveals accounts.
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api("/api/auth/forgot-password", { method: "POST", body: { email } });
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page container">
      <div className="card form-card">
        <h1 className="page-title">Forgot password</h1>
        {sent ? (
          <div className="alert alert-success" role="status">
            If that email is registered, a reset link has been sent. The link expires in one hour.
          </div>
        ) : (
          <form className="form" onSubmit={handleSubmit}>
            {error && <div className="alert alert-error" role="alert">{error}</div>}
            <p className="muted">Enter the email you registered with and we will send you a reset link.</p>
            <div>
              <label htmlFor="fp-email">Email</label>
              <input id="fp-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <button className="btn btn-primary" disabled={loading}>{loading ? "Sending..." : "Send reset link"}</button>
          </form>
        )}
        <p className="muted" style={{ marginTop: "1rem" }}>
          <Link href="/login" style={{ color: "var(--green-dark)", fontWeight: 600 }}>Back to login</Link>
        </p>
      </div>
    </div>
  );
}
