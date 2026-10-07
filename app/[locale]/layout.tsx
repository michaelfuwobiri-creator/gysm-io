import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { routing } from "@/i18n/routing";
import JsonLd from "@/app/components/JsonLd";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.gysm.io";

// Per-locale <title>/<description> + hreflang alternates for the
// homepage only -- every other route in the app keeps the single English
// metadata block from the root app/layout.tsx untouched.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!(routing.locales as readonly string[]).includes(locale)) notFound();
  const t = await getTranslations({ locale, namespace: "Home.meta" });

  const languages: Record<string, string> = { "x-default": siteUrl };
  for (const l of routing.locales) {
    languages[l] = l === routing.defaultLocale ? siteUrl : `${siteUrl}/${l}`;
  }

  return {
    title: t("title"),
    description: t("description"),
    alternates: {
      canonical: locale === routing.defaultLocale ? siteUrl : `${siteUrl}/${locale}`,
      languages,
    },
    openGraph: {
      title: t("title"),
      description: t("description"),
      url: siteUrl,
      siteName: "GYSM",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: t("title"),
      description: t("description"),
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!(routing.locales as readonly string[]).includes(locale)) notFound();

  // Enables static rendering for this locale. No <html>/<body> here on
  // purpose -- the root app/layout.tsx already renders those for every
  // route in the app (localized or not), and Next.js doesn't allow a
  // second <html> tag from a nested layout.
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            { "@type": "Organization", "@id": `${siteUrl}/#organization`, name: "GYSM", url: siteUrl, logo: `${siteUrl}/favicon.png` },
            { "@type": "WebSite", "@id": `${siteUrl}/#website`, name: "GYSM", url: siteUrl, publisher: { "@id": `${siteUrl}/#organization` } },
            {
              "@type": "SoftwareApplication",
              name: "GYSM",
              url: siteUrl,
              applicationCategory: "DeveloperApplication",
              operatingSystem: "Web",
              description:
                "GYSM is an AI app builder: describe an app in plain English and get a working web app back, with a live preview, a code view and a public shareable link.",
              publisher: { "@id": `${siteUrl}/#organization` },
            },
          ],
        }}
      />
      {children}
    </NextIntlClientProvider>
  );
}
