# Roadmap

## Makoni & Partners reference build
- [x] DB: roles (partner/lawyer/paralegal/frontdesk), inquiries, ethical walls, deadline confirm fields, conflict_check update, conflict_check_count
- [x] Seed demo data (3 inquiries, 1 ethical wall)
- [x] Role labels + useMe role resolution (legal.ts, auth.ts)
- [x] Inquiries: list + detail pages, log dialog with live conflict check, book consultation, accept → client + matter, decline, partner sign-off
- [x] Deadline confirmation: add deadline dialog, lawyer confirm, mark filed (matter page + calendar)
- [x] Ethical walls: Settings management (partner), matter overview note, nav/search
- [x] Tasks page: overdue/today/upcoming/done groups, mine/all toggle
- [x] Calendar page: day groups, type filter, deadline status
- [x] Design: Cormorant Garamond + Inter fonts (brass accent already in tokens)
- [x] End-to-end browser verification (inquiries, accept→matter, deadline confirm, walls, tasks, calendar)

## Billing
- [x] DB: time_entries, invoices, invoice_items, invoice numbering, RLS (own entries, partner manages invoices)
- [x] Matter Time & Billing tab: log time, unbilled summary, create invoice from unbilled entries, invoice status
- [x] Billing page: unbilled / outstanding / paid-this-month cards, invoice list, recent time entries
- [x] End-to-end browser verification (log time, create invoice, no console errors)

## Later
- [ ] Reports

## Notifications and public intake
- [x] Staff bell: new inquiries, own tasks due today, deadlines awaiting confirmation; dismiss and refresh.
- [x] Public client intake: validated, rate-limited submissions saved into Inquiries; shareable link.
- [x] Verify public submission and signed-in staff alerts end-to-end.
- [ ] Owner intake emails — no verified sender domain; after verification, request owner emails to enable sending.

## Client communications
- [ ] Email and automated WhatsApp delivery for individual case updates and group announcements — email service connection declined; awaiting the user's sending-service choice and WhatsApp Business connection.

## Team, tasks and calendar
- [x] Team page: invite by email with a role (Supabase invitation email, or a sign-up link), approve sign-ups, change roles, remove access, hourly rates.
- [x] Tasks: create, assign to any staff member, edit, delete; on the Tasks page and each matter's Tasks tab. Walls respected.
- [x] Calendar: month and list views, create/edit/delete events, deadline confirmation enforced in the database.
- [x] Calendar sync: private subscription link per person for Google, Outlook and Apple Calendar; "Add to calendar" for single events (Google, Outlook, .ics).
- [ ] Two-way calendar sync (would need Google and Microsoft app registrations).

