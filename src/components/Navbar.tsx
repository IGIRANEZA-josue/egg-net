"use client";
// Top navigation in the style of a print masthead:
// brand left · mono links · Login + black pill action on the right.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSavedUser, logout as endSession, type User } from "@/lib/client/api";
import { cartCount } from "@/lib/client/cart";
import EggMark from "@/components/EggMark";

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null);
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const refresh = () => {
      setUser(getSavedUser());
      setCount(cartCount());
    };
    refresh();
    window.addEventListener("egghub-auth", refresh);
    window.addEventListener("egghub-cart", refresh);
    return () => {
      window.removeEventListener("egghub-auth", refresh);
      window.removeEventListener("egghub-cart", refresh);
    };
  }, []);

  async function logout() {
    // Expires the HttpOnly cookie on the server, then clears the cached profile.
    await endSession();
    router.push("/login");
  }

  // Close the menu when a link is tapped. Tapping the page you are already on
  // does not change the pathname, so relying on the pathname alone left the
  // menu open over the page.
  const closeMenu = () => setOpen(false);

  // Escape closes it, and the page behind must not scroll while it is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  const link = (href: string, label: string) => (
    <li key={href}>
      <Link href={href} className={pathname === href ? "active" : ""} onClick={closeMenu}>{label}</Link>
    </li>
  );

  return (
    <header className="navbar">
      <div className="container">
        <Link href={user?.role === "admin" ? "/admin" : user ? "/dashboard" : "/"} className="brand" style={{ color: "var(--ink)" }}>
          <span style={{ color: "var(--ink)" }}><EggMark size={14} /></span>
          EggHub<sup>®</sup>
        </Link>

        <ul id="primary-navigation" className={`nav-links ${open ? "open" : ""}`}>
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

          {/* The top bar hides Login/Register below 900px to save room, so they
              stay reachable here on phones. */}
          {!user && (
            <>
              <li className="nav-mobile-only"><Link href="/login" onClick={closeMenu}>Login</Link></li>
              <li className="nav-mobile-only"><Link href="/register" onClick={closeMenu}>Register</Link></li>
            </>
          )}
          {user && <li><button onClick={() => { closeMenu(); void logout(); }}>Logout</button></li>}
        </ul>

        <div className="nav-spacer" />

        {user?.mustChangePassword && (
          <Link href="/profile" className="nav-must-change" title="Change your password">
            Change password
          </Link>
        )}

        <div className="nav-right">
          {user && <span className="nav-user">{user.name.split(" ")[0]}</span>}
          {!user && <Link href="/login" className="nav-user">Login</Link>}
          {!user && <Link href="/register" className="nav-user">Register</Link>}
          {!user && <Link href="/products" className="btn btn-primary btn-sm btn-arrow">Order Now</Link>}
          {user?.role === "customer" && (
            <Link href="/cart" className="btn btn-primary btn-sm btn-arrow nav-action-cart">
              Cart{count > 0 && <span className="nav-badge">{count}</span>}
            </Link>
          )}
          {user?.role === "admin" && <Link href="/admin/products/new" className="btn btn-primary btn-sm btn-arrow nav-action-add">Add Product</Link>}
        </div>

        <button
          className={`nav-toggle ${open ? "is-open" : ""}`}
          onClick={() => setOpen(!open)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="primary-navigation"
        >
          {open ? "✕" : "☰"}
        </button>
      </div>

      {/* Tapping the dimmed page behind the open menu closes it. */}
      {open && <button className="nav-backdrop" aria-hidden="true" tabIndex={-1} onClick={closeMenu} />}
    </header>
  );
}
