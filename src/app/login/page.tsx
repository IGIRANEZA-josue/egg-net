"use client";
// LOGIN PAGE (admin and customer use the same form)
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, saveAuth, getSavedUser, type User } from "@/lib/client/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // if a saved (expired) session is present, pre-fill the email for the customer
  useEffect(() => {
    const saved = getSavedUser();
    if (saved?.email) setEmail(saved.email);
  }, []);

  // Reads the values straight from the form, so browser autofill / password
  // managers can never leave the fields filled while the state is empty.
  async function doLogin(loginEmail: string, loginPassword: string) {
    setError("");
    setLoading(true);
    try {
      const data = await api<{ token: string; user: User }>("/api/auth/login", {
        method: "POST",
        body: { email: loginEmail, password: loginPassword },
      });
      saveAuth(data.token, data.user);
      // Send admins to the admin dashboard and customers to their own dashboard.
      // ?next=/checkout brings the customer back to finish the order.
      const next = new URLSearchParams(window.location.search).get("next");
      router.push(next || (data.user.role === "admin" ? "/admin" : "/dashboard"));
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    doLogin(String(form.get("email") || "").trim(), String(form.get("password") || ""));
  }

  return (
    <div className="page container">
      <div className="card form-card">
        <h1 className="page-title">Login</h1>
        {error && <div className="alert alert-error">{error}</div>}
        <form className="form" onSubmit={handleSubmit}>
          <div>
            <label>Email</label>
            <input name="email" type="email" defaultValue={email} autoComplete="email" required />
          </div>
          <div>
            <label>Password</label>
            <input name="password" type="password" defaultValue={password} autoComplete="current-password" required />
          </div>
          <button className="btn btn-primary" disabled={loading}>{loading ? "Logging in..." : "Login"}</button>
        </form>
        <p className="muted" style={{ marginTop: "1rem" }}>
          No account? <Link href="/register" style={{ color: "var(--green-dark)", fontWeight: 600 }}>Register</Link>
        </p>

        <div className="demo-credentials">
          <span className="mono">Demo accounts — one click</span>
          <table>
            <tbody>
              <tr><td>Admin</td><td>admin@egghub.rw</td><td>Admin1234</td></tr>
              <tr><td>Customer</td><td>demo@egghub.rw</td><td>Demo1234</td></tr>
            </tbody>
          </table>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button type="button" className="btn btn-outline btn-sm" disabled={loading} onClick={() => doLogin("admin@egghub.rw", "Admin1234")}>
              Login as demo admin
            </button>
            <button type="button" className="btn btn-outline btn-sm" disabled={loading} onClick={() => doLogin("demo@egghub.rw", "Demo1234")}>
              Login as demo customer
            </button>
          </div>
          <small>Change these in .env before going live.</small>
        </div>
      </div>
    </div>
  );
}
