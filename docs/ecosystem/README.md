# Getting GYSM into the Claude and ChatGPT ecosystems

What exists in this repo after the growth pack:

| Surface | Where | What it does |
|---|---|---|
| MCP server | `POST /api/mcp` | Six tools. Five are free, read-only planning tools. `build_app` forwards to `/api/v1/generate` with the caller's own key. |
| Plan API | `POST /api/blueprint` | Same plan engine over plain HTTP. Free, no key, creates nothing. |
| OpenAPI 3.1 | `/openapi.json` | For a custom GPT Action or any agent framework. |
| Discovery | `/llms.txt`, `/sitemap.xml` | AI assistants and search engines can find the planner, use-case pages and endpoints. |
| Domain challenge | `/.well-known/openai-apps-challenge` | Serves env var `OPENAI_APPS_CHALLENGE` when you set it, otherwise 404. |
| Claude plugin | `integrations/claude-plugin/` | Plugin bundle (manifest, `.mcp.json`, skill) for a public GitHub repo. |

Directory rules change often. Treat every requirement below as "verify on the current submission page before you submit".

## 1. Claude (Anthropic)

1. Test locally: `claude mcp add --transport http gysm https://www.gysm.io/api/mcp`, then ask Claude to plan a candle store. Check each tool is called and the answers look right.
2. Connector listing: submit the remote MCP server at the connectors directory. The planning tools need no sign-in, so a no-auth listing is possible. If you want `build_app` to work from chat with no pasted key, you need OAuth (see "Decisions" below).
3. Plugin listing: done. `integrations/claude-plugin/` is mirrored in the public repo michaelfuwobiri-creator/gysm-claude-plugin; keep the two in sync, then submit or install via marketplace.
4. Prepare: privacy policy URL, terms URL, support URL, 3 to 5 example prompts, tool descriptions (already written in `lib/mcp/server.ts`), and a short description that states the limits.

## 2. ChatGPT (OpenAI)

Two routes:

- Custom GPT with an Action: create a GPT, add an Action, import `https://www.gysm.io/openapi.json`. Use only `planApp` unless you also want to give the GPT builder users a way to enter their own key. This works today, needs no review, and is the quickest way to test demand.
- App in the ChatGPT app directory: submit the MCP server URL. You will need to verify domain ownership (set `OPENAI_APPS_CHALLENGE` in Vercel to the token OpenAI shows, redeploy, confirm `/.well-known/openai-apps-challenge` returns it), provide privacy/terms/support pages, and a test setup with sample prompts and expected results. Tool annotations are already explicit booleans.
- Known policy friction to check before submitting: the directory restricts what an app may sell or promote. GYSM's tools plan and build pages; they do not take payment in chat. Do not add upsell or "upgrade" language inside tool output. Read the current commerce and advertising rules first.

## 3. The "thirdweb or Shopify-style store builder" angle

`plan_online_store` is the tool for this. It takes a niche, products, currency and a payment route (`stripe`, `thirdweb`, `both`) and returns sections, what the seller sets up in their own payment account, and a compliance checklist. What it does not do, and must never claim:

- GYSM does not run a store backend, inventory, tax or fulfilment. The result is one page with checkout links.
- GYSM never holds keys, wallets, funds or buyer data. Payments are configured in the seller's own Stripe or thirdweb account.
- Crypto checkout has local legal and tax rules. We give a checklist, not advice.
- Do not describe this as a Shopify replacement. Describe it as the fast way to get a branded storefront page that sells through the seller's own checkout.

If you later want deeper Shopify support, the right shape is a separate tool that exports products as a Shopify import CSV, not a claim to replace Shopify.

## Decisions for the owner (not made in code)

1. OAuth for `build_app`: today the caller pastes their API key. A smooth chat experience needs an OAuth flow, which touches auth. Not included on purpose.
2. Referral rewards or free credits for users who arrive from a directory: touches credits and pricing. Not included on purpose.
3. Which public URLs to submit as privacy, terms and support: the site already has `/privacy`, `/terms`, `/support`.
4. A test account for reviewers: create a dedicated one with no MFA and rotate it after review.

## Measure it

Events fired (analytics consent required): `blueprint_example_clicked`, `blueprint_idea_typed`, `blueprint_shown`, `blueprint_cta_clicked`, `usecase_viewed`, `nudge_shown`. Every later event carries first-touch `attr_source`, `attr_medium`, `attr_campaign`, `attr_ref`, `attr_landing`. Build a funnel: `usecase_viewed` or `blueprint_shown` -> `blueprint_cta_clicked` -> sign-up -> first build. Compare by `attr_source`. Judge channels by first builds, not clicks.
