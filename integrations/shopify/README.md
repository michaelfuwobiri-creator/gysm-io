# GYSM for Shopify

Embedded Shopify admin app. A merchant describes their store in plain English;
GYSM creates DRAFT products and unpublished starter pages in their store.
Nothing is published and nothing is charged by this app version.

Code: `app/shopify` (embedded page), `app/api/shopify/*` (session, build,
webhooks), `lib/shopify/*` (signature checks, Admin API, token storage),
`db/migrations/0038_shopify.sql`.

## Environment variables (Vercel, owner sets these)

- `SHOPIFY_API_KEY` -- Client ID (Dev Dashboard > GYSM > Settings)
- `NEXT_PUBLIC_SHOPIFY_API_KEY` -- same Client ID (read by the browser for App Bridge)
- `SHOPIFY_API_SECRET` -- Client secret (never commit)
- `BACKEND_ENCRYPTION_KEY` and `DATABASE_URL` already exist and are reused

## Release steps

1. Run `db/migrations/0038_shopify.sql` on the Neon database.
2. Set the env vars above in Vercel and redeploy.
3. Put the Client ID into `shopify.app.toml` and run `shopify app deploy` (this
   registers the webhooks, including the three mandatory privacy topics, and
   narrows the scopes to what the app uses).
4. Install on a development store and run "Build my store drafts".

## Not done yet (owner decisions)

- Billing: Shopify requires Shopify Billing for any paid plan in a listed app.
  This version is free. A paid plan means adding the Billing API and a plan.
- App Store listing assets and submission.
