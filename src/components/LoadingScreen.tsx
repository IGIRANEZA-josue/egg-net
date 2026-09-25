"use client";
// Loading screen shown while pages load and while an order is being placed.
import EggMark from "@/components/EggMark";

export default function LoadingScreen({ label = "Loading", full = false }: { label?: string; full?: boolean }) {
  return (
    <div className={full ? "loading-screen loading-full" : "loading-screen"} role="status" aria-live="polite">
      <span className="loading-egg"><EggMark size={34} /></span>
      <span className="loading-wordmark">EggHub</span>
      <span className="loading-label">{label}</span>
      <span className="loading-bar"><span /></span>
    </div>
  );
}
