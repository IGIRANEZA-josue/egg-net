"use client";
// CONTACT PAGE - simple contact information and a message form (shows a confirmation only)
import { useState } from "react";

export default function ContactPage() {
  const [sent, setSent] = useState(false);

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
            <div className="alert alert-success">Thank you. We received your message and will reply soon.</div>
          ) : (
            <form className="form" onSubmit={(e) => { e.preventDefault(); setSent(true); }}>
              <div><label>Name</label><input required /></div>
              <div><label>Email or phone</label><input required /></div>
              <div><label>Message</label><textarea required /></div>
              <button className="btn btn-primary">Send Message</button>
              <small className="muted">Note: this form does not send email yet. Email/SMS notifications can be configured later.</small>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
