import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Thin locale-aware wrappers around next/link + next/navigation. Only
// used by components inside the homepage's [locale] segment (e.g. the
// language switcher) -- nothing outside app/[locale]/** should import
// from here, since every other route in the app has no locale segment.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
