"use client";
// PROFILE PAGE - customer can update name, phone, address and password
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getSavedUser, saveUser, type User } from "@/lib/client/api";

export default function ProfilePage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", phone: "", address: "", password: "" });
  const [currentPassword, setCurrentPassword] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    // The cookie is HttpOnly, so the only reliable test of a session is asking
    // the server. If it answers 401 the redirect below handles it.
    api<{ user: User }>("/api/auth/profile")
      .then((data) => {
        setForm({ name: data.user.name, phone: data.user.phone || "", address: data.user.address || "", password: "" });
        setEmail(data.user.email);
      })
      .catch((err) => {
        setError(err.message);
        if (/login/i.test(err.message)) router.push("/login?next=/profile");
      });
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(""); setError("");

    if (form.password && !currentPassword) {
      setError("Please enter your current password to set a new one.");
      return;
    }

    try {
      const data = await api<{ user: User }>("/api/auth/profile", {
        method: "PUT",
        body: {
          name: form.name,
          phone: form.phone,
          address: form.address,
          ...(form.password ? { password: form.password, currentPassword } : {}),
        },
      });
      saveUser(data.user);
      setForm({ ...form, password: "" });
      setCurrentPassword("");
      setMessage("Profile updated ✓");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="page container">
      <div className="card form-card">
        <h1 className="page-title">My Profile</h1>
        {message && <div className="alert alert-success" role="status">{message}</div>}
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <form className="form" onSubmit={handleSubmit}>
          <div><label htmlFor="pf-email">Email</label><input id="pf-email" value={email} disabled /></div>
          <div><label htmlFor="pf-name">Full name</label><input id="pf-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
          <div><label htmlFor="pf-phone">Phone</label><input id="pf-phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><label htmlFor="pf-address">Default address</label><textarea id="pf-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>

          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="muted" style={{ padding: 0, marginBottom: 8 }}>Change password (optional)</legend>
            <div><label htmlFor="pf-new-password">New password (min 8 characters)</label><input id="pf-new-password" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
            <div><label htmlFor="pf-current-password">Current password</label><input id="pf-current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} disabled={!form.password} /></div>
            <small className="muted">Required so that someone who finds an open session cannot lock you out.</small>
          </fieldset>

          <button className="btn btn-primary">Save Changes</button>
        </form>
      </div>
    </div>
  );
}
