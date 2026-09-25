"use client";
// REGISTER PAGE - creates a CUSTOMER account only
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, saveAuth, type User } from "@/lib/client/api";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function update(field: string, value: string) {
    setForm({ ...form, [field]: value });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api<{ token: string; user: User }>("/api/auth/register", { method: "POST", body: form });
      saveAuth(data.token, data.user);
      router.push("/dashboard");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page container">
      <div className="card form-card">
        <h1 className="page-title">Create Account</h1>
        {error && <div className="alert alert-error">{error}</div>}
        <form className="form" onSubmit={handleSubmit}>
          <div><label>Full name</label><input value={form.name} onChange={(e) => update("name", e.target.value)} required /></div>
          <div><label>Email</label><input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} required /></div>
          <div><label>Phone</label><input value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="07XXXXXXXX" /></div>
          <div><label>Password (min 6 characters)</label><input type="password" value={form.password} onChange={(e) => update("password", e.target.value)} required minLength={6} /></div>
          <button className="btn btn-primary" disabled={loading}>{loading ? "Creating..." : "Register"}</button>
        </form>
        <p className="muted" style={{ marginTop: "1rem" }}>
          Already have an account? <Link href="/login" style={{ color: "var(--green-dark)", fontWeight: 600 }}>Login</Link>
        </p>
      </div>
    </div>
  );
}
