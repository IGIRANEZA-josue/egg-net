"use client";
// LOGIN PAGE (admin and customer use the same form)
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, saveUser, getSavedUser, type User } from "@/lib/client/api";

/** Only allow same-site redirects: `?next=https://evil.example` must not work. */
export function safeNextPath(next: string | null): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  try {
    const url = new URL(next, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

const DEMO_ENABLED = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
const DEMO_ADMIN_EMAIL = process.env.NEXT_PUBLIC_DEMO_ADMIN_EMAIL || "admin@egghub.rw";
const DEMO_ADMIN_PASSWORD = process.env.NEXT_PUBLIC_DEMO_ADMIN_PASSWORD || "";
const DEMO_CUSTOMER_EMAIL = process.env.NEXT_PUBLIC_DEMO_CUSTOMER_EMAIL || "demo@egghub.rw";
const DEMO_CUSTOMER_PASSWORD = process.env.NEXT_PUBLIC_DEMO_CUSTOMER_PASSWORD || "";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // If a saved profile is present, pre-fill the email for the customer.
  // localStorage is unavailable during SSR, so this runs after mount.
  useEffect(() => {
    const saved = getSavedUser();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved?.email) setEmail(saved.email);
  }, []);

  // Reads the values straight from the form, so browser autofill / password
  // managers can never leave the fields filled while the state is empty.
  async function doLogin(loginEmail: string, loginPassword: string) {
    setError("");
    setLoading(true);
    try {
      const data = await api<{ user: User }>("/api/auth/login", {
        method: "POST",
        body: { email: loginEmail, password: loginPassword },
      });
      // The token is in an HttpOnly cookie now; only the profile is cached.
      saveUser(data.user);
      router.replace(safeNextPath(new URLSearchParams(window.location.search).get("next")) ?? (data.user.role === "admin" ? "/admin" : "/dashboard"));
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
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <form className="form" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="login-email">Email</label>
            <input id="login-email" name="email" type="email" defaultValue={email} autoComplete="email" required />
          </div>
          <div>
            <label htmlFor="login-password">Password</label>
            <input id="login-password" name="password" type="password" defaultValue={password} autoComplete="current-password" required />
          </div>
          <button className="btn btn-primary" disabled={loading}>{loading ? "Logging in..." : "Login"}</button>
        </form>
        <p className="muted" style={{ marginTop: "1rem" }}>
          No account? <Link href="/register" style={{ color: "var(--green-dark)", fontWeight: 600 }}>Register</Link>
          {" · "}
          <Link href="/forgot-password" style={{ color: "var(--green-dark)", fontWeight: 600 }}>Forgot password?</Link>
        </p>

        {/* Demo accounts exist only when DEMO_MODE is explicitly enabled. The
            old version printed the admin password here unconditionally. */}
        {DEMO_ENABLED && (
          <div className="demo-credentials">
            <span className="mono">Demo accounts — one click</span>
            <table>
              <tbody>
                <tr><td>Admin</td><td>{DEMO_ADMIN_EMAIL}</td><td>{DEMO_ADMIN_PASSWORD || "(set NEXT_PUBLIC_DEMO_ADMIN_PASSWORD)"}</td></tr>
                <tr><td>Customer</td><td>{DEMO_CUSTOMER_EMAIL}</td><td>{DEMO_CUSTOMER_PASSWORD || "(set NEXT_PUBLIC_DEMO_CUSTOMER_PASSWORD)"}</td></tr>
              </tbody>
            </table>
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <button type="button" className="btn btn-outline btn-sm" disabled={loading || !DEMO_ADMIN_PASSWORD} onClick={() => doLogin(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD)}>
                Login as demo admin
              </button>
              <button type="button" className="btn btn-outline btn-sm" disabled={loading || !DEMO_CUSTOMER_PASSWORD} onClick={() => doLogin(DEMO_CUSTOMER_EMAIL, DEMO_CUSTOMER_PASSWORD)}>
                Login as demo customer
              </button>
            </div>
            <small>Demo mode is on. Never enable DEMO_MODE on a public deployment.</small>
          </div>
        )}
      </div>
    </div>
  );
}
