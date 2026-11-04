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
- Staff notifications derive from RLS-scoped live inquiries, own due-today tasks, and unconfirmed deadlines; per-user read receipts persist separately so workflow records are not changed by reading alerts.
- Notification preferences store each channel independently; only existing category columns filter the bell. Channel status comes from a staff-authenticated server function and must remain unavailable until a real sending path exists, not merely a linked credential.
- Access rules (RLS) are covered by `drizzle/tests/rls.test.sql`. After changing a policy or migration, run `npm run test:rls` against a local Postgres (see the script header) and add a check for the new rule.
- Calendar subscriptions are served by `src/routes/api/calendar.$token.ts`; what a feed contains is decided in SQL by `calendar_feed()` (service role only). Keep `src/lib/ics.ts` the single place that writes iCalendar.
- Demo workspace: rows created by `refresh_demo_data()` have ids starting `dddddddd-`; a reset replaces only those. Demo accounts and their shared password live in `demo_settings` (service role only); `src/lib/demo.functions.ts` is the only code that touches them. Demo mode is for demo databases only.
