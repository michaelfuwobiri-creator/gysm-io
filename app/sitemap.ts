import type { MetadataRoute } from "next";
import { sql } from "@/lib/db";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.gysm.io";

// Static marketing/product pages plus every published BuildGuild app
// (which are genuinely public, unique, crawlable content -- unlike
// /builder or /dashboard, which are behind auth and excluded in robots.ts).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${siteUrl}/`, changeFrequency: "daily", priority: 1 },
    { url: `${siteUrl}/pricing`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${siteUrl}/templates`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${siteUrl}/build/dating-app`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${siteUrl}/build/saas`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${siteUrl}/build/booking-app`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${siteUrl}/buildguild`, changeFrequency: "hourly", priority: 0.8 },
    { url: `${siteUrl}/apps/orbit/privacy`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${siteUrl}/apps/orbit/terms`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${siteUrl}/apps/orbit/support`, changeFrequency: "monthly", priority: 0.3 },
  ];

  let publishedRoutes: MetadataRoute.Sitemap = [];
  try {
    const rows = await sql`
      select id, published_at from projects where is_public = true order by published_at desc limit 1000
    `;
    publishedRoutes = (rows as any[]).map((p) => ({
      url: `${siteUrl}/buildguild/${p.id}`,
      lastModified: p.published_at ? new Date(p.published_at) : undefined,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    }));
  } catch (error: any) {
    console.error("[sitemap] failed to load published apps:", error.message);
  }

  return [...staticRoutes, ...publishedRoutes];
}
