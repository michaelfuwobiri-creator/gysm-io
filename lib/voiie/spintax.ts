// Spintax: {option one|option two|option three} groups randomly resolved
// to one option, so first-touch outreach doesn't send the exact same
// sentence to hundreds of strangers in a row (the #1 signal Twitter/X and
// WhatsApp spam filters flag on). Pure -- no imports -- safe from both
// server routes and lib/voiie/outreach.ts.

/** Resolves every {a|b|c} group in `input` to one randomly-chosen option. */
export function renderSpintax(input: string): string {
  return input.replace(/\{([^{}]+)\}/g, (_match, group: string) => {
    const options = group.split("|");
    return options[Math.floor(Math.random() * options.length)];
  });
}

/**
 * 10 first-touch outreach variations (the brief's ask). Each is spintax
 * itself, so 10 templates x a handful of {a|b} swaps each gives hundreds
 * of distinct renderings -- {name} and {pain} are filled in afterward by
 * lib/voiie/outreach.ts's renderTemplate, same as the single-template path.
 */
export const OUTREACH_SPINTAX_TEMPLATES: string[] = [
  "{Hey|Hi} {name}, saw you {pain}. I'm VOIIE from GYSM — I can build it in 10 min. {Free demo, no cost|No cost, just a free demo}. Want a {quick 2-min consult|2-minute chat}?",
  "{Hey|Hi there} {name} — noticed you {pain}. I build sites in ~10 minutes with VOIIE (GYSM). {Free demo|No-cost demo} if you want to see it first. {Got 2 min?|Quick 2-min consult?}",
  "{Hi|Hey} {name}, VOIIE here (GYSM) — spotted that you {pain}. I can have a {free demo|no-cost demo} ready in 10 min. {Worth a 2-min consult?|Want a quick look?}",
  "{Hey|Hi} {name} — you {pain}, right? I'm an AI agent (VOIIE, part of GYSM) that builds a {free|no-cost} demo site in about 10 minutes. {2-min consult?|Want to see it?}",
  "{Hi|Hey there} {name}, saw your post — {pain}. VOIIE (GYSM) can spin up a {free demo|no-cost preview} in 10 min flat. {Quick 2-min consult?|Interested?}",
  "{Hey|Hi} {name}! Noticed you {pain} — I'm VOIIE, GYSM's build agent. {Free, no-cost demo|No-cost demo} in 10 minutes. {2 min to chat?|Worth a quick look?}",
  "{Hi|Hey} {name}, you mentioned you {pain}. I can get you a {free|no-cost} demo site live in ~10 min via VOIIE (GYSM). {Quick 2-min consult?|Up for it?}",
  "{Hey there|Hi} {name} — {pain}? I build a {free demo|no-cost demo} in 10 minutes with VOIIE, GYSM's agent. {Got 2 min for a quick consult?|Want to see it?}",
  "{Hi|Hey} {name}, VOIIE from GYSM here — saw you {pain}. {Free|No-cost} demo, 10 min build. {Quick 2-minute consult?|Interested in a look?}",
  "{Hey|Hi} {name} — {pain} and I can help. VOIIE (GYSM) builds a {free demo|no-cost demo} in about 10 min. {2-min consult, no pressure?|Want to see it first?}",
];

/** Picks one of the 10 templates at random and resolves its spintax. */
export function pickOutreachTemplate(): string {
  const template = OUTREACH_SPINTAX_TEMPLATES[Math.floor(Math.random() * OUTREACH_SPINTAX_TEMPLATES.length)];
  return renderSpintax(template);
}

/**
 * First-touch variations for Google Places leads (a real local business
 * whose Maps listing has no website). {business} is the business name;
 * {name} / {pain} aren't used because a Place ID is not a person's handle
 * and the "pain" line is an internal tag, not something to quote back.
 */
export const PLACES_SPINTAX_TEMPLATES: string[] = [
  "{Hi|Hello}, I came across {business} on Google Maps and noticed it doesn't have a website yet. I'm VOIIE, GYSM's AI assistant — I can build you a {free demo|no-cost demo} site in about 10 minutes so you can see what it would look like. {No obligation.|No strings attached.}",
  "{Hello|Hi there}, I found {business} on Google Maps — great listing, but there's no website linked to it. I'm VOIIE from GYSM and I build a {free|no-cost} demo site in ~10 minutes. {Happy to show you what yours could look like.|Want to see what yours could look like?}",
  "{Hi|Hello}, quick note about {business}: your Google listing has no website, so customers searching for you can't see your services or book online. I can {put together|build} a {free demo|no-cost preview} in about 10 minutes — {no obligation.|you only pay if you like it.}",
];

export function pickPlacesTemplate(): string {
  return renderSpintax(PLACES_SPINTAX_TEMPLATES[Math.floor(Math.random() * PLACES_SPINTAX_TEMPLATES.length)]);
}

/**
 * First-touch variations for businesses that already have a website we judged
 * weak (see lib/voiie/site-contact.ts). {business} = name, {issues} = the
 * short reasons found, e.g. "not mobile-friendly, no HTTPS". The email is
 * honest about why we are writing and that it is an automated assistant.
 */
export const WEAK_SITE_TEMPLATES: string[] = [
  "{Hi|Hello}, I was looking at the website for {business} and noticed it may be {issues}. I'm VOIIE, GYSM's AI assistant — I can build a {free demo|no-cost demo} of a modern version in about 10 minutes so you can compare. {No obligation.|Nothing to pay unless you like it.}",
  "{Hello|Hi there}, quick note about {business}'s website: it looks like it's {issues}, which can cost you customers who browse on their phones. I'm VOIIE from GYSM and I can put together a {free|no-cost} redesign demo in ~10 minutes. {No strings attached.|You only pay if you want it.}",
  "{Hi|Hello}, I'm VOIIE, GYSM's AI assistant. I came across {business}'s site and saw it may be {issues}. If you'd like, I'll build a {free demo|no-cost preview} of an updated version — {it takes about 10 minutes.|ready in about 10 minutes.} {No obligation.|No cost to look.}",
];

export function pickWeakSiteTemplate(): string {
  return renderSpintax(WEAK_SITE_TEMPLATES[Math.floor(Math.random() * WEAK_SITE_TEMPLATES.length)]);
}
