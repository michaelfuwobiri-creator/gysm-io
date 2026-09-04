import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis/cloudflare";

// Item #9 of GYSM_IO_HANDOFF.md: "Add rate limiting with Upstash Redis
// (100 req/min per IP)". Upstash's REST-based Redis client (fetch under
// the hood, no raw TCP socket) is what makes this usable from
// middleware.ts, which Next.js runs on the Edge runtime -- a normal
// node-redis/ioredis client can't open a TCP connection there.
//
// Imports from "@upstash/redis/cloudflare", not the bare "@upstash/redis"
// package -- caught via a real `next build` warning: the package's
// default export ("@upstash/redis") resolves to its Node.js build, which
// reads `process.version` for environment detection. `process` doesn't
// exist in Vercel's Edge Runtime (same V8-isolate sandbox Cloudflare
// Workers uses, which is exactly why Upstash ships this build for it --
// their own Node build's error message even says so: "If you are
// deploying to cloudflare, please import from '@upstash/redis/cloudflare'
// instead"). The /cloudflare build is fetch-only with zero `process.*`
// references, and exports the same `Redis` class with the same
// constructor shape, so this is a drop-in fix.
//
// Optional, same degrade-gracefully pattern as every other integration in
// this app (see .env.local.example): unset UPSTASH_REDIS_REST_URL/TOKEN
// and rateLimit() below always returns { success: true }, i.e. rate
// limiting is simply off rather than the app failing closed. That's a
// deliberate choice -- a misconfigured or down Redis should never be able
// to take the whole API surface offline.
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

let ratelimit: Ratelimit | null = null;
let warnedMissingConfig = false;

function getRatelimit(): Ratelimit | null {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    if (!warnedMissingConfig) {
      console.warn("[rateLimit] UPSTASH_REDIS_REST_URL/TOKEN not set -- rate limiting is disabled.");
      warnedMissingConfig = true;
    }
    return null;
  }
  if (!ratelimit) {
    ratelimit = new Ratelimit({
      redis: new Redis({ url: UPSTASH_URL, token: UPSTASH_TOKEN }),
      // 100 requests per rolling 60s window per key, exactly as specced.
      limiter: Ratelimit.slidingWindow(100, "60 s"),
      analytics: false,
      prefix: "gysm-ratelimit",
    });
  }
  return ratelimit;
}

// `identifier` is the caller's IP by convention (see middleware.ts, which
// is the only current call site) -- kept generic here in case a future
// caller wants to key by something else (e.g. API key id).
export async function checkRateLimit(identifier: string): Promise<{ success: boolean; limit?: number; remaining?: number; reset?: number }> {
  const rl = getRatelimit();
  if (!rl) return { success: true };

  try {
    const result = await rl.limit(identifier);
    return result;
  } catch (error: any) {
    // Upstash unreachable/erroring -- fail OPEN (allow the request), same
    // reasoning as the missing-config case above: a rate limiter that's
    // itself broken must never become an outage.
    console.error("[rateLimit] check failed, allowing request:", error.message);
    return { success: true };
  }
}
