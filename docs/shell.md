# GYSM Shell (beta)

An AI-first cloud terminal at `/shell`. Users describe what they want; Claude runs the commands in the user's own sandboxed Linux workspace and explains each step. Users can also type commands themselves, with an **Explain** button on every command.

Because the iOS app loads the live site (`capacitor.config.ts`), Shell works in the app with no native changes.

## How it works

| Piece | File |
| --- | --- |
| Page + UI (mobile-first chat + terminal) | `app/shell/page.tsx`, `app/shell/ShellClient.tsx` |
| Agent turn (streams NDJSON events) | `app/api/shell/agent/route.ts` → `lib/shell/agent.ts` |
| Manual command | `app/api/shell/exec/route.ts` |
| Explain a command | `app/api/shell/explain/route.ts` |
| Upload / download (4 MB cap) | `app/api/shell/files/route.ts` |
| Sandbox per user | `lib/shell/sandbox.ts` |
| Pricing knobs | `lib/credits-constants.ts` (`SHELL_*`) |

- **Compute:** one persistent, named [Vercel Sandbox](https://vercel.com/docs/vercel-sandbox) (Firecracker microVM) per user, named `gysm-shell-<hash of user id>`. Files in `~/workspace` survive between visits; the VM hibernates when idle and resumes on the next command. Nothing runs on GYSM's own servers.
- **Modes:** *Guide me* asks before every command. *Do it for me* runs commands on its own and only asks before ones the model flags as risky.
- **History:** the conversation lives in the browser (localStorage) and is sent back each turn. There is no new DB table and no migration.
- **Billing:** AI calls are metered from Claude's real token usage at the same USD-per-credit rate as builds (`shellCreditsForUsage`). Each executed command costs `SHELL_CREDITS_PER_COMMAND` (5, a placeholder). An AI turn needs at least `SHELL_MIN_BALANCE_FOR_AI` (100) credits to start.

## Setup

1. **Enable Vercel Sandbox** on the `gysm` project. In production the SDK authenticates with the deployment's OIDC token automatically, so no keys are needed.
2. `ANTHROPIC_API_KEY` must be set. It already is, for the Claude build tier.
3. Optional env vars:
   - `SHELL_SANDBOX_TIMEOUT_MS`: how long a session stays up (default 30 min; Hobby max 45 min).
   - `SHELL_SANDBOX_VCPUS`: default 2.
4. **Local dev:** run `vercel link`, then `vercel env pull` to get a `VERCEL_OIDC_TOKEN`. It expires after 12 hours.

## Known limits / next steps

- No interactive programs (vim, top, a bare `python` prompt). Commands time out after 90 seconds.
- 4 MB upload/download cap (Vercel function body limit). For bigger files, use signed Blob URLs.
- Download links may not save files inside the iOS app's WebView. If that's a problem, use the Capacitor Filesystem/Share plugin.
- Sandboxes have full internet access by default. Watch for abuse; `networkPolicy` in `getUserSandbox` can restrict it.
- Check real Sandbox + Claude costs after a week, then tune the `SHELL_*` constants.
