import { defineRouting } from "next-intl/routing";

// GYSM.IO's supported locales. "en" has no URL prefix (localePrefix:
// "as-needed") so every existing link to gysm.io/... keeps working
// unchanged -- only the other 7 locales show up as gysm.io/hr, gysm.io/de,
// etc. This only governs the homepage (see middleware.ts) -- the rest of
// the app (dashboard, builder, admin, api, publish/[id]...) is untouched.
export const routing = defineRouting({
  locales: ["en", "hr", "de", "fr", "es", "hi", "ja", "pt"],
  defaultLocale: "en",
  localePrefix: "as-needed",
  localeCookie: {
    name: "NEXT_LOCALE",
    maxAge: 60 * 60 * 24 * 365,
  },
});

