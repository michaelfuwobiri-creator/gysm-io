// Core hunting logic: search Twitter/X + Threads for people who look like
// they need a website, filter out noise, and upsert them as leads in
// voiie_leads (see lib/voiie/db.ts). Called from app/api/voiie/hunt/route.ts
// (the "Hunt Now" button) and the Vercel Cron hitting
// app/api/voiie/cron/hunt/route.ts on a schedule (see vercel.json).

import { countLeadsHuntedToday, createLeadIfNew, getSettings } from "@/lib/voiie/db";
import { searchTweets } from "@/lib/voiie/twitter";
import { searchThreads } from "@/lib/voiie/threads";
import { searchBusinessesWithoutWebsite, type PlaceLead } from "@/lib/voiie/places";
import { auditSite } from "@/lib/voiie/site-contact";
import { detectRegion, regionAllowsColdEmail } from "@/lib/voiie/compliance";
import { DEFAULT_HUNT_QUERY, DEFAULT_PLACES_QUERY } from "@/lib/voiie/constants";
import type { Platform } from "@/types/voiie";

export { DEFAULT_HUNT_QUERY, DEFAULT_PLACES_QUERY };

interface Candidate {
  handle: string;
  platform: Platform;
  pain: string;
  displayName?: string | null;
  bio?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  tags?: string[];
}

const PAIN_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /booking/i, label: "need a booking site" },
  { re: /landing page/i, label: "need a landing page" },
  { re: /portfolio/i, label: "need a portfolio site" },
  { re: /e-?commerce|online store|shop online/i, label: "need an e-commerce site" },
  { re: /developer|dev\b/i, label: "looking for a developer" },
  { re: /website|web ?site|web ?app/i, label: "need a website" },
];

function extractPain(text: string): string {
  const hit = PAIN_PATTERNS.find((p) => p.re.test(text));
  return hit?.label ?? "need a web app";
}

/**
 * Lightweight heuristic lead filter -- a clean swap-in point for a real
 * classifier (e.g. an OpenAI call, since this repo already has
 * OPENAI_API_KEY configured for lib/ai/orchestrator.ts) later. Keep the
 * signature (text in, boolean out) if you swap the body.
 */
export function isLead(text: string): boolean {
  const needsSomething = /\b(need|looking for|want|require)\b/i.test(text);
  const aboutWeb = /\b(website|web ?site|web ?app|landing page|developer|booking site|online store)\b/i.test(text);
  const notHiringAgency = !/\bhiring\b.*\bagency\b|\bwe are a\b/i.test(text);
  return needsSomething && aboutWeb && notHiringAgency;
}

/**
 * "Reachable lead" mode. Places never returns an email, and a business with
 * no website has none to read -- so for businesses that DO have a website we
 * read the public contact email they published there and keep only the ones
 * whose site is weak (not mobile-friendly / no HTTPS / stale / thin), where a
 * free redesign demo is a relevant offer. Only regions where cold B2B email is
 * enabled (VOIIE_COLD_EMAIL_REGIONS, default US) are audited, so no EU
 * addresses are collected by default. Off with VOIIE_WEAK_SITE_MODE=off.
 */
export interface HuntStats {
  placesReturned: number;
  noWebsite: number;
  withWebsite: number;
  regionSkipped: number;
  audited: number;
  unreachable: number;
  weak: number;
  emailFound: number;
  weakWithEmail: number;
}

const emptyStats = (): HuntStats => ({ placesReturned: 0, noWebsite: 0, withWebsite: 0, regionSkipped: 0, audited: 0, unreachable: 0, weak: 0, emailFound: 0, weakWithEmail: 0 });

async function weakSiteCandidates(withSite: PlaceLead[], stats: HuntStats): Promise<Candidate[]> {
  if (process.env.VOIIE_WEAK_SITE_MODE === "off") return [];
  const regionOk = withSite.filter((b) => b.websiteUri && regionAllowsColdEmail(detectRegion({ bio: b.address, contact_phone: b.phone })));
  stats.regionSkipped = withSite.length - regionOk.length;
  const eligible = regionOk.slice(0, 12); // keeps the run well inside the 60s route budget
  stats.audited = eligible.length;
  const out: Candidate[] = [];
  for (let i = 0; i < eligible.length; i += 4) {
    const batch = eligible.slice(i, i + 4);
    const audits = await Promise.all(batch.map((b) => auditSite(b.websiteUri as string).catch(() => null)));
    audits.forEach((a, idx) => {
      const b = batch[idx];
      if (!a) { stats.unreachable++; return; }
      if (a.weak) stats.weak++;
      if (a.email) stats.emailFound++;
      if (!a.weak || !a.email) return;
      stats.weakWithEmail++;
      out.push({
        handle: b.placeId,
        platform: "places",
        pain: `Outdated website (${a.reasons.join(", ")}) ${a.url}`,
        displayName: b.name,
        bio: b.address,
        contactPhone: b.phone,
        contactEmail: a.email,
        tags: ["weak-site", "email-from-own-site"],
      });
    });
  }
  return out;
}

async function collectCandidates(query: string, platforms: Platform[], placesQuery: string | undefined, stats: HuntStats): Promise<Candidate[]> {
  const candidates: Candidate[] = [];

  if (platforms.includes("places") && placesQuery) {
    try {
      const all = await searchBusinessesWithoutWebsite(placesQuery, 20, "all");
      const businesses = all.filter((b) => !b.websiteUri);
      stats.placesReturned = all.length;
      stats.noWebsite = businesses.length;
      stats.withWebsite = all.length - businesses.length;
      candidates.push(...(await weakSiteCandidates(all.filter((b) => b.websiteUri), stats)));
      for (const b of businesses) {
        candidates.push({
          // Place ID, not a handle -- it's the stable, unique identifier
          // that db.ts's (owner_user_id, platform, lower(handle)) unique
          // index dedupes on, same role @handle plays for Twitter/Threads.
          handle: b.placeId,
          platform: "places",
          pain: `${b.category}, ${b.socialUrl ? `only a social page (${b.socialUrl}), no real website` : "no website listed"}${b.rating ? ` (${b.rating}★ on Google)` : ""}`,
          displayName: b.name,
          bio: b.address,
          contactPhone: b.phone,
        });
      }
    } catch (err) {
      console.warn("[voiie/hunt] Google Places search unavailable:", (err as Error).message);
    }
  }

  if (platforms.includes("twitter")) {
    try {
      const tweets = await searchTweets(query, 25);
      for (const t of tweets) {
        if (!isLead(t.text)) continue;
        candidates.push({ handle: `@${t.authorHandle}`, platform: "twitter", pain: extractPain(t.text) });
      }
    } catch (err) {
      console.warn("[voiie/hunt] Twitter/X search unavailable:", (err as Error).message);
    }
  }

  if (platforms.includes("threads")) {
    try {
      const posts = await searchThreads(query, 25);
      for (const p of posts) {
        if (!isLead(p.text)) continue;
        candidates.push({ handle: `@${p.authorHandle}`, platform: "threads", pain: extractPain(p.text) });
      }
    } catch (err) {
      console.warn("[voiie/hunt] Threads search unavailable:", (err as Error).message);
    }
  }

  return candidates;
}

export interface HuntResult {
  scanned: number;
  newLeadsCreated: number;
  leadIds: string[];
  skippedReason?: "kill_switch" | "daily_limit_reached";
  stats?: HuntStats;
}

/** Handle without the leading @, lowercased -- how both the blacklist and
 *  Twitter/Threads handles are compared, so a blacklist entry works
 *  whether it was typed as "@spamvictim" or "spamvictim". */
function normalizeHandle(handle: string): string {
  return handle.replace(/^@/, "").toLowerCase();
}

export async function huntClients(params: {
  ownerUserId: string;
  query?: string;
  /** Category + location for the Places source, e.g. "plumbers in Austin, TX".
   *  Only used when "places" is in `platforms`; leaving it unset simply
   *  skips Places for this run rather than erroring. */
  placesQuery?: string;
  platforms?: Platform[];
}): Promise<HuntResult> {
  const settings = await getSettings(params.ownerUserId);

  if (settings.kill_switch) {
    return { scanned: 0, newLeadsCreated: 0, leadIds: [], skippedReason: "kill_switch" };
  }

  const alreadyToday = await countLeadsHuntedToday(params.ownerUserId);
  const remaining = settings.daily_hunt_limit - alreadyToday;
  if (remaining <= 0) {
    return { scanned: 0, newLeadsCreated: 0, leadIds: [], skippedReason: "daily_limit_reached" };
  }

  const query = params.query ?? DEFAULT_HUNT_QUERY;
  // Fall back to the VOIIE_PLACES_QUERY env var (the daily cron already
  // reads it) so the "Hunt Now" button also searches Google Places when no
  // query is typed in. Before, it silently ran Twitter/Threads only, and
  // Twitter's search now answers 402 (paid plan required), so it found 0.
  const placesQuery = params.placesQuery ?? (process.env.VOIIE_PLACES_QUERY || DEFAULT_PLACES_QUERY || undefined);
  // Twitter/X search answers 402 (paid plan) and Threads needs a token, so
  // social hunting is opt-in: set VOIIE_SOCIAL_HUNT=1 to include them.
  const social = process.env.VOIIE_SOCIAL_HUNT === "1";
  const platforms =
    params.platforms ??
    (placesQuery
      ? (social ? (["places", "twitter", "threads"] as Platform[]) : (["places"] as Platform[]))
      : social
        ? (["twitter", "threads"] as Platform[])
        : ([] as Platform[]));

  const blacklist = new Set((settings.blacklist ?? []).map(normalizeHandle));
  const stats = emptyStats();
  const candidates = (await collectCandidates(query, platforms, placesQuery, stats))
    .filter((c) => !blacklist.has(normalizeHandle(c.handle)))
    .slice(0, remaining); // never create more leads than the daily cap has left

  const leadIds: string[] = [];

  for (const c of candidates) {
    const id = await createLeadIfNew(params.ownerUserId, {
      platform: c.platform,
      handle: c.handle,
      signal: c.pain,
      displayName: c.displayName,
      bio: c.bio,
      contactPhone: c.contactPhone,
      contactEmail: c.contactEmail,
      tags: c.tags,
    });
    if (id) leadIds.push(id);
  }

  return { scanned: candidates.length, newLeadsCreated: leadIds.length, leadIds, stats };
}
