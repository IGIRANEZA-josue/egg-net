"use client";
// LOGIN PAGE (admin and customer use the same form)
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, saveAuth, type User } from "@/lib/client/api";
import { useUser } from "@/lib/client/hooks";

// One-click demo logins are only shown in development, or when the deployment
// explicitly opts in with NEXT_PUBLIC_ENABLE_DEMO=true (throwaway demos).
const SHOW_DEMO = process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_ENABLE_DEMO === "true";

export default function LoginPage() {
  const router = useRouter();
  const saved = useUser();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
      const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
      router.push(safeNext || (data.user.role === "admin" ? "/admin" : "/dashboard"));
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
            {/* key remounts the input once the saved email is known, so the
                uncontrolled field picks it up without an effect */}
            <input key={saved?.email ?? "blank"} name="email" type="email" defaultValue={saved?.email ?? ""} autoComplete="email" required />
          </div>
          <div>
            <label>Password</label>
            <input name="password" type="password" autoComplete="current-password" required />
          </div>
          <button className="btn btn-primary" disabled={loading}>{loading ? "Logging in..." : "Login"}</button>
        </form>
        <p className="muted" style={{ marginTop: "1rem" }}>
          No account? <Link href="/register" style={{ color: "var(--green-dark)", fontWeight: 600 }}>Register</Link>
        </p>

        {SHOW_DEMO && (
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
            <small>Demo mode — disabled in production unless NEXT_PUBLIC_ENABLE_DEMO=true.</small>
          </div>
        )}
      </div>
    </div>
  );
}
