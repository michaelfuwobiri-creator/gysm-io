import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getPublishedPage, normalizeHandle, THEME_STYLES, isTheme, isBot, deviceOf, referrerHost, recordEvent } from "@/lib/gysmlink";

export const dynamic = "force-dynamic";

async function load(handleParam: string) {
  const handle = normalizeHandle(handleParam);
  if (!handle) return null;
  try {
    return await getPublishedPage(handle);
  } catch {
    return null; // table missing or DB down: behave like "no such page"
  }
}

export async function generateMetadata({ params }: { params: { handle: string } }): Promise<Metadata> {
  const data = await load(params.handle);
  if (!data) return { title: "Page not found | gysmlink", robots: { index: false } };
  const name = data.page.display_name || `@${data.page.handle}`;
  return { title: `${name} | gysmlink`, description: data.page.bio || `${name}'s links`, robots: { index: true, follow: true } };
}

export default async function LinkPage({ params }: { params: { handle: string } }) {
  const data = await load(params.handle);
  if (!data) notFound();
  const { page, links } = data;
  const t = THEME_STYLES[isTheme(page.theme) ? page.theme : "midnight"];

  const h = headers();
  const ua = h.get("user-agent");
  if (!isBot(ua)) {
    await recordEvent({ pageId: page.id, linkId: null, kind: "view", referrer: referrerHost(h.get("referer")), device: deviceOf(ua) });
  }

  const name = page.display_name || `@${page.handle}`;
  const initial = (name.replace(/^@/, "")[0] || "?").toUpperCase();

  return (
    <main style={{ minHeight: "100vh", background: t.bg, color: t.text, display: "flex", justifyContent: "center", padding: "48px 16px" }}>
      <div style={{ width: "100%", maxWidth: 480, textAlign: "center" }}>
        <div
          style={{ width: 84, height: 84, borderRadius: "50%", background: t.card, margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, fontWeight: 800 }}
          aria-hidden="true"
        >
          {initial}
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 4px" }}>{name}</h1>
        <p style={{ color: t.sub, margin: "0 0 4px", fontSize: 14 }}>@{page.handle}</p>
        {page.bio && <p style={{ color: t.sub, margin: "12px auto 0", fontSize: 15, lineHeight: 1.5, maxWidth: 380, whiteSpace: "pre-wrap" }}>{page.bio}</p>}

        <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 12 }}>
          {links.length === 0 && <p style={{ color: t.sub, fontSize: 14 }}>No links yet.</p>}
          {links.map((l) => (
            <a
              key={l.id}
              href={`/l/go/${l.id}`}
              rel="nofollow noopener"
              style={{ display: "block", padding: "14px 18px", borderRadius: 14, background: t.button, color: t.buttonText, textDecoration: "none", fontWeight: 600, fontSize: 15 }}
            >
              {l.title}
            </a>
          ))}
        </div>

        <p style={{ marginTop: 40, fontSize: 12, color: t.sub }}>
          Made with{" "}
          <a href="https://gysm.io" style={{ color: t.text, fontWeight: 700 }}>
            gysmlink
          </a>
        </p>
      </div>
    </main>
  );
}
