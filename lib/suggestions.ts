// Contextual "what to do next" chips shown after a successful build.
// Heuristic keyword match against the prompt, falling back to solid
// generic suggestions. Clicking one feeds straight into editWebsite()
// (see app/api/generate/route.ts) as the edit instruction.

const CATEGORY_SUGGESTIONS: { match: RegExp; suggestions: string[] }[] = [
  {
    match: /(shop|store|ecommerce|e-commerce|product|sell|market)/i,
    suggestions: [
      "Add a shopping cart with quantity controls",
      "Add a checkout flow with a shipping form",
      "Add filters for category and price",
    ],
  },
  {
    match: /(food|restaurant|delivery|menu|dish|cafe)/i,
    suggestions: [
      "Add delivery address and time fields to checkout",
      "Add dietary tags like vegan or gluten-free to menu items",
      "Add an order tracking screen",
    ],
  },
  {
    match: /(clinic|health|doctor|patient|medical|dentist)/i,
    suggestions: [
      "Add an appointment booking calendar",
      "Add a patient intake form",
      "Add doctor or provider profiles",
    ],
  },
  {
    match: /(dating|match|zodiac|astrology|moon|compat)/i,
    suggestions: [
      "Add a swipe-to-match interaction",
      "Add a compatibility score breakdown",
      "Add a chat screen for matches",
    ],
  },
  {
    match: /(blog|article|news|content|magazine)/i,
    suggestions: [
      "Add categories and tags to posts",
      "Add a newsletter signup section",
      "Add a comments section",
    ],
  },
  {
    match: /(saas|dashboard|analytics|tool|admin)/i,
    suggestions: [
      "Add a usage chart to the dashboard",
      "Add a settings page with account fields",
      "Add an upgrade/pricing prompt",
    ],
  },
];

const GENERIC_SUGGESTIONS = [
  "Add a contact or booking form",
  "Add a testimonials section",
  "Add an FAQ section",
  "Tighten the palette to one accent color",
  "Make the headlines bigger and bolder",
  "Add a pricing section",
];

export function buildSuggestions(prompt: string): string[] {
  const matched = CATEGORY_SUGGESTIONS.filter((c) => c.match.test(prompt)).flatMap((c) => c.suggestions);
  const pool = [...matched, ...GENERIC_SUGGESTIONS];

  const seen = new Set<string>();
  const result: string[] = [];
  for (const s of pool) {
    if (seen.has(s)) continue;
    seen.add(s);
    result.push(s);
    if (result.length >= 4) break;
  }
  return result;
}
