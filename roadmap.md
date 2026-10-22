# Roadmap — adopt Makoni & Partners demo as design/features reference

Decisions: build all four features; adopt demo roles (partner, lawyer, paralegal, frontdesk); keep current app name.

- [ ] DB: add partner/paralegal/frontdesk roles, backfill admin→partner, staff→paralegal; helpers (partner = admin-equivalent; frontdesk limited)
- [ ] DB: inquiries table + RLS + history via activity_log
- [ ] DB: ethical walls table; can_access_matter excludes walled users (incl. partners)
- [ ] DB: deadline confirmation (events.entered_by/confirmed_by/filed_at, inquiry consultations)
- [ ] UI: Inquiries list + detail (log, conflict check, book consult, accept→matter, decline, partner sign-off)
- [ ] UI: deadline confirmation workflow on matter Deadlines tab
- [ ] UI: ethical walls in Settings + matter overview note
- [ ] UI: full Tasks page (overdue/today/upcoming/done, mine/all) and Calendar page (day groups)
- [ ] Design: brass accent, Cormorant Garamond headings
- [ ] Verify in browser end-to-end
