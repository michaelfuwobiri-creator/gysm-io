# Intel backlog

Medium projects found by the daily intel run. Each is scoped but not built. Effort is a rough guess.

| ID | Idea | Scope | Effort | Risk | Added | Notes |
|----|------|-------|--------|------|-------|-------|
| B1 | Refresh rival facts on the comparison pages | Re-read each rival's official pricing page, update `lib/comparisons.ts` facts and bump `CHECKED_ON` (currently 7 October 2026) | 1 to 2 hours | Low | 2026-11-11 | Do not add a claim not seen on a source page |
| B2 | Safeguards for Agent image generation (App Store 1.2, AI intimate imagery) | Prompt screening and refusal in the `generate_image` tool, report path for generated images, terms wording | 1 to 2 days | Medium (touches policy and a billed tool) | 2026-11-11 | Source: Apple news 2026-10-16. Needs owner decision |
| B3 | Security scan for AI use inside generated apps | Extend `review_site` / secret scan to flag prompts built from user input and client-side AI keys | 2 to 3 days | Low | 2026-11-11 | Parity idea from Base44 changelog 2026-11-09 |
| B4 | Managed or one-click backend for generated sites | Today users connect their own Supabase. Option: guided project creation plus auth template via `setup_user_profiles` | 1 to 2 weeks | High (auth, data) | 2026-11-11 | Base44 now offers backend functions on Free (2026-11-11). Needs owner decision |
| B5 | Evaluate Fable 5.2 for the Agent | Compare quality and cost on 10 fixed Agent tasks | 0.5 day plus model cost mapping | Medium (touches `lib/credits-constants.ts`) | 2026-11-11 | Verify against Anthropic's own release post first. Needs owner decision |
| B6 | Restore GitHub sync in the Agent | Reconnect `app/api/github/*` to an Agent panel; today only the API routes exist | 2 to 3 days | Medium (stored tokens) | 2026-11-11 | Comparison pages now say no GitHub sync in the interface |
