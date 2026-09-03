// Core hunting logic: search Twitter/X + Threads for people who look like
// they need a website, filter out noise, and upsert them as leads in
// voiie_leads (see lib/voiie/db.ts). Called from app/api/voiie/hunt/route.ts
// (the "Hunt Now" button) and the Vercel Cron hitting
// app/api/voiie/cron/hunt/route.ts on a schedule (see vercel.json).

import { countLeadsHuntedToday, createLeadIfNew, getSettings } from "@/lib/voiie/db";
import { searchTweets } from "@/lib/voiie/twitter";
import { searchThreads } from "@/lib/voiie/threads";
import { searchBusinessesWithoutWebsite } from "@/lib/voiie/places";
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

async function collectCandidates(query: string, platforms: Platform[], placesQuery?: string): Promise<Candidate[]> {
  const candidates: Candidate[] = [];

  if (platforms.includes("places") && placesQuery) {
    try {
      const businesses = await searchBusinessesWithoutWebsite(placesQuery, 20);
      for (const b of businesses) {
        candidates.push({
          // Place ID, not a handle -- it's the stable, unique identifier
          // that db.ts's (owner_user_id, platform, lower(handle)) unique
          // index dedupes on, same role @handle plays for Twitter/Threads.
          handle: b.placeId,
          platform: "places",
          pain: `${b.category}, no website listed${b.rating ? ` (${b.rating}★ on Google)` : ""}`,
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
  const placesQuery = params.placesQuery ?? (DEFAULT_PLACES_QUERY || undefined);
  const platforms = params.platforms ?? (["twitter", "threads"] as Platform[]);

  const blacklist = new Set((settings.blacklist ?? []).map(normalizeHandle));
  const candidates = (await collectCandidates(query, platforms, placesQuery))
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
    });
    if (id) leadIds.push(id);
  }

  return { scanned: candidates.length, newLeadsCreated: leadIds.length, leadIds };
}
