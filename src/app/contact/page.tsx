"use client";
// CONTACT PAGE - contact information and a real message form.
//
// The form used to fake success: it said "we received your message" while
// sending nothing. It now posts to /api/contact, which stores the message.
import { useState } from "react";
import { api } from "@/lib/client/api";

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", contact: "", message: "" });
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api("/api/contact", { method: "POST", body: form });
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page container">
      <h1 className="page-title">Contact Us</h1>
      <div className="grid grid-2">
        <div className="card">
          <h3>Get in touch</h3>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", lineHeight: 2 }}>
            <p>Kigali, Rwanda</p>
            <p>+250 788 000 000</p>
            <p>hello@egghub.rw</p>
            <p>Mon – Sat · 07:00 – 18:00</p>
          </div>
        </div>
        <div className="card">
          <h3>Send a message</h3>
          {sent ? (
            <div className="alert alert-success" role="status">Thank you. We received your message and will reply soon.</div>
          ) : (
            <form className="form" onSubmit={handleSubmit}>
              {error && <div className="alert alert-error" role="alert">{error}</div>}
              <div><label htmlFor="ct-name">Name</label><input id="ct-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><label htmlFor="ct-contact">Email or phone</label><input id="ct-contact" required value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></div>
              <div><label htmlFor="ct-message">Message</label><textarea id="ct-message" required value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></div>
              <button className="btn btn-primary" disabled={loading}>{loading ? "Sending..." : "Send Message"}</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
