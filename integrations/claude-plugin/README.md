# GYSM plugin for Claude

Connects Claude to the GYSM MCP server so it can plan, and on request build, web apps and online stores from plain English.

- Server: `https://www.gysm.io/api/mcp` (Streamable HTTP, stateless, no sign-in for the planning tools)
- Tools: `plan_app`, `plan_online_store`, `list_use_cases`, `compare_ai_app_builders`, `get_build_link` (all read-only), and `build_app` (needs the caller's own GYSM API key; uses that account's credits)
- Skill: `plan-and-build-with-gysm` tells Claude when to plan, when to build and what never to claim.

## Install (Claude Code)

```
/plugin marketplace add michaelfuwobiri-creator/gysm-claude-plugin
/plugin install gysm@gysm-claude-plugin
```

or just add the server: `claude mcp add --transport http gysm https://www.gysm.io/api/mcp`

## Use `build_app`

Create a key at https://www.gysm.io/settings/api-keys and send it as `Authorization: Bearer gysm_live_...` when adding the connector. Without a key the tool builds nothing and returns a link instead.

## Publishing status

This folder is mirrored in the public repo https://github.com/michaelfuwobiri-creator/gysm-claude-plugin, which is what `/plugin marketplace add` installs from. Keep the two in sync when either changes. The next step is the Claude connectors directory submission (see docs/ecosystem/README.md); re-check the current requirements there before submitting.
