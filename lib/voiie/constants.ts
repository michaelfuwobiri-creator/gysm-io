// Pure constants shared between server logic (lib/voiie/hunt.ts,
// lib/voiie/outreach.ts) and client components (app/voiie/_components/*).
// Kept in their own file, with zero imports, because hunt.ts/outreach.ts
// pull in server-only packages (twitter-api-v2, @/lib/db) that can't be
// bundled into client code.

export const DEFAULT_HUNT_QUERY = "(need website OR looking for developer OR need landing page) -is:retweet";

// A category + location, e.g. "plumbers in Austin, TX" -- same shape as
// typing into Google Maps. Left blank by default rather than guessing a
// city: lib/voiie/hunt.ts skips the Places source entirely when this is
// empty, so leaving it blank just means "don't hunt Places this run,"
// not an error.
export const DEFAULT_PLACES_QUERY = "";

export const DEFAULT_OUTREACH_TEMPLATE =
  "Hey {name}, saw you need {pain}. I'm VOIIE from GYSM.IO — I deliver a website in 10 min. Free demo, no cost. Want a quick 2-min consult?";
