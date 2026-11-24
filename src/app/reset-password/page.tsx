"use client";
// RESET PASSWORD - consumes the token from the emailed link.
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/client/api";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const data = await api<{ message: string }>("/api/auth/reset-password", {
        method: "POST",
        body: { token, newPassword: password },
      });
      setMessage(data.message);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (!token && !message) {
    return <div className="alert alert-error">This reset link is incomplete. Please request a new one from the login page.</div>;
  }

  return (
    <>
      {message ? (
        <div className="alert alert-success" role="status">
          {message} <Link href="/login">Log in</Link>
        </div>
      ) : (
        <form className="form" onSubmit={handleSubmit}>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          <div>
            <label htmlFor="rp-password">New password (min 8 characters)</label>
            <input id="rp-password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div>
            <label htmlFor="rp-confirm">Confirm new password</label>
            <input id="rp-confirm" type="password" autoComplete="new-password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          <button className="btn btn-primary" disabled={loading}>{loading ? "Saving..." : "Set new password"}</button>
        </form>
      )}
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="page container">
      <div className="card form-card">
        <h1 className="page-title">Choose a new password</h1>
        <Suspense fallback={<p className="muted">Loading...</p>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
