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

## Client communications
- [ ] Email and automated WhatsApp delivery — awaiting recipient scope, email sending setup, and WhatsApp Business connection.
