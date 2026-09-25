// Footer: masthead style with mono microtype
import EggMark from "@/components/EggMark";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div>
          <strong style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <EggMark size={14} /> EggHub Rwanda
          </strong>
          <p style={{ marginTop: 8, color: "var(--muted)" }}>Fresh Eggs. Easy Ordering. Reliable Delivery.</p>
        </div>
        <div style={{ color: "var(--muted)" }}>
          <p>Kigali, Rwanda · +250 788 000 000</p>
          <p>© {new Date().getFullYear()} EggHub Rwanda — All rights reserved</p>
        </div>
      </div>
    </footer>
  );
}
