import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.gysm.io";

// Explicitly allowlists known AI crawlers (used both for real-time
// assistant browsing and for model-training corpora) in addition to the
// default open-to-everyone rule, so there's no ambiguity for crawlers that
// respect a named allow rule more strictly than a blanket "*". Also blocks
// API routes and the auth-gated builder/dashboard from being indexed --
// there's nothing there for a crawler to usefully read, and /api responses
// are NDJSON streams / JSON, not pages.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/builder", "/dashboard", "/sign-in", "/sign-up", "/billing", "/team", "/settings"],
      },
      // General web search crawlers
      { userAgent: "Googlebot", allow: "/" },
      { userAgent: "Bingbot", allow: "/" },
      { userAgent: "DuckDuckBot", allow: "/" },
      // AI assistant / answer-engine crawlers (real-time browsing on behalf
      // of a user query -- e.g. ChatGPT search, Perplexity answers)
      { userAgent: "ChatGPT-User", allow: "/" },
      { userAgent: "PerplexityBot", allow: "/" },
      { userAgent: "Claude-User", allow: "/" },
      { userAgent: "Claude-SearchBot", allow: "/" },
      // AI model-training crawlers
      { userAgent: "GPTBot", allow: "/" },
      { userAgent: "ClaudeBot", allow: "/" },
      { userAgent: "Google-Extended", allow: "/" },
      { userAgent: "Applebot-Extended", allow: "/" },
      { userAgent: "CCBot", allow: "/" },
      { userAgent: "Amazonbot", allow: "/" },
      { userAgent: "Bytespider", allow: "/" },
      { userAgent: "cohere-ai", allow: "/" },
      { userAgent: "Diffbot", allow: "/" },
      { userAgent: "FacebookBot", allow: "/" },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
