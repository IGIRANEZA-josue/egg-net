"use client";
// Hand-drawn egg mark used as the product placeholder + brand glyph.
// Pure SVG: scales to any size, works in one colour, editable.
import { useId } from "react";

export default function EggMark({ size = 40, title }: { size?: number; title?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size * 1.25} viewBox="0 0 32 40" role="img" aria-label={title || "Egg"}>
      {title && <title>{title}</title>}
      <defs>
        <pattern id={`dots-${id}`} width="3" height="3" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.7" fill="#0d0c0a" />
        </pattern>
      </defs>
      {/* egg silhouette */}
      <path
        d="M16 1.5 C23.2 1.5 28.5 11.5 28.5 21.5 C28.5 30.6 22.8 38.5 16 38.5 C9.2 38.5 3.5 30.6 3.5 21.5 C3.5 11.5 8.8 1.5 16 1.5 Z"
        fill="currentColor"
      />
      {/* halftone shading on the right side, clipped to the egg */}
      <clipPath id={`clip-${id}`}>
        <path d="M16 1.5 C23.2 1.5 28.5 11.5 28.5 21.5 C28.5 30.6 22.8 38.5 16 38.5 C9.2 38.5 3.5 30.6 3.5 21.5 C3.5 11.5 8.8 1.5 16 1.5 Z" />
      </clipPath>
      <rect x="16" y="0" width="16" height="40" fill={`url(#dots-${id})`} opacity="0.35" clipPath={`url(#clip-${id})`} />
      {/* highlight */}
      <path d="M10 12 C8 15 7 18 7.2 21" stroke="#f2f0ea" strokeWidth="1.6" strokeLinecap="round" fill="none" clipPath={`url(#clip-${id})`} />
    </svg>
  );
}
