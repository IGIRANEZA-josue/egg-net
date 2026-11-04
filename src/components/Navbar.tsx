"use client";
// Top navigation in the style of a print masthead:
// brand left · mono links · Login + black pill action on the right.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { clearAuth } from "@/lib/client/api";
import { useUser, useCartCount } from "@/lib/client/hooks";
import EggMark from "@/components/EggMark";

export default function Navbar() {
  const user = useUser() ?? null;
  const count = useCartCount();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  function logout() {
    clearAuth();
    setOpen(false);
    router.push("/login");
  }

  const link = (href: string, label: string) => (
    <li key={href}>
      <Link href={href} className={pathname === href ? "active" : ""} onClick={() => setOpen(false)}>{label}</Link>
    </li>
  );

  return (
    <header className="navbar">
      <div className="container">
        <Link href={user?.role === "admin" ? "/admin" : user ? "/dashboard" : "/"} className="brand" style={{ color: "var(--ink)" }} onClick={() => setOpen(false)}>
          <span style={{ color: "var(--ink)" }}><EggMark size={14} /></span>
          EggHub<sup>®</sup>
        </Link>

        <ul className={`nav-links ${open ? "open" : ""}`}>
          {!user && (
            <>
              {link("/", "Home")}
              {link("/products", "Products")}
              {link("/about", "About")}
              {link("/contact", "Contact")}
            </>
          )}

          {user?.role === "customer" && (
            <>
              {link("/dashboard", "Dashboard")}
              {link("/products", "Products")}
              {link("/orders", "Orders")}
              {link("/profile", "Profile")}
              {link("/cart", `Cart${count > 0 ? ` (${count})` : ""}`)}
            </>
          )}

          {user?.role === "admin" && (
            <>
              {link("/admin", "Dashboard")}
              {link("/admin/products", "Products")}
              {link("/admin/orders", "Orders")}
              {link("/admin/customers", "Customers")}
              {link("/admin/sales", "Sales")}
              {link("/admin/promotions", "Promotions")}
            </>
          )}

          {/* Login / Register live in the right corner, but stay reachable in the mobile menu */}
          {!user && (
            <>
              <li className="nav-mobile-only"><Link href="/login" onClick={() => setOpen(false)}>Login</Link></li>
              <li className="nav-mobile-only"><Link href="/register" onClick={() => setOpen(false)}>Register</Link></li>
            </>
          )}
          {user && <li><button onClick={logout}>Logout</button></li>}
        </ul>

        <div className="nav-spacer" />

        <div className="nav-right">
          {user && <span className="nav-user">{user.name.split(" ")[0]}</span>}
          {!user && <Link href="/login" className="nav-user">Login</Link>}
          {!user && <Link href="/register" className="nav-user">Register</Link>}
          {!user && <Link href="/products" className="btn btn-primary btn-sm btn-arrow">Order Now</Link>}
          {user?.role === "customer" && (
            <Link href="/cart" className="btn btn-primary btn-sm btn-arrow">
              Cart{count > 0 && <span className="nav-badge">{count}</span>}
            </Link>
          )}
          {user?.role === "admin" && <Link href="/admin/products/new" className="btn btn-primary btn-sm btn-arrow">Add Product</Link>}
        </div>

        <button className="nav-toggle" onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open}>☰</button>
      </div>
    </header>
  );
}
