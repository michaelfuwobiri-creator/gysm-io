# VOIIE setup checklist (written 2026-11-08)

## 1. Email deliverability (Resend) -- NOT DONE as of 2026-11-08
DNS check of gysm.io on 2026-11-08: no `resend._domainkey` TXT record exists, and the root SPF
(`v=spf1 include:secureserver.net -all`) only authorises GoDaddy mail. So Resend cannot be sending
as info@gysm.io yet (Resend requires a verified domain). DMARC exists (`p=quarantine`), which means
unauthenticated mail claiming gysm.io will be quarantined -- do this BEFORE any real send.

1. resend.com -> Domains -> Add `gysm.io` (pick the region closest to you).
2. Easiest: click "Auto configure" and authorise GoDaddy. Manual: add exactly the records shown on
   the Records tab at GoDaddy (names `resend._domainkey` and `send`, without `.gysm.io`):
   DKIM TXT on `resend._domainkey`, MX on `send` (priority 10), SPF TXT on `send`.
   Do NOT edit the root SPF record. Note: the wildcard `*.gysm.io` CNAME to Vercel does not
   block records that exist at `send`/`resend._domainkey`; remove any CNAME sitting on `send`.
3. Click Verify; usually minutes, up to 72h.
4. Vercel -> Settings -> Environment Variables (Production): set `VOIIE_POSTAL_ADDRESS`
   to a real mailing address (CAN-SPAM requires it; the code now refuses to email real prospects without it).
5. Send a test to yourself, check Gmail "Show original": SPF/DKIM/DMARC must all say PASS.

## 2. Safe defaults now in code
- Cold email autopilot only for regions in `VOIIE_COLD_EMAIL_REGIONS` (default `US`). Italy/EU/UK leads are
  never auto-emailed (Italian art.130 + ePrivacy art.13 are opt-in; sources conflict even on info@ addresses;
  Germany is opt-in even B2B). Ask an Italian privacy lawyer before adding `IT`.
- Weak-site mode (`VOIIE_WEAK_SITE_MODE=off` disables) reads the public contact email from the business's own
  website, only for allowed regions, only if robots.txt allows, and only when the site looks weak.
- Autopilot skips cold sends if `VOIIE_POSTAL_ADDRESS` is unset. `VOIIE_AUTOSEND_DAILY_CAP` is still OFF.
- Every cold email has: honest subject, AI-assistant disclosure, why-you-got-this line, postal address,
  one-click unsubscribe (link + List-Unsubscribe headers).
- WhatsApp: STOP/Basta/Annulla/Unsubscribe now opts the lead out (before, STOP was fed into the intake
  form as an answer). Cold WhatsApp is blocked in code: Meta requires opt-in before any business-initiated
  message, so VOIIE only messages numbers that have written to us first.
- Twitter/Threads hunting is off unless `VOIIE_SOCIAL_HUNT=1` (X search returns 402 every run).
- Autopilot cron moved to 15:17 UTC weekdays (10-11am US Eastern) instead of 09:17 UTC (middle of the US night).

## 3. WhatsApp template (Twilio Content Template Builder)
Twilio Console -> Messaging -> Content Template Builder -> Create -> WhatsApp, language English, type Text.
Name: `voiie_demo_ready`   Category: Utility (Meta may reclassify to Marketing; that is fine)
Body:

    Hello, your free website demo for {{1}} is ready. You can view it here: {{2}} Reply to this message if you would like any changes, or reply STOP to stop receiving messages.

Samples: {{1}} = `Joe's Plumbing`, {{2}} = `https://www.gysm.io/publish/abc123`.
Submit for WhatsApp approval (usually minutes to a day). Then set `TWILIO_DEMO_TEMPLATE_SID` (the HX... id) in Vercel.
The code already fills `{{1}}` = business name and `{{2}}` = demo link. Templates cannot be edited after
submission, so create a new one for wording changes. Rules that cause rejection: variables must be sequential and
not adjacent, must not start/end the body, need >= 2x+1 plain words per x variables.
Only usable for numbers that have opted in (filled the form with their phone / messaged you).

## 4. Move VOIIE ownership to the info@gysm.io account
1. Sign in to gysm.io as info@gysm.io, then Clerk dashboard -> Users -> that user -> copy the `user_...` id.
2. In Neon SQL editor, replace NEW_ID / OLD_ID and run:

```sql
-- who owns what today
select owner_user_id, count(*) from voiie_leads group by 1;
-- must return 0 rows, otherwise handles collide:
select o.handle from voiie_leads o join voiie_leads n
  on n.owner_user_id = 'NEW_ID' and n.platform = o.platform and lower(n.handle) = lower(o.handle)
where o.owner_user_id = 'OLD_ID';

begin;
update voiie_leads     set owner_user_id = 'NEW_ID' where owner_user_id = 'OLD_ID';
update voiie_customers set owner_user_id = 'NEW_ID' where owner_user_id = 'OLD_ID';
delete from voiie_settings where owner_user_id = 'NEW_ID';
update voiie_settings  set owner_user_id = 'NEW_ID' where owner_user_id = 'OLD_ID';
update projects set user_id = 'NEW_ID'
  where id in (select demo_project_id from voiie_leads
               where owner_user_id = 'NEW_ID' and demo_project_id is not null
                 and status not in ('paid','converted','deployed'));
commit;
```
3. Vercel -> Environment Variables -> `VOIIE_OWNER_USER_ID` = NEW_ID (Production) -> redeploy.
Until both are done, anything you do while signed in as a different account is invisible to the autopilot.

## 5. Places data caveat
Google's Maps Platform policies restrict caching/storing Places content (only place_id may be stored indefinitely;
lat/lng 30 days) and say not to export or scrape it for use outside the service. VOIIE stores names/phones from
Places. Get a read of the Service Specific Terms (cloud.google.com/maps-platform/terms/maps-service-terms) before scaling.

## Reply inbox (email replies in the dashboard)

Until this is set up, replies keep going to info@gysm.io and the inbox page (/voiie/inbox) only shows WhatsApp replies. Steps, in this order:

1. Resend -> Domains -> gysm.io -> enable **Receiving**. Use a subdomain (e.g. `reply.gysm.io`) so your normal mail on gysm.io is untouched: add the MX record Resend shows for that subdomain at GoDaddy (name `reply`) and wait for "verified".
2. Resend -> Webhooks -> Add: URL `https://www.gysm.io/api/voiie/webhooks/email`, event `email.received`. Copy its signing secret.
3. Vercel env (Production): `RESEND_WEBHOOK_SECRET` = that signing secret, then `VOIIE_REPLY_DOMAIN` = `reply.gysm.io`. Redeploy. Set VOIIE_REPLY_DOMAIN last: from then on every email's Reply-To is `r-<leadId>@reply.gysm.io`.
4. Test: email yourself a lead from the queue, reply from Gmail, and the reply should appear in /voiie/inbox within a minute and the lead flips to "replied" (the autopilot stops following up on it).

Replies are sent only when you press Send. Suggested replies are templates, not auto-sent. A reply that says stop/unsubscribe marks the lead do-not-contact.

## Round-the-clock hunting

`VOIIE_HUNT_ROTATE=1` makes /api/voiie/cron/hunt sweep the next `VOIIE_HUNT_QUERIES_PER_RUN` (default 3) "trade in US town" searches from lib/voiie/hunt-rotation.ts, email-only. Vercel's own cron is daily, so `.github/workflows/voiie-hunt.yml` calls it hourly: add a GitHub repo secret `CRON_SECRET` with the same value as the Vercel env var. It stops on its own at the daily lead cap (Settings -> daily_hunt_limit) or the kill switch. Each search is billed by Google Places.
