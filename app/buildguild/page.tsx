import { sql } from "@/lib/db";
import { getUser } from "@/lib/auth";
import BuildCard from "./BuildCard";
import SubmitBuildModal from "./SubmitBuildModal";
import FeaturedApps from "./FeaturedApps";

// BuildGuild -- public gallery of every app users have opted to publish
// (projects.is_public = true, set via POST /api/projects/[id]/publish).
// No auth required to browse; publishing and commenting require sign-in
// (enforced in their respective API routes, not here).
//
// Redesigned into a denser, "community board" layout (stats strip, sort
// chips, search, category filter chips, top-builders + recent-activity
// sidebar, hover-overlay cards, a real Submit Build modal) matching the
// pasted reference design's layout -- but every number and filter here
// is backed by real columns (projects.views, comments, and the new
// projects.tags -- see db/migrations/0014_project_tags.sql and
// lib/buildTags.ts). No fabricated MRR/likes/leaderboard data.

type App = {
  id: string;
  title: string | null;
  tagline: string | null;
  publisher_name: string | null;
  published_at: string;
  html: string;
  views: number;
  comment_count: number;
  tags: string[];
};

type SortKey = "new" | "views" | "discussed";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "new", label: "Newest" },
  { key: "views", label: "Most viewed" },
  { key: "discussed", label: "Most discussed" },
];

// Note: @neondatabase/serverless's sql`` tagged template executes
// immediately and returns rows -- it isn't a composable fragment builder
// like postgres.js -- so each sort order gets its own complete, literal
// query rather than a shared WHERE clause with an interpolated ORDER BY.
async function fetchApps(sort: SortKey): Promise<App[]> {
  if (sort === "views") {
    return (await sql`
      select
        p.id, p.title, p.tagline, p.publisher_name, p.published_at, p.html,
        p.views, p.tags,
        coalesce(c.comment_count, 0)::int as comment_count
      from projects p
      left join (
        select project_id, count(*)::int as comment_count
        from comments
        group by project_id
      ) c on c.project_id = p.id
      where p.is_public = true
      order by p.views desc, p.published_at desc
      limit 200
    `) as any;
  }
  if (sort === "discussed") {
    return (await sql`
      select
        p.id, p.title, p.tagline, p.publisher_name, p.published_at, p.html,
        p.views, p.tags,
        coalesce(c.comment_count, 0)::int as comment_count
      from projects p
      left join (
        select project_id, count(*)::int as comment_count
        from comments
        group by project_id
      ) c on c.project_id = p.id
      where p.is_public = true
      order by comment_count desc, p.published_at desc
      limit 200
    `) as any;
  }
  return (await sql`
    select
      p.id, p.title, p.tagline, p.publisher_name, p.published_at, p.html,
      p.views, p.tags,
      coalesce(c.comment_count, 0)::int as comment_count
    from projects p
    left join (
      select project_id, count(*)::int as comment_count
      from comments
      group by project_id
    ) c on c.project_id = p.id
    where p.is_public = true
    order by p.published_at desc
    limit 200
  `) as any;
}

type Activity =
  | { kind: "publish"; ts: string; project_id: string; title: string | null; name: string | null }
  | { kind: "comment"; ts: string; project_id: string; title: string | null; name: string | null };

async function fetchActivity(): Promise<Activity[]> {
  try {
    const [publishes, comments] = await Promise.all([
      sql`
        select id as project_id, title, publisher_name as name, published_at as ts
        from projects
        where is_public = true
        order by published_at desc
        limit 5
      `,
      sql`
        select c.project_id, p.title, c.author_name as name, c.created_at as ts
        from comments c
        join projects p on p.id = c.project_id and p.is_public = true
        order by c.created_at desc
        limit 5
      `,
    ]);
    const merged: Activity[] = [
      ...(publishes as any[]).map((r) => ({ kind: "publish" as const, ts: r.ts, project_id: r.project_id, title: r.title, name: r.name })),
      ...(comments as any[]).map((r) => ({ kind: "comment" as const, ts: r.ts, project_id: r.project_id, title: r.title, name: r.name })),
    ];
    merged.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
    return merged.slice(0, 6);
  } catch (error: any) {
    console.error("[buildguild] failed to load activity:", error.message);
    return [];
  }
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default async function BuildGuildPage({
  searchParams,
}: {
  searchParams: { q?: string; sort?: string; tag?: string };
}) {
  const q = (searchParams?.q || "").trim();
  const sort: SortKey = SORTS.some((s) => s.key === searchParams?.sort) ? (searchParams!.sort as SortKey) : "new";
  const activeTag = (searchParams?.tag || "").trim();

  let apps: App[] = [];
  let activity: Activity[] = [];
  let signedIn = false;
  try {
    const [appsResult, activityResult, user] = await Promise.all([fetchApps(sort), fetchActivity(), getUser()]);
    apps = appsResult;
    activity = activityResult;
    signedIn = !!user;
  } catch (error: any) {
    console.error("[buildguild] failed to load:", error.message);
  }

  const totalBuilds = apps.length;
  const totalViews = apps.reduce((sum, a) => sum + (a.views || 0), 0);
  const totalBuilders = new Set(apps.map((a) => a.publisher_name).filter(Boolean)).size;

  const topBuilders = Object.values(
    apps.reduce((acc: Record<string, { name: string; builds: number; views: number }>, a) => {
      if (!a.publisher_name) return acc;
      if (!acc[a.publisher_name]) acc[a.publisher_name] = { name: a.publisher_name, builds: 0, views: 0 };
      acc[a.publisher_name].builds += 1;
      acc[a.publisher_name].views += a.views || 0;
      return acc;
    }, {})
  )
    .sort((a, b) => b.builds - a.builds || b.views - a.views)
    .slice(0, 5);

  // Category chips -- real tags actually present on published builds
  // (projects.tags, set at publish time from the fixed BUILD_TAGS
  // whitelist -- see lib/buildTags.ts), with real counts. No chip shows
  // unless at least one live build carries that tag.
  const tagCounts = apps.reduce((acc: Record<string, number>, a) => {
    for (const t of a.tags || []) acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});
  const tagChips = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);

  const qs = (overrides: { sort?: string; tag?: string; q?: string }) => {
    const params = new URLSearchParams();
    const nextSort = overrides.sort ?? sort;
    const nextTag = overrides.tag ?? activeTag;
    const nextQ = overrides.q ?? q;
    if (nextSort && nextSort !== "new") params.set("sort", nextSort);
    if (nextTag) params.set("tag", nextTag);
    if (nextQ) params.set("q", nextQ);
    const s = params.toString();
    return `/buildguild${s ? `?${s}` : ""}`;
  };

  const filtered = apps.filter((a) => {
    if (activeTag && !(a.tags || []).includes(activeTag)) return false;
    if (q) {
      const hay = `${a.title || ""} ${a.tagline || ""} ${a.publisher_name || ""}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div
      style={{ fontFamily: "Inter,sans-serif" }}
      className="min-h-screen bg-[#08080a] text-white antialiased selection:bg-[#FF0080] selection:text-white"
    >
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" />

      {/* Fuchsia radial glow, matching the builder's dark chrome -- see
          app/builder/LinearBuilderClient.tsx and the homepage's MVP Builds
          section for the same background treatment. */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(60%_50%_at_50%_-10%,rgba(255,0,128,0.16),transparent_60%)]" />

      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-[#08080a]/80 border-b border-white/[0.06] h-[56px] md:h-[64px] flex items-center">
        <div className="max-w-[1280px] mx-auto px-5 w-full flex items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <span className="font-black tracking-tighter text-[16px]">GYSM<span className="text-[#FF0080]">.IO</span></span>
          </a>
          <div className="flex items-center gap-2">
            <a href="/dashboard" className="text-[13px] font-medium text-white/60 hover:text-white hidden md:block mr-2">Dashboard</a>
            <SubmitBuildModal signedIn={signedIn} variant="nav" />
            <a href="/builder" className="h-8 md:h-9 px-5 rounded-full bg-[#FF0080] text-white text-[13px] font-semibold grid place-items-center hover:bg-[#FF0080]/90 transition-colors">
              Start Building
            </a>
          </div>
        </div>
      </nav>

      <div className="relative max-w-[1280px] mx-auto px-5 pt-10 md:pt-14 pb-28">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold mb-4">
            Community showcase
          </div>
          <h1 className="text-[32px] md:text-[44px] font-black tracking-tight leading-[1.05]">BuildGuild</h1>
          <p className="mt-3 text-[15px] text-white/50 leading-relaxed">
            Real apps other builders shipped with GYSM — live, clickable, and open for feedback. Publish your own from
            the builder or your dashboard, and drop a comment on anything that catches your eye.
          </p>
        </div>

        {/* Stats strip -- every number here is a real aggregate computed
            above from projects/comments, not fabricated. */}
        <div className="mt-8 flex flex-wrap gap-3">
          {[
            { label: "Builds published", value: totalBuilds.toLocaleString() },
            { label: "Builders", value: totalBuilders.toLocaleString() },
            { label: "Total views", value: totalViews.toLocaleString() },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 min-w-[140px]">
              <div className="text-[20px] font-black">{s.value}</div>
              <div className="text-[11px] text-white/40 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Pinned, hand-picked builds -- see FeaturedApps.tsx for why these
            live here now instead of on the homepage. */}
        <FeaturedApps />

        {/* Category chips -- real tags, real counts (see tagChips above).
            Only rendered if at least one published build has a tag. */}
        {tagChips.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            <a
              href={qs({ tag: "" })}
              className={`h-8 px-3.5 rounded-full text-[12px] font-semibold grid place-items-center transition-colors ${
                !activeTag ? "bg-white text-[#08080a]" : "bg-white/[0.06] text-white/50 hover:text-white"
              }`}
            >
              All
            </a>
            {tagChips.map(([tag, count]) => (
              <a
                key={tag}
                href={qs({ tag: activeTag === tag ? "" : tag })}
                className={`h-8 px-3.5 rounded-full text-[12px] font-semibold grid place-items-center transition-colors ${
                  activeTag === tag ? "bg-white text-[#08080a]" : "bg-white/[0.06] text-white/50 hover:text-white"
                }`}
              >
                {tag} <span className="opacity-50 ml-1">{count}</span>
              </a>
            ))}
          </div>
        )}

        <div className="mt-8 grid lg:grid-cols-[1fr_300px] gap-8 items-start">
          <div>
            {/* Sort chips + search -- plain GET form, no client JS needed. */}
            <form className="flex flex-wrap items-center gap-2" action="/buildguild" method="get">
              {SORTS.map((s) => (
                <a
                  key={s.key}
                  href={qs({ sort: s.key })}
                  className={`h-9 px-4 rounded-full text-[13px] font-semibold grid place-items-center transition-colors ${
                    sort === s.key ? "bg-[#FF0080] text-white" : "bg-white/[0.06] text-white/60 hover:bg-white/[0.1] hover:text-white"
                  }`}
                >
                  {s.label}
                </a>
              ))}
              <input type="hidden" name="sort" value={sort} />
              {activeTag && <input type="hidden" name="tag" value={activeTag} />}
              <input
                type="text"
                name="q"
                defaultValue={q}
                placeholder="Search builds, builders…"
                className="ml-auto h-9 w-full sm:w-[220px] rounded-full bg-white/[0.06] border border-white/10 px-4 text-[13px] placeholder:text-white/30 focus:outline-none focus:border-[#FF0080]/60"
              />
            </form>

            {filtered.length === 0 ? (
              <div className="mt-8 rounded-[20px] border border-dashed border-white/10 bg-white/[0.03] p-10 text-center">
                <p className="font-bold">{apps.length === 0 ? "Nothing published yet" : "No builds match"}</p>
                <p className="text-[13px] text-white/40 mt-1 max-w-sm mx-auto">
                  {apps.length === 0
                    ? 'Be the first — finish a build, then hit "Share to BuildGuild" to put it here.'
                    : "Try a different search term or tag, or clear filters to see everything."}
                </p>
                <a href="/builder" className="mt-5 inline-block px-5 py-2 bg-[#FF0080] text-white rounded-full font-semibold text-[13px]">
                  Go to builder
                </a>
              </div>
            ) : (
              <div className="mt-6 columns-1 sm:columns-2 xl:columns-3 gap-5 [column-fill:balance]">
                {filtered.map((app) => (
                  <BuildCard key={app.id} app={app} timeAgo={timeAgo(app.published_at)} />
                ))}
              </div>
            )}
          </div>

          {/* Sidebar -- top builders + recent activity, both real. */}
          <div className="flex flex-col gap-5">
            <div className="rounded-[20px] border border-white/10 bg-gradient-to-br from-[#FF0080]/15 to-transparent p-5">
              <div className="font-black text-[15px]">Flex your build</div>
              <p className="text-[12px] text-white/50 mt-1.5 leading-relaxed">
                Shipped something with GYSM? Publish it from your dashboard and it shows up here for the whole
                community to find.
              </p>
              <SubmitBuildModal signedIn={signedIn} variant="card" />
            </div>

            {topBuilders.length > 0 && (
              <div className="rounded-[20px] border border-white/10 bg-white/[0.04] p-5">
                <div className="font-black text-[13px] mb-3">Top builders</div>
                <div className="flex flex-col gap-3">
                  {topBuilders.map((b, i) => (
                    <div key={b.name} className="flex items-center gap-3">
                      <div className="h-6 w-6 shrink-0 rounded-full bg-white/10 grid place-items-center text-[11px] font-bold text-white/60">
                        {i + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold truncate">{b.name}</div>
                        <div className="text-[11px] text-white/35">
                          {b.builds} {b.builds === 1 ? "build" : "builds"} · {b.views.toLocaleString()} views
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activity.length > 0 && (
              <div className="rounded-[20px] border border-white/10 bg-white/[0.04] p-5">
                <div className="font-black text-[13px] mb-3">Recent activity</div>
                <div className="flex flex-col gap-3">
                  {activity.map((a, i) => (
                    <a
                      key={`${a.kind}-${a.project_id}-${i}`}
                      href={`/buildguild/${a.project_id}`}
                      className="text-[12px] text-white/50 hover:text-white/80 leading-snug"
                    >
                      <span className="font-semibold text-white/80">{a.name || "Someone"}</span>{" "}
                      {a.kind === "publish" ? "published" : "commented on"}{" "}
                      <span className="text-white/70">{a.title || "a build"}</span>
                      <span className="text-white/30"> · {timeAgo(a.ts)}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sticky mobile Submit Build button, matching the pasted reference
          design -- opens the same real modal as the nav/sidebar entry
          points (see SubmitBuildModal.tsx). */}
      <div className="fixed bottom-4 inset-x-0 flex justify-center md:hidden z-40">
        <SubmitBuildModal signedIn={signedIn} variant="sticky" />
      </div>
    </div>
  );
}
