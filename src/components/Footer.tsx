// Footer: masthead style with mono microtype.
// Three columns on desktop, stacking on a phone. The last column ends with a
// single, independent "Admin" link - not inside a dropdown - pointing at the
// staff sign-in page.
import Link from "next/link";
import EggMark from "@/components/EggMark";

const SHOP_LINKS = [
  { href: "/products", label: "Products" },
  { href: "/cart", label: "Cart" },
  { href: "/orders", label: "My orders" },
  { href: "/dashboard", label: "My account" },
];

const INFO_LINKS = [
  { href: "/about", label: "About us" },
  { href: "/contact", label: "Contact" },
  { href: "/login", label: "Login" },
  { href: "/register", label: "Register" },
];

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-grid">
        <div>
          <strong style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <EggMark size={14} /> EggHub Rwanda
          </strong>
          <p style={{ marginTop: 8, color: "var(--muted)" }}>Fresh Eggs. Easy Ordering. Reliable Delivery.</p>
          <p style={{ color: "var(--muted)" }}>Kigali, Rwanda · +250 788 000 000</p>
        </div>

        <nav aria-labelledby="footer-shop">
          <h3 id="footer-shop" className="footer-heading">Shop</h3>
          <ul>
            {SHOP_LINKS.map((l) => <li key={l.href}><Link href={l.href}>{l.label}</Link></li>)}
          </ul>
        </nav>

        <nav aria-labelledby="footer-info">
          <h3 id="footer-info" className="footer-heading">EggHub</h3>
          <ul>
            {INFO_LINKS.map((l) => <li key={l.href}><Link href={l.href}>{l.label}</Link></li>)}
            {/* Staff entry point. Deliberately its own link, in this list, so it
                is never hidden behind a menu or a hover. */}
            <li><Link href="/admin/login" className="footer-admin-link">Admin</Link></li>
          </ul>
        </nav>

      </div>

      <div className="container footer-bottom">
        <p>© {new Date().getFullYear()} EggHub Rwanda — All rights reserved</p>
      </div>
    </footer>
  );
}
