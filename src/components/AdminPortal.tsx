"use client";
// ADMIN PORTAL — the admin entry point in the site footer.
//
// Two states, decided by asking the server (never by trusting localStorage):
//   signed in as admin -> a menu of every admin screen, plus a way out
//   everyone else      -> a login link that returns to /admin afterwards
//
// The menu items are the real routes; the admin layout still checks the role on
// every request, so this is a door, not a lock.
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, getSavedUser } from "@/lib/client/api";

type AdminUser = { id: number; name: string; role: string };

const ADMIN_LINKS = [
  { href: "/admin", label: "Dashboard", hint: "Sales, orders, low stock" },
  { href: "/admin/products", label: "Products", hint: "Edit, restock, delete" },
  { href: "/admin/products/new", label: "Add product", hint: "New egg product" },
  { href: "/admin/orders", label: "Orders", hint: "Status & payments" },
  { href: "/admin/customers", label: "Customers", hint: "Accounts & password reset" },
  { href: "/admin/promotions", label: "Promotions", hint: "Discounts" },
  { href: "/admin/sales", label: "Sales", hint: "Revenue by day" },
  { href: "/profile", label: "My account", hint: "Name & password" },
];

export default function AdminPortal() {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;

    // The cached profile decides only whether to ASK; the answer comes from the
    // server, so a stale or edited localStorage entry cannot open the menu.
    // A visitor without an admin profile never triggers the request at all.
    if (getSavedUser()?.role !== "admin") return;

    api<{ user: AdminUser }>("/api/auth/profile")
      .then((data) => {
        if (active && data.user.role === "admin") setAdmin(data.user);
      })
      .catch(() => {
        if (active) setAdmin(null);
      });

    return () => {
      active = false;
    };
  }, []);

  async function signOut() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    setAdmin(null);
    setOpen(false);
  }

  if (!admin) {
    return (
      <Link href="/login?next=/admin" className="admin-portal-link">
        Admin portal <span aria-hidden="true">→</span>
      </Link>
    );
  }

  return (
    <div className={`admin-portal ${open ? "open" : ""}`}>
      <button
        type="button"
        className="admin-portal-link"
        aria-expanded={open}
        aria-controls="admin-portal-menu"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="admin-portal-dot" aria-hidden="true" />
        Admin portal <span className="admin-portal-user">({admin.name.split(" ")[0]})</span>
        <span aria-hidden="true">{open ? "▾" : "▴"}</span>
      </button>

      <div id="admin-portal-menu" className="admin-portal-menu" hidden={!open}>
        <p className="admin-portal-title">Manage the shop</p>
        <ul>
          {ADMIN_LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href} onClick={() => setOpen(false)}>
                <span>{l.label}</span>
                <small>{l.hint}</small>
              </Link>
            </li>
          ))}
        </ul>
        <button type="button" className="admin-portal-signout" onClick={signOut}>Sign out of admin</button>
      </div>
    </div>
  );
}
