"use client";
// PROFILE PAGE - customer can update name, phone, address and password
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getSavedUser, saveAuth, getToken, type User } from "@/lib/client/api";

export default function ProfilePage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", phone: "", address: "", password: "" });
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getSavedUser()) { router.push("/login"); return; }
    api<{ user: User }>("/api/auth/profile")
      .then((data) => {
        setForm({ name: data.user.name, phone: data.user.phone || "", address: data.user.address || "", password: "" });
        setEmail(data.user.email);
      })
      .catch((err) => setError(err.message));
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(""); setError("");
    try {
      const data = await api<{ user: User }>("/api/auth/profile", { method: "PUT", body: form });
      saveAuth(getToken() || "", data.user);
      setForm({ ...form, password: "" });
      setMessage("Profile updated ✓");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="page container">
      <div className="card form-card">
        <h1 className="page-title">My Profile</h1>
        {message && <div className="alert alert-success">{message}</div>}
        {error && <div className="alert alert-error">{error}</div>}
        <form className="form" onSubmit={handleSubmit}>
          <div><label>Email</label><input value={email} disabled /></div>
          <div><label>Full name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
          <div><label>Phone</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><label>Default address</label><textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div><label>New password (leave empty to keep current)</label><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
          <button className="btn btn-primary">Save Changes</button>
        </form>
      </div>
    </div>
  );
}
