"use client";

import { useLocale } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

const FLAGS: Record<string, string> = {
  en: "\u{1F1FA}\u{1F1F8}",
  hr: "\u{1F1ED}\u{1F1F7}",
  de: "\u{1F1E9}\u{1F1EA}",
  fr: "\u{1F1EB}\u{1F1F7}",
  es: "\u{1F1EA}\u{1F1F8}",
  hi: "\u{1F1EE}\u{1F1F3}",
  ja: "\u{1F1EF}\u{1F1F5}",
  pt: "\u{1F1E7}\u{1F1F7}",
};

const NAMES: Record<string, string> = {
  en: "English",
  hr: "Hrvatski",
  de: "Deutsch",
  fr: "Français",
  es: "Español",
  hi: "हिन्दी",
  ja: "日本語",
  pt: "Português",
};

// Fixed bottom-right language pill on the homepage. Only the homepage is
// locale-aware right now (see middleware.ts), so switching here changes
// gysm.io <-> gysm.io/hr <-> gysm.io/de etc.; next-intl's useRouter takes
// care of updating the NEXT_LOCALE cookie so the choice sticks on the next
// visit to "/" too.
//
// Hidden per Mike's request (2026-09): language already auto-switches by
// visitor IP/country (see middleware.ts's COUNTRY_TO_LOCALE block), so this
// manual pill was redundant UI clutter on the homepage. Left in place
// rather than deleted -- the auto-detect logic in middleware.ts is
// completely separate from this component and is unaffected either way --
// so re-enabling is just deleting the early return below.
const HIDDEN = true;

export default function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  if (HIDDEN) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex gap-1 rounded-full border border-[#FF0080] bg-black/80 px-2 py-2 backdrop-blur">
      {routing.locales.map((code) => (
        <button
          key={code}
          type="button"
          title={NAMES[code]}
          aria-label={`Switch to ${NAMES[code]}`}
          aria-current={locale === code}
          onClick={() => router.replace(pathname, { locale: code })}
          className={`grid h-8 w-8 place-items-center rounded-full text-[15px] transition ${
            locale === code ? "bg-[#FF0080]" : "hover:bg-white/20"
          }`}
        >
          {FLAGS[code]}
        </button>
      ))}
    </div>
  );
}
