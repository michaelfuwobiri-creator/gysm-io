// Plain plan/credit constants with NO database dependency.
//
// This file exists separately from lib/credits.ts (which imports lib/db.ts,
// a server-only Postgres client that throws at module-load time if
// DATABASE_URL isn't set) so that client components can safely import plan
// pricing/build data without accidentally pulling the Postgres client into
// the browser bundle. See app/pricing/CheckoutButton.tsx, which imports
// lib/stripe.ts (and therefore these constants) as a "use client" component
// -- if lib/stripe.ts pulled in lib/credits.ts directly, Next.js would bundle
// lib/db.ts's top-level `if (!process.env.DATABASE_URL) throw` into client
// JS, where process.env.DATABASE_URL is always undefined (only NEXT_PUBLIC_*
// vars are ever inlined client-side), breaking checkout for every visitor.
export const CREDIT_COST_PER_BUILD = 500;

// ---------------------------------------------------------------------------
// Real per-build AI cost, and the flat-$1-profit pricing model built on it.
//
// Mike asked (Sep 2026) to stop marking builds up 6-26x (the old flat-price
// model this replaced -- see git history on this file and lib/stripe.ts) and
// instead price every plan at its real OpenAI/Gemini/Claude cost plus a
// flat $1 profit.
//
// IMPORTANT correction (Sep 2026, same day): the $1 is charged ONCE PER
// PRICE TAG (once per pack/plan/subscription-month), not once per build
// inside it. An earlier version of this file multiplied $1 by the number
// of builds in the pack before adding it in -- Mike caught that this made
// a 600-build plan carry $600 of "flat $1" profit, which isn't what "put
// $1 as my profit" meant. See FLAT_PROFIT_USD below and git history on
// this file / lib/stripe.ts for the per-build version if that's ever
// wanted back.
//
// These per-1M-token rates are pulled directly from each provider's own
// pricing docs (Sep 2026), short-context/standard tier, non-batch:
//   - developers.openai.com/api/docs/pricing (GPT-5.6 Terra/Sol)
//   - ai.google.dev/gemini-api/docs/pricing (Gemini 3.6 Flash)
//   - platform.claude.com/docs/en/about-claude/pricing (Claude Sonnet 5)
// Two of these carry an expiration date worth watching:
//   - Sol's $4/$20 is promotional pricing OpenAI's docs say runs through
//     Nov 21, 2026 -- after that it reverts to a higher standard rate.
//     Re-check before year-end; the "best" tier's real cost (and its
//     CREDIT_COST_PER_BUILD_BEST multiplier below) will jump when it does.
//   - Gemini 3.6 Flash's $0.75/$3.75 holds only through Dec 31, 2026, then
//     doubles to $1.50/$7.50 on Jan 1, 2027 per Google's own docs -- that
//     doubles DESIGN_PASS_COST below (and therefore every tier's total
//     build cost) the moment the calendar flips, independent of anything
//     OpenAI or Anthropic does.
// Long-context pricing (a higher tier past some input-length threshold)
// exists for the OpenAI models but isn't used here -- a single-prompt HTML
// build's ~2-4K token prompts never approach it.
const MODEL_COST_PER_1M_TOKENS = {
  // Structure/edit pass (see lib/ai/orchestrator.ts) -- default tier.
  "gpt-5.6-terra": { input: 2, output: 12 },
  // Structure/edit pass -- "best" tier (ModelTier "best"). Promotional
  // through Nov 21, 2026 -- see note above.
  "gpt-5.6-sol": { input: 4, output: 20 },
  // Structure/edit pass -- "claude" tier (ModelTier "claude"). Anthropic's
  // docs note this was introductory pricing that a scheduled Sep 1, 2026
  // increase to $3/$15 was cancelled for -- $2/$10 is now the standing
  // standard rate, not a promo with a countdown like the two above.
  "claude-sonnet-5": { input: 2, output: 10 },
  // Design-polish pass (see lib/ai/orchestrator.ts) -- same model for
  // every tier, run as a second pass after whichever structure model above.
  // Promotional through Dec 31, 2026 -- see note above.
  "gemini-3.6-flash": { input: 0.75, output: 3.75 },
} as const;

// Typical token counts per build. Not metered per-request (that would need
// real usage tracking this codebase doesn't have -- see the "meter real
// token usage" option Mike passed on in favor of this estimate-based
// approach) -- these are round-number stand-ins for a typical one-shot HTML
// app generation plus its design pass, in the same spirit as (and replacing)
// the old flat "~$0.07/build" comment this file used to cite for GPT-4o.
const STRUCTURE_PASS_TOKENS = { input: 2000, output: 4000 };
const DESIGN_PASS_TOKENS = { input: 4000, output: 4000 };

function passCost(model: keyof typeof MODEL_COST_PER_1M_TOKENS, tokens: { input: number; output: number }): number {
  const rate = MODEL_COST_PER_1M_TOKENS[model];
  return (tokens.input * rate.input + tokens.output * rate.output) / 1_000_000;
}

const DESIGN_PASS_COST = passCost("gemini-3.6-flash", DESIGN_PASS_TOKENS);

/** Real estimated AI cost of one build, in USD, per model tier. */
export const BUILD_COST_USD = {
  fast: passCost("gpt-5.6-terra", STRUCTURE_PASS_TOKENS) + DESIGN_PASS_COST,
  best: passCost("gpt-5.6-sol", STRUCTURE_PASS_TOKENS) + DESIGN_PASS_COST,
  claude: passCost("claude-sonnet-5", STRUCTURE_PASS_TOKENS) + DESIGN_PASS_COST,
} as const;

// Flat profit added ONCE per price tag -- see lib/stripe.ts PRICING_PLANS,
// where each GYSM plan's price is
// priceCoveringStripeFee(builds * BUILD_COST_USD.fast + FLAT_PROFIT_USD).
// Not multiplied by build count: a 5-build Starter Pack and a 600-build
// Studio plan each carry exactly $1 of this flat profit, not $5 vs $600.
// That's a deliberate near-zero margin on bulk plans -- Mike's explicit
// call after seeing what the per-build version did to Studio's price.
export const FLAT_PROFIT_USD = 1;

// Non-default model tiers cost more credits than the default Terra tier,
// scaled to their real cost ratio against Terra (previously a flat 2x for
// both "best" and "claude" -- see git history -- back when both were
// assumed equally more expensive; they aren't anymore. Claude Sonnet 5's
// $2/$10 per-1M rate is now close to Terra's own cost, and Sol is the only
// tier still meaningfully pricier). Rounded to the nearest 50 credits so
// the numbers stay clean; charged only when a user explicitly opts into a
// non-default tier in the builder -- default generate/public API traffic
// keeps costing CREDIT_COST_PER_BUILD exactly as it always has.
function creditsForTier(tier: keyof typeof BUILD_COST_USD): number {
  const ratio = BUILD_COST_USD[tier] / BUILD_COST_USD.fast;
  return Math.round((CREDIT_COST_PER_BUILD * ratio) / 50) * 50;
}
export const CREDIT_COST_PER_BUILD_BEST = creditsForTier("best");
export const CREDIT_COST_PER_BUILD_CLAUDE = creditsForTier("claude");

// Builds included per plan per month, and the credit equivalent
// (builds * CREDIT_COST_PER_BUILD). Single source of truth for
// lib/stripe.ts PRICING_PLANS -- change build counts here.
export const BUILDS_PER_PLAN = {
  credits_starter: 5,
  credits_popular: 20,
  credits_bulk: 50,
  plan_builder: 40,
  plan_pro: 150,
  plan_studio: 600,
  // VOIIE (see lib/voiie/*) -- a hunted lead pays one of these one-time
  // tiers to take their free demo live. The credit grant isn't for more
  // AI builds of the demo itself (VOIIE already built and paid for that
  // via the orchestrator) -- it's a welcome balance so the newly
  // converted customer (see lib/voiie/billing.ts convertLeadToCustomer)
  // can immediately make a few self-serve edits in the regular builder
  // without hitting "out of credits" on day one. Scaled with price the
  // same way the DIY packs are.
  voiie_starter: 3,
  voiie_pro: 10,
  voiie_agency: 30,
} as const;

export const CREDITS_PER_PLAN = Object.fromEntries(
  Object.entries(BUILDS_PER_PLAN).map(([id, builds]) => [id, builds * CREDIT_COST_PER_BUILD])
) as Record<keyof typeof BUILDS_PER_PLAN, number>;
