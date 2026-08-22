"use client";

import { useEffect, useMemo, useState } from "react";

// Interactive "publish this build to the App Store / Play Store" checklist.
// GYSM builds are web apps first -- getting one into either store means an
// extra native-wrapping step (Capacitor for iOS, a TWA for Android) plus a
// pile of platform paperwork. This walks a user through all of it, in order,
// with the exact current asset specs so they don't get bounced by a
// dimension-mismatch error the way GYSM's own iOS listing just was.

type ReqItem = {
  id: string;
  label: string;
  detail: string;
  required: boolean;
  spec?: string;
  docsUrl?: string;
};

type ReqSection = {
  title: string;
  items: ReqItem[];
};

type Platform = {
  id: "ios" | "android";
  name: string;
  tagline: string;
  accentClass: string;
  account: { label: string; cost: string; url: string };
  console: { label: string; url: string };
  sections: ReqSection[];
};

const PLATFORMS: Platform[] = [
  {
    id: "ios",
    name: "Apple App Store",
    tagline: "Submitted via App Store Connect, reviewed by Apple, typically 24-48h.",
    accentClass: "violet",
    account: {
      label: "Apple Developer Program",
      cost: "$99/year",
      url: "https://developer.apple.com/programs/",
    },
    console: { label: "App Store Connect", url: "https://appstoreconnect.apple.com" },
    sections: [
      {
        title: "1. Developer account",
        items: [
          {
            id: "ios-account",
            label: "Enroll in the Apple Developer Program",
            detail:
              "Individual or organization (an org needs a D-U-N-S number). Requires an Apple ID with two-factor authentication turned on.",
            required: true,
            docsUrl: "https://developer.apple.com/programs/enroll/",
          },
        ],
      },
      {
        title: "2. Wrap it as a real app",
        items: [
          {
            id: "ios-wrapper",
            label: "Wrap your GYSM build in a native shell",
            detail:
              "Apple doesn't accept a plain web link as an app. Your build needs to be wrapped (Capacitor is the standard path) into a real iOS project you can compile.",
            required: true,
          },
          {
            id: "ios-build",
            label: "Produce a signed .ipa",
            detail:
              "Needs Xcode on a Mac, or a Mac-free CI pipeline (GitHub Actions + Fastlane works well) to build, sign, and upload to TestFlight/App Store Connect.",
            required: true,
          },
        ],
      },
      {
        title: "3. App identity",
        items: [
          {
            id: "ios-bundle",
            label: "Bundle ID",
            detail: "Reverse-DNS style, e.g. io.gysm.yourapp. Registered in your Apple Developer account.",
            required: true,
          },
          {
            id: "ios-icon",
            label: "App icon",
            detail: "Square, no transparency, no rounded corners (Apple rounds it automatically).",
            spec: "1024 x 1024px, PNG, no alpha channel",
            required: true,
          },
        ],
      },
      {
        title: "4. Screenshots",
        items: [
          {
            id: "ios-ss-65",
            label: "iPhone 6.5\" display screenshots",
            detail: "At least 1, up to 10. These get reused across similar display sizes and localizations.",
            spec: "1284 x 2778px or 1242 x 2688px (portrait)",
            required: true,
            docsUrl: "https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications",
          },
          {
            id: "ios-ss-69",
            label: "iPhone 6.9\" display screenshots",
            detail: "Required if you're targeting the newest iPhone Pro Max-class devices.",
            spec: "1320 x 2868px or 2868 x 1320px",
            required: false,
            docsUrl: "https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications",
          },
          {
            id: "ios-ss-ipad",
            label: "iPad screenshots",
            detail: "Only needed if your app supports iPad.",
            spec: "2048 x 2732px or 2064 x 2752px",
            required: false,
          },
        ],
      },
      {
        title: "5. Store listing text",
        items: [
          { id: "ios-name", label: "App name", detail: "Shown on the App Store.", spec: "Max 30 characters", required: true },
          { id: "ios-subtitle", label: "Subtitle", detail: "Short tagline under the name.", spec: "Max 30 characters", required: false },
          { id: "ios-promo", label: "Promotional text", detail: "Editable any time without a new review.", spec: "Max 170 characters", required: false },
          { id: "ios-desc", label: "Description", detail: "Full app description.", spec: "Max 4,000 characters", required: true },
          { id: "ios-keywords", label: "Keywords", detail: "Comma-separated, used for search.", spec: "Max 100 characters total", required: true },
          { id: "ios-support-url", label: "Support URL", detail: "A real page users can reach for help.", required: true },
          { id: "ios-marketing-url", label: "Marketing URL", detail: "Your app's landing page.", required: false },
          { id: "ios-category", label: "Category", detail: "Primary, and optionally a secondary category.", required: true },
        ],
      },
      {
        title: "6. Legal & privacy",
        items: [
          { id: "ios-privacy-url", label: "Privacy Policy URL", detail: "Mandatory even for apps that collect nothing.", required: true },
          {
            id: "ios-privacy-label",
            label: "App Privacy questionnaire",
            detail: "Apple's \"nutrition label\" -- declare what data you collect and why.",
            required: true,
            docsUrl: "https://developer.apple.com/app-store/app-privacy-details/",
          },
          {
            id: "ios-age-rating",
            label: "Age rating questionnaire",
            detail: "Determines the 4+/9+/12+/17+ rating shown on your listing.",
            required: true,
          },
          { id: "ios-copyright", label: "Copyright line", detail: "e.g. \"(c) 2026 Your Name\".", required: true },
          {
            id: "ios-export",
            label: "Export compliance",
            detail: "Declare whether the app uses encryption (standard HTTPS usually qualifies for the exempt path).",
            required: true,
          },
        ],
      },
      {
        title: "7. Pricing & review info",
        items: [
          { id: "ios-pricing", label: "Price tier & territories", detail: "Free or paid, and which countries it's available in.", required: true },
          {
            id: "ios-review-contact",
            label: "App Review contact info",
            detail: "Name, phone, email the review team can reach if something's unclear.",
            required: true,
          },
          {
            id: "ios-review-signin",
            label: "Demo sign-in credentials",
            detail: "If your app requires login, provide a working demo username/password so reviewers can get in.",
            required: false,
          },
          { id: "ios-review-notes", label: "Notes for the reviewer", detail: "Anything non-obvious about how to use the app.", required: false },
        ],
      },
      {
        title: "8. Submit",
        items: [
          {
            id: "ios-attach-build",
            label: "Attach your build",
            detail: "Upload via Xcode, Transporter, or your CI pipeline, then select it on the version page.",
            required: true,
          },
          { id: "ios-submit", label: "Click \"Add for Review\"", detail: "Only after every item above is actually filled in -- Apple rejects incomplete submissions outright.", required: true },
        ],
      },
    ],
  },
  {
    id: "android",
    name: "Google Play",
    tagline: "Submitted via Google Play Console. New apps typically take longer to clear review than updates.",
    accentClass: "fuchsia",
    account: {
      label: "Google Play Console account",
      cost: "$25 one-time",
      url: "https://play.google.com/console/signup",
    },
    console: { label: "Google Play Console", url: "https://play.google.com/console" },
    sections: [
      {
        title: "1. Developer account",
        items: [
          {
            id: "and-account",
            label: "Register a Play Console account",
            detail: "One-time fee, plus identity verification (can take a few days).",
            required: true,
          },
        ],
      },
      {
        title: "2. Wrap it as a real app",
        items: [
          {
            id: "and-twa",
            label: "Package as a Trusted Web Activity (TWA)",
            detail:
              "The practical path for a GYSM web build: Bubblewrap wraps your site into an installable Android app backed by Chrome, no full native rewrite needed.",
            required: true,
            docsUrl: "https://developer.chrome.com/docs/android/trusted-web-activity/",
          },
          {
            id: "and-assetlinks",
            label: "Host a Digital Asset Links file",
            detail: "Proves you own the domain the TWA points at -- required or Chrome shows the app in a browser chrome, not fullscreen.",
            spec: "yourdomain.com/.well-known/assetlinks.json",
            required: true,
            docsUrl: "https://developer.android.com/training/app-links/verify-android-applinks",
          },
          {
            id: "and-aab",
            label: "Produce a signed .aab (Android App Bundle)",
            detail: "Play requires the bundle format, not a raw .apk, for new apps.",
            required: true,
          },
        ],
      },
      {
        title: "3. App identity",
        items: [
          { id: "and-package", label: "Package name", detail: "Reverse-DNS style, e.g. io.gysm.yourapp. Can't be changed after publishing.", required: true },
          { id: "and-icon", label: "App icon", spec: "512 x 512px, 32-bit PNG", detail: "Your app's icon on the Play Store.", required: true },
        ],
      },
      {
        title: "4. Store graphics",
        items: [
          { id: "and-feature", label: "Feature graphic", spec: "1024 x 500px", detail: "Banner shown at the top of your store listing.", required: true },
          {
            id: "and-screenshots",
            label: "Phone screenshots",
            detail: "At least 2.",
            spec: "16:9 or 9:16, each side between 320px and 3840px",
            required: true,
          },
          { id: "and-tablet-ss", label: "Tablet / other screenshots", detail: "Only needed if you support those form factors.", required: false },
        ],
      },
      {
        title: "5. Store listing text",
        items: [
          { id: "and-name", label: "App name", spec: "Max 30 characters", detail: "Shown on the Play Store.", required: true },
          { id: "and-short-desc", label: "Short description", spec: "Max 80 characters", detail: "Shown under the app name in search.", required: true },
          { id: "and-full-desc", label: "Full description", spec: "Max 4,000 characters", detail: "Main listing copy.", required: true },
          { id: "and-category", label: "Category & tags", detail: "Helps Play surface your app in search and browse.", required: true },
          { id: "and-contact-email", label: "Contact email", detail: "Required -- must be a real, monitored address.", required: true },
        ],
      },
      {
        title: "6. Legal & compliance",
        items: [
          { id: "and-privacy-url", label: "Privacy Policy URL", detail: "Mandatory even if you collect no data.", required: true },
          {
            id: "and-data-safety",
            label: "Data safety form",
            detail: "Declare what data you collect, whether it's shared, and how it's secured.",
            required: true,
            docsUrl: "https://support.google.com/googleplay/android-developer/answer/10787469",
          },
          {
            id: "and-content-rating",
            label: "Content rating questionnaire (IARC)",
            detail: "Determines the age rating shown on your listing.",
            required: true,
            docsUrl: "https://support.google.com/googleplay/android-developer/answer/9859655",
          },
          { id: "and-target-audience", label: "Target audience & content", detail: "Declare the age groups your app is designed for.", required: true },
          { id: "and-ads", label: "Ads declaration", detail: "Declare whether your app shows ads.", required: true },
        ],
      },
      {
        title: "7. Release",
        items: [
          {
            id: "and-track",
            label: "Choose a release track",
            detail: "Internal testing -> closed -> open -> production is the safe rollout order; you can also go straight to production.",
            required: true,
          },
          { id: "and-upload", label: "Upload your signed .aab", detail: "Attach it to the release.", required: true },
          { id: "and-countries", label: "Countries & pricing", detail: "Free or paid -- paid or in-app purchases must go through Play Billing.", required: true },
          { id: "and-submit", label: "Roll out the release", detail: "Only after every item above is filled in.", required: true },
        ],
      },
    ],
  },
];

function loadChecked(key: string): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export default function AppStoreGuide({
  projectId,
  appName,
}: {
  projectId: string;
  appName: string;
}) {
  const [platformId, setPlatformId] = useState<"ios" | "android">("ios");
  const storageKey = `gysm_appstore_checklist_${projectId}`;
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setChecked(loadChecked(storageKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, JSON.stringify(checked));
  }, [checked, storageKey]);

  const platform = PLATFORMS.find((p) => p.id === platformId)!;

  const { done, total, requiredDone, requiredTotal } = useMemo(() => {
    let done = 0,
      total = 0,
      requiredDone = 0,
      requiredTotal = 0;
    for (const section of platform.sections) {
      for (const item of section.items) {
        total++;
        if (checked[item.id]) done++;
        if (item.required) {
          requiredTotal++;
          if (checked[item.id]) requiredDone++;
        }
      }
    }
    return { done, total, requiredDone, requiredTotal };
  }, [platform, checked]);

  function toggle(id: string) {
    setChecked((c) => ({ ...c, [id]: !c[id] }));
  }

  const accent =
    platform.accentClass === "violet"
      ? { bg: "bg-violet-600", text: "text-violet-600", border: "border-violet-500/30", bar: "bg-violet-500" }
      : { bg: "bg-fuchsia-600", text: "text-fuchsia-600", border: "border-fuchsia-500/30", bar: "bg-fuchsia-500" };

  return (
    <div className="min-h-screen bg-[#FCFCF9] text-[#0A0A0A]">
      <div className="max-w-3xl mx-auto px-5 py-10">
        <a href={`/builder?projectId=${projectId}`} className="text-[13px] text-black/40 hover:text-black/70">
          &larr; Back to builder
        </a>

        <h1 className="text-2xl md:text-3xl font-black mt-3">Publish "{appName}" to the app stores</h1>
        <p className="text-black/50 mt-2 text-[14px] max-w-xl">
          Everything Apple and Google require before they'll let this build go live, in order. Check items off as
          you finish them -- your progress is saved on this device.
        </p>

        {/* Platform tabs */}
        <div className="flex gap-2 mt-6">
          {PLATFORMS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPlatformId(p.id)}
              className={`px-4 py-2 rounded-full text-[13px] font-bold transition ${
                p.id === platformId ? "bg-black text-white" : "bg-black/[0.04] text-black/60 hover:bg-black/[0.08]"
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>

        <p className="text-black/40 text-[12px] mt-3">{platform.tagline}</p>

        {/* Progress */}
        <div className="mt-4 rounded-2xl border border-black/10 bg-white shadow-sm p-4">
          <div className="flex items-center justify-between text-[12px] mb-2">
            <span className="font-semibold text-black/70">
              {done} of {total} steps checked off ({requiredDone}/{requiredTotal} required)
            </span>
            <span className="text-black/40">{Math.round((requiredDone / Math.max(requiredTotal, 1)) * 100)}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-black/10 overflow-hidden">
            <div
              className={`h-full ${accent.bar} transition-all`}
              style={{ width: `${(requiredDone / Math.max(requiredTotal, 1)) * 100}%` }}
            />
          </div>
        </div>

        {/* Account + console quick links */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <a
            href={platform.account.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-black/10 bg-white shadow-sm p-3 hover:bg-black/[0.02] transition"
          >
            <div className="text-[11px] text-black/40 uppercase tracking-wide font-bold">Account</div>
            <div className="text-[13px] font-semibold mt-1">{platform.account.label}</div>
            <div className="text-[12px] text-black/50">{platform.account.cost}</div>
          </a>
          <a
            href={platform.console.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-black/10 bg-white shadow-sm p-3 hover:bg-black/[0.02] transition"
          >
            <div className="text-[11px] text-black/40 uppercase tracking-wide font-bold">Console</div>
            <div className="text-[13px] font-semibold mt-1">{platform.console.label} &rarr;</div>
          </a>
        </div>

        {/* Sections */}
        <div className="mt-8 flex flex-col gap-6">
          {platform.sections.map((section) => (
            <div key={section.title}>
              <div className="text-[13px] font-bold text-black/80 mb-2">{section.title}</div>
              <div className="flex flex-col gap-2">
                {section.items.map((item) => (
                  <label
                    key={item.id}
                    className={`flex gap-3 items-start rounded-xl border p-3 cursor-pointer transition ${
                      checked[item.id] ? `${accent.border} bg-black/[0.03]` : "border-black/10 bg-white hover:bg-black/[0.02]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={!!checked[item.id]}
                      onChange={() => toggle(item.id)}
                      className="mt-1 h-4 w-4 shrink-0 accent-violet-600"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[13px] font-semibold ${checked[item.id] ? "line-through text-black/40" : ""}`}>
                          {item.label}
                        </span>
                        {item.required ? (
                          <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-500/15 text-red-600">
                            Required
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-black/5 text-black/40">
                            Optional
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] text-black/50 mt-0.5">{item.detail}</p>
                      {item.spec && (
                        <p className={`text-[12px] mt-1 font-mono ${accent.text}`}>{item.spec}</p>
                      )}
                      {item.docsUrl && (
                        <a
                          href={item.docsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-[12px] text-black/40 hover:text-black/70 underline underline-offset-2 mt-1 inline-block"
                        >
                          Official docs &rarr;
                        </a>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="h-16" />
      </div>
    </div>
  );
}
