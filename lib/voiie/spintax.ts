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
  "{Hey|Hi} {name}, saw you {pain}. I'm VOIIE from GYSM.IO — I can build it in 10 min. {Free demo, no cost|No cost, just a free demo}. Want a {quick 2-min consult|2-minute chat}?",
  "{Hey|Hi there} {name} — noticed you {pain}. I build sites in ~10 minutes with VOIIE (GYSM.IO). {Free demo|No-cost demo} if you want to see it first. {Got 2 min?|Quick 2-min consult?}",
  "{Hi|Hey} {name}, VOIIE here (GYSM.IO) — spotted that you {pain}. I can have a {free demo|no-cost demo} ready in 10 min. {Worth a 2-min consult?|Want a quick look?}",
  "{Hey|Hi} {name} — you {pain}, right? I'm an AI agent (VOIIE, part of GYSM.IO) that builds a {free|no-cost} demo site in about 10 minutes. {2-min consult?|Want to see it?}",
  "{Hi|Hey there} {name}, saw your post — {pain}. VOIIE (GYSM.IO) can spin up a {free demo|no-cost preview} in 10 min flat. {Quick 2-min consult?|Interested?}",
  "{Hey|Hi} {name}! Noticed you {pain} — I'm VOIIE, GYSM.IO's build agent. {Free, no-cost demo|No-cost demo} in 10 minutes. {2 min to chat?|Worth a quick look?}",
  "{Hi|Hey} {name}, you mentioned you {pain}. I can get you a {free|no-cost} demo site live in ~10 min via VOIIE (GYSM.IO). {Quick 2-min consult?|Up for it?}",
  "{Hey there|Hi} {name} — {pain}? I build a {free demo|no-cost demo} in 10 minutes with VOIIE, GYSM.IO's agent. {Got 2 min for a quick consult?|Want to see it?}",
  "{Hi|Hey} {name}, VOIIE from GYSM.IO here — saw you {pain}. {Free|No-cost} demo, 10 min build. {Quick 2-minute consult?|Interested in a look?}",
  "{Hey|Hi} {name} — {pain} and I can help. VOIIE (GYSM.IO) builds a {free demo|no-cost demo} in about 10 min. {2-min consult, no pressure?|Want to see it first?}",
];

/** Picks one of the 10 templates at random and resolves its spintax. */
export function pickOutreachTemplate(): string {
  const template = OUTREACH_SPINTAX_TEMPLATES[Math.floor(Math.random() * OUTREACH_SPINTAX_TEMPLATES.length)];
  return renderSpintax(template);
}
