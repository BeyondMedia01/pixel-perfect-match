<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Public client intake uses a validated server function and a service-role-only atomic database function for durable rate limiting and linked submission/inquiry inserts; anonymous visitors must never access inquiry records.
- Staff notifications derive from RLS-scoped live data: new inquiries, tasks a colleague assigned you in the last 7 days, own due-today tasks, court dates and hearings starting within 24 hours, unconfirmed deadlines, and colleagues' announcements from the last 14 days. Alert types are defined once in `ALERT_CATEGORIES` (`src/lib/notifications.ts`); a new type needs in-app, `email_` and `whatsapp_` columns. Per-user read receipts persist separately so workflow records are not changed by reading alerts.
- Notification preferences store each channel independently, plus an optional `whatsapp_number` (E.164, checked in the database, readable only by its owner); only the in-app columns filter the bell. Channel status comes from a staff-authenticated server function and must remain unavailable until a real sending path exists, not merely a linked credential.
- Access rules (RLS) are covered by `drizzle/tests/rls.test.sql`. After changing a policy or migration, run `npm run test:rls` against a local Postgres (see the script header) and add a check for the new rule.
- Calendar subscriptions are served by `src/routes/api/calendar.$token.ts`; what a feed contains is decided in SQL by `calendar_feed()` (service role only). Keep `src/lib/ics.ts` the single place that writes iCalendar.
- Demo workspace: rows created by `refresh_demo_data()` have ids starting `dddddddd-`; a reset replaces only those. Demo accounts and their shared password live in `demo_settings` (service role only); `src/lib/demo.functions.ts` is the only code that touches them. Demo mode is for demo databases only.
- Two-way calendar sync lives in `src/lib/calendar-sync/` (provider clients, sync engine, database store) with tests in `src/test/calendar-sync.test.ts`. Its rules are in the engine header and docs/calendar-sync-setup.md; court dates, hearings and filing deadlines are never changed from a calendar app. OAuth tokens live in `calendar_connections`, which only the service role can read.
- Access is invite-only. Roles come only from `team_invitations` (handle_new_user); there is no first-sign-up-becomes-partner rule. A new workspace's managing partner is invited through `/platform/invite`, guarded by the `ACTA_PLATFORM_KEY` secret (at least 24 characters; unset means switched off) and `platform_invite_owner()` (service role only).
- New accounts have `profiles.onboarded_at` null and are sent to `/welcome` by the `_authenticated` route until `complete_onboarding()` runs. Invited people choose a password there first. Demo accounts are marked onboarded by the demo set-up. Invitation emails and links redirect to `/welcome`; one-time links come from `invitations.server.ts` (service role) and are only handed to partners.

