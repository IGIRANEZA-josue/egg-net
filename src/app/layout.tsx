import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import DeliveryBanner from "@/components/DeliveryBanner";

export const metadata: Metadata = {
  title: "EggHub Rwanda - Fresh Eggs. Easy Ordering. Reliable Delivery.",
  description: "Buy fresh eggs online in Rwanda. Browse products, order, and get delivery.",
};

// Type pairing: Archivo (heavy grotesk display + text) + IBM Plex Mono (microtype)
const ARCHIVO = "https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&display=swap";
const PLEX_MONO = "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&display=swap";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={ARCHIVO} />
        <link rel="stylesheet" href={PLEX_MONO} />
      </head>
      <body>
        {/* site-top keeps the green delivery banner and the navbar together at the top */}
        <div className="site-top">
          <DeliveryBanner />
          <Navbar />
        </div>
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
