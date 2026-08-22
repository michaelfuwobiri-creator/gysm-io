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
        {/* `dynamic` makes ClerkProvider await real per-request auth data
            (via next/headers) and embed it as `initialState` for the client
            tree. Without it, `initialState` is always null and Clerk's
            client-side hooks bootstrap purely from browser-only signals
            (the `__client_uat` cookie) with nothing server-rendered to
            match against -- a mismatch that happens *inside Clerk's own
            internals*, not in any of our own isSignedIn branches, which is
            why patching app/page.tsx's local render logic three times
            (2d69de5, 06d7288, 2419a99) never actually fixed the homepage's
            hydration errors (#418/#423/#425). Confirmed by reading
            @clerk/nextjs's ClerkProvider source directly: generateStatePromise/
            generateNonce return null/"" unless `dynamic` is set. This also
            correctly opts "/" out of static prerendering, which is the
            right trade-off for a nav that has to reflect real auth state. */}
        <ClerkProvider dynamic>
          {children}
          <PWARegister />
        </ClerkProvider>
        <Analytics />
      </body>
    </html>
  );
}