# iOS CI pipeline setup (one-time)

This repo builds and ships iOS TestFlight builds on GitHub's hosted macOS
runners (`.github/workflows/ios-testflight.yml` + `fastlane/`) — no local
Mac needed. Before the first run, add these as GitHub repo secrets
(Settings -> Secrets and variables -> Actions):

## 1. App Store Connect API key
App Store Connect -> Users and Access -> Integrations -> App Store Connect
API -> create a key with "App Manager" access.
- `ASC_KEY_ID` — the Key ID shown on that page
- `ASC_ISSUER_ID` — the Issuer ID shown at the top of that page
- `ASC_KEY_CONTENT` — the downloaded `.p8` file, base64-encoded
  (`base64 -i AuthKey_XXXX.p8 | pbcopy` on a Mac, or `certutil -encode`
  on Windows then strip the header/footer lines)

This is a separate key from the Sign In with Apple key already set up in
Clerk — this one has App Store Connect API scope, not auth scope.

## 2. Certificate/profile storage (fastlane match)
`fastlane match` keeps the distribution certificate and provisioning
profile in an encrypted private git repo so CI doesn't create a new
certificate on every run (Apple caps distribution certs at 2-3 per team).
- Create a new **private** GitHub repo, e.g. `gysm-io-certificates`
  (empty is fine, match initializes it)
- `MATCH_GIT_URL` — that repo's URL, e.g.
  `https://github.com/michaelfuwobiri-creator/gysm-io-certificates.git`
- `MATCH_PASSWORD` — any passphrase you choose, used to encrypt the
  cert/profile in that repo; save it somewhere safe, you'll need it again
  to rotate certs later

## First run
Trigger the workflow manually (Actions tab -> "iOS TestFlight build" ->
Run workflow). The very first run needs `readonly: false` in the `match`
call in `fastlane/Fastfile` so it can create the cert/profile — after
that first successful run, flip it back to `readonly: true` (match will
then just fetch the existing cert instead of creating new ones each time).

## Still needed before an App Store submission
- App Store Connect -> Monetization -> In-App Purchases: create products
  matching the IDs in `lib/iap.ts` (`io.gysm.app.credits_starter`, etc.)
- RevenueCat project wired to those same product IDs, offering named
  "default"
- Vercel env vars: `NEXT_PUBLIC_REVENUECAT_IOS_API_KEY` and
  `REVENUECAT_WEBHOOK_SECRET`
