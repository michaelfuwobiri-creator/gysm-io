# Listing GYSM's MCP server in AI-tool directories

Server URL: `https://www.gysm.io/api/mcp` (Streamable HTTP, stateless JSON).
No sign-in for planning, plans and shopping tools; an optional
`Authorization: Bearer gysm_live_...` header (the user's own key from
gysm.io/settings/api-keys) unlocks building, subscribing and running a store.

Directory rules change often: check each submit page before you submit.

## Copy for every listing

**Name:** GYSM App and Store Builder

**Short description (under 100 characters):**
Plan and build web apps and online stores from plain English, and shop GYSM stores.

**Long description:**
GYSM turns a plain-English idea into a working site, app or online store.
Without sign-in, assistants can plan an app or store (sections, features, data,
integrations, honest limits), compare AI app builders with sourced pricing, list
GYSM's plans, and help shoppers find stores built on GYSM, read their catalogue
and get a Stripe checkout link the shopper pays on. With the user's own GYSM API
key, assistants can build the app in the user's account, return a Stripe link to
subscribe, check plan usage, and create and run the user's online store:
products, appointments with opening hours, shipping rates, a link to connect the
seller's own Stripe account, opening the store, and reading orders and bookings.
Assistants never pay or enter card details: every payment happens on Stripe's
page. Tools that take secret keys, spend money or delete stay in the GYSM
builder, where the user approves each step.

**Categories / tags:** app builder, no-code, website builder, online store,
e-commerce, bookings, Stripe, productivity

**Example prompts:**
1. "Plan an online store for my handmade candles with Stripe checkout."
2. "Find a GYSM shop that sells coffee beans and show me what they have."
3. "Create a store called Mia's Bakery, add a sourdough loaf at 6 euros, and give me the link to connect Stripe." (needs the user's API key)
4. "Add a 45-minute haircut for 25 euros, open Monday to Friday 9 to 18." (needs the user's API key)
5. "Compare GYSM with Lovable and Bolt on price."

**Links:** website https://www.gysm.io · privacy https://www.gysm.io/privacy ·
terms https://www.gysm.io/terms · support https://www.gysm.io/support ·
docs for agents https://www.gysm.io/llms.txt

## 1. Official MCP Registry (registry.modelcontextprotocol.io)

`server.json` at the repo root is ready, using the GitHub namespace
`io.github.michaelfuwobiri-creator/gysm` (no domain verification needed).

1. Download `mcp-publisher` for Windows from
   https://github.com/modelcontextprotocol/registry/releases (or `brew install mcp-publisher` on a Mac).
2. In the repo folder: `mcp-publisher validate`
3. `mcp-publisher login github` (opens GitHub in the browser; sign in as michaelfuwobiri-creator).
4. `mcp-publisher publish`
5. Check: https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.michaelfuwobiri-creator/gysm

When the tools change, bump `version` in `server.json` (and `SERVER_VERSION` in
`lib/mcp/server.ts`) and publish again. Many other directories read from this
registry, so this one matters most.

## 2. Smithery (smithery.ai)

1. Sign in at https://smithery.ai and open https://smithery.ai/new
2. Paste `https://www.gysm.io/api/mcp` and finish the flow, using the copy above.
3. Smithery scans the server. If the scan fails with 403, a firewall is blocking
   the `SmitheryBot/1.0` user agent: allow it in Vercel's firewall.

## 3. Glama, mcp.so, PulseMCP, mcpservers.org

Each has its own "add server" or "submit" page, usually behind a GitHub sign-in.
Submit the server URL and the copy above. Glama and PulseMCP also pick up servers
from the official registry, so publish there first. Where a GitHub repo is
required, use the public repo `michaelfuwobiri-creator/gysm-claude-plugin`.

## 4. Claude and ChatGPT

See `README.md` in this folder (connectors directory, Claude plugin, ChatGPT
app directory and custom GPT).
