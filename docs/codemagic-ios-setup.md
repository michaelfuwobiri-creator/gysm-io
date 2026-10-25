# Codemagic → App Store (iOS)

The build config is `codemagic.yaml` (bundle id `io.gysm.app`, Team FJU33P8JUF).

## One-time setup
1. codemagic.io → Add application → pick this GitHub repo → "codemagic.yaml" config.
2. Teams → Integrations → Developer Portal → App Store Connect → add your API key
   (App Manager access). Name it **gysm_asc**. The key stays inside Codemagic.
3. Environment variables → new group **gysm_ios** with `APP_STORE_APPLE_ID`
   (numeric Apple ID of the app record).
4. App Store Connect → Apps → + → New App: bundle id `io.gysm.app`, name "GYSM — AI App Builder".
5. Monetization → In-App Purchases / Subscriptions: create the product ids in `lib/iap.ts`
   (credits_starter, credits_popular, credits_bulk as consumables; plan_builder/pro/studio.monthly
   as auto-renewable subscriptions in one subscription group). Add review screenshot + description.
6. RevenueCat: Apple app, same product ids, offering "default"; set Vercel env vars
   `NEXT_PUBLIC_REVENUECAT_IOS_API_KEY` and `REVENUECAT_WEBHOOK_SECRET`.

## Run
- **ios-testflight**: Start new build → pick workflow. Installs on TestFlight in ~15 min.
- **ios-release**: same build, plus submits for App Store review once the listing is complete.

## Before submitting for review (App Store Connect)
- Listing copy: `store-assets/app-store-connect-listing.md`
- Screenshots: iPhone 6.9" (1320×2868) — app is iPhone-only now, so no iPad set needed
- App Privacy answers: match `ios/App/App/PrivacyInfo.xcprivacy`
- Age rating questionnaire: 4+ (all "None"); user-generated content = yes (BuildGuild) → see 1.2 below
- Export compliance: already answered in Info.plist (`ITSAppUsesNonExemptEncryption = false`)
- App Review → Sign-in info: provide a demo account (email + password) that has credits
- Review notes: explain that GYSM generates apps from text prompts via an AI service, credits are bought
  only through In-App Purchase inside the iOS app, and account deletion is Profile → Manage account →
  Security → Delete account.
- Sign in with Apple must be enabled in Clerk (Social connections → Apple) since Google etc. are offered.
- Guideline 1.2 (UGC, BuildGuild comments): needs report + block + contact info; confirm these exist.
