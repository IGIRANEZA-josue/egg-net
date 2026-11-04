"use client";
// PROFILE PAGE - customer can update name, phone, address and password
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, saveAuth, getToken, type User } from "@/lib/client/api";
import { useUser } from "@/lib/client/hooks";

export default function ProfilePage() {
  const router = useRouter();
  const user = useUser();
  const [form, setForm] = useState({ name: "", phone: "", address: "", password: "", currentPassword: "" });
  const [email, setEmail] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (user === null) router.replace("/login?next=/profile");
  }, [user, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    api<{ user: User }>("/api/auth/profile")
      .then((data) => {
        if (cancelled) return;
        setForm({ name: data.user.name, phone: data.user.phone || "", address: data.user.address || "", password: "", currentPassword: "" });
        setEmail(data.user.email);
        setLoaded(true);
      })
      .catch((err) => { if (!cancelled) setError((err as Error).message); });
    return () => { cancelled = true; };
  }, [user]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(""); setError("");
    try {
      const body: Record<string, string> = { name: form.name, phone: form.phone, address: form.address };
      if (form.password) {
        body.password = form.password;
        body.currentPassword = form.currentPassword;
      }
      const data = await api<{ user: User }>("/api/auth/profile", { method: "PUT", body });
      saveAuth(getToken() || "", data.user);
      setForm((f) => ({ ...f, password: "", currentPassword: "" }));
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
          <div><label>Full name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={120} disabled={!loaded} /></div>
          <div><label>Phone</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={20} disabled={!loaded} /></div>
          <div><label>Default address</label><textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} maxLength={300} disabled={!loaded} /></div>
          <div><label>New password (leave empty to keep current)</label><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={form.password ? 8 : undefined} autoComplete="new-password" /></div>
          {form.password && (
            <div><label>Current password (required to change password)</label><input type="password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} required autoComplete="current-password" /></div>
          )}
          <button className="btn btn-primary" disabled={!loaded}>Save Changes</button>
        </form>
      </div>
    </div>
  );
}
