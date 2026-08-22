import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";
import PWARegister from "./components/PWARegister";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.gysm.io";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "GYSM.IO \u2013 AI No-Code App Builder for Founders & Startups",
  description:
    "GYSM.IO is an AI no-code app builder: describe the app you want in plain English and get a real, working full-stack web app -- auth, database, and payments included -- with no coding required.",
  applicationName: "GYSM.IO",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "GYSM.IO",
  },
  icons: {
    icon: [{ url: "/favicon.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  // JSON-LD structured data + AI-crawler-facing metadata live in
  // app/robots.ts, app/sitemap.ts, and public/llms.txt -- see those for
  // the SEO / AI-discoverability side of things.
  openGraph: {
    title: "GYSM.IO \u2013 AI No-Code App Builder for Founders & Startups",
    description: "Describe the app you want. GYSM.IO's AI no-code app builder generates a real, working full-stack app in seconds -- no coding required.",
    url: siteUrl,
    siteName: "GYSM.IO",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "GYSM.IO \u2013 AI No-Code App Builder for Founders & Startups",
    description: "Describe the app you want. GYSM.IO's AI no-code app builder generates a real, working full-stack app in seconds -- no coding required.",
  },
};

export const viewport: Viewport = {
  themeColor: "#0A0A0A",
  width: "device-width",
  initialScale: 1,
};

// Site-wide Organization structured data -- gives AI answer engines and
// search result rich-snippets a clean, unambiguous entity to attach GYSM.IO
// to. Page-specific SoftwareApplication JSON-LD lives on the homepage and
// on each published app's /publish/[id] page instead of here.
const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "GYSM.IO",
  url: siteUrl,
  logo: `${siteUrl}/icons/icon-512.png`,
  description:
    "GYSM.IO is an AI app builder: describe an app in plain English and get a real, working website with auth, payments, and a live preview.",
  sameAs: [],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        {/* Deliberately NOT passing `dynamic` here. It was tried as a fix
            for the #418/#423/#425 hydration errors (making ClerkProvider
            embed real per-request auth state via next/headers) and it does
            work as documented -- confirmed live that both "/" and
            "/pricing" switched from a cached static response to a genuine
            per-request MISS with it on. But it had zero effect on the
            actual bug: the real cause turned out to be calling
            @clerk/nextjs's useUser() at all from any component that
            participates in SSR (see app/components/NavAuthLink.tsx),
            unrelated to static-vs-dynamic rendering. With that fixed at
            the actual source, there's no reason to pay the static-caching
            cost across the whole app for this prop anymore. */}
        <ClerkProvider>
          {children}
          <PWARegister />
        </ClerkProvider>
        <Analytics />
      </body>
    </html>
  );
}