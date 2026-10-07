# Multi-file builds and user-app isolation

## Turning multi-file builds on

1. Run `db/migrations/0026_project_files.sql` against the Neon database (safe to re-run; purely additive).
2. Deploy. Until the migration is applied, the Multi-file toggle returns a clear error before any credits are used, and single-file builds are unaffected.

## Isolating user-built apps (recommended before promoting multi-file)

Generated apps are arbitrary JavaScript. On the `www.gysm.io` origin they could call GYSM's signed-in APIs as the viewer.

1. Add a second hostname that is NOT a subdomain of `gysm.io` to the same Vercel project (for example an extra `*.vercel.app` alias; `vercel.app` hosts are separate sites, so cookies are not shared).
2. Set `USER_CONTENT_ORIGIN=https://<that host>` in Vercel environment variables and redeploy.

Effects when set: published pages load apps from `<origin>/a/<project id>/`; `middleware.ts` answers only `/a/*` on that host (404 for everything else, no Clerk, no APIs); the main site's `/a/*` route returns 404.

When not set: `/a/*` is served with `Content-Security-Policy: sandbox ...` without `allow-same-origin`, so apps run in an opaque origin (localStorage unavailable). Single-file published pages keep the old `srcDoc` frame until the variable is set.

The builder preview no longer uses `allow-same-origin`; storage APIs are replaced by in-memory stand-ins while previewing (`lib/userContent.ts`).

## Files

- `lib/projectFilesCore.ts`: path rules, size caps, file-block parser, link check (pure, tested).
- `lib/projectFiles.ts`: database access. `projects.html` stays the canonical `index.html`; extra files live in `project_files`.
- `lib/ai/multiFile.ts`: multi-file generation and edits (one model call, one bounded repair call).
- `app/a/[id]/[[...path]]/route.ts`: serves files at real URLs.
- `app/api/projects/[id]/files/route.ts`: read and save from the code editor (free, no credits).
