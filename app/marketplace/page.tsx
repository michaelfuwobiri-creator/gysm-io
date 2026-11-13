import type { Metadata } from "next";
import MarketplaceClient from "./MarketplaceClient";

export const metadata: Metadata = {
  title: "GYSM Domains – Find a Domain for Your App (Coming Soon)",
  description:
    "Domain search and purchase are coming to GYSM. Browse name ideas and join the waitlist to hear when it opens.",
  alternates: { canonical: "/marketplace" },
  openGraph: {
    title: "GYSM Domains – Find a Domain for Your App (Coming Soon)",
    description: "Domain search and purchase are coming to GYSM. Join the waitlist.",
    url: "/marketplace",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "GYSM Domains – Find a Domain for Your App (Coming Soon)",
    description: "Domain search and purchase are coming to GYSM. Join the waitlist.",
  },
};

export default function MarketplacePage() {
  return (
    <>
      {/* A <link> tag, not an inline <style>@import> -- React HTML-escapes
          text content (the apostrophes here become &#x27;), and CSS's
          @import doesn't decode HTML entities, so the old <style> version
          was literally fetching a broken URL (".../&#x27;https://fonts...")
          and silently falling back to system fonts on every load. A
          link's href attribute is properly entity-decoded by the HTML
          parser, so this actually loads the font. */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700&display=swap" />
      <MarketplaceClient />
    </>
  );
}
