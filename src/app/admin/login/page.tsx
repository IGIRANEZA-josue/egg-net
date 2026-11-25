"use client";
// ADMIN SIGN-IN — a separate door for staff.
//
// The customer login at /login still works for admins, but this page is the one
// the footer's Admin link points at: it never redirects a customer into the
// admin area, and it refuses non-admin accounts with a clear message instead of
// silently landing them on the customer dashboard.
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, saveUser, type User } from "@/lib/client/api";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api<{ user: User }>("/api/auth/login", {
        method: "POST",
        body: { email, password },
      });
      if (data.user.role !== "admin") {
        // Credentials were valid, but this is not an admin. Do not keep them
        // signed in to an area they cannot use.
        await api("/api/auth/logout", { method: "POST" }).catch(() => {});
        setError("That account is not an administrator.");
        setLoading(false);
        return;
      }
      saveUser(data.user);
      router.replace("/admin");
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <div className="page container admin-login">
      <div className="card form-card">
        <p className="mono admin-login-kicker">EggHub Rwanda</p>
        <h1 className="page-title">Admin sign-in</h1>
        <p className="muted admin-login-lead">
          For shop staff only. Customers should <Link href="/login">log in here</Link>.
        </p>

        {error && <div className="alert alert-error" role="alert">{error}</div>}

        <form className="form" onSubmit={submit}>
          <div>
            <label htmlFor="admin-email">Email</label>
            <input
              id="admin-email"
              name="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="admin-password">Password</label>
            <input
              id="admin-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button className="btn btn-primary" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="muted" style={{ marginTop: "1rem" }}>
          <Link href="/">← Back to the shop</Link>
        </p>
      </div>
    </div>
  );
}
