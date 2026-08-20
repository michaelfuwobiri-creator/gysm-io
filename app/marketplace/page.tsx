import type { Metadata } from "next";
import MarketplaceClient from "./MarketplaceClient";

export const metadata: Metadata = {
  title: "GYSM Marketplace – Curated .io Domains (Coming Soon)",
  description:
    "A hand-picked marketplace of short, brandable .io domain names. Browsing is open now -- join the waitlist to be notified when buying opens.",
  alternates: { canonical: "/marketplace" },
  openGraph: {
    title: "GYSM Marketplace – Curated .io Domains (Coming Soon)",
    description: "A hand-picked marketplace of short, brandable .io domain names. Join the waitlist for launch.",
    url: "/marketplace",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "GYSM Marketplace – Curated .io Domains (Coming Soon)",
    description: "A hand-picked marketplace of short, brandable .io domain names. Join the waitlist for launch.",
  },
};

export default function MarketplacePage() {
  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700&display=swap');`}</style>
      <MarketplaceClient />
    </>
  );
}
