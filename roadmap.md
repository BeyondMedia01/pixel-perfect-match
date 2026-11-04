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
- [x] Reports: work in progress, money owed by age, billing, time by person, open matters by area and lawyer, intake conversion, upcoming deadlines.

## Notifications and public intake
- [x] Per-person, per-alert in-app/email/WhatsApp preferences with explicit disconnected channel states, covering inquiries, assigned and due tasks, upcoming court dates and hearings, unconfirmed deadlines and announcements, plus a WhatsApp number; saved choices and bell filtering verified.
- [x] Staff bell: new inquiries, own tasks due today, deadlines awaiting confirmation; dismiss and refresh.
- [x] Public client intake: validated, rate-limited submissions saved into Inquiries; shareable link.
- [x] Verify public submission and signed-in staff alerts end-to-end.
- [ ] Owner intake emails — no verified sender domain; after verification, request owner emails to enable sending.

## Client communications
- [ ] Email and automated WhatsApp delivery for individual case updates and group announcements — email service connection declined; awaiting the user's sending-service choice and WhatsApp Business connection.

## Team, tasks and calendar
- [x] Team page: invite by email with a role (Supabase invitation email, or a one-time invitation link to send yourself), change roles, remove access, hourly rates.
- [x] Invite-only access and onboarding: no public sign-up; the platform invites a firm's managing partner; invited people choose a password, enter their details and, as a partner, the firm details used on invoices (/welcome).
- [x] Many firms in one Acta, walled off from each other; platform dashboard for Revixions: firms, plans (tiers with user limits), trials, manual invoicing and payment recording, suspension; partners see their subscription and Acta invoices.
- [ ] Online subscription payments (Paynow / card) and automatic renewal invoices.
- [x] Tasks: create, assign to any staff member, edit, delete; on the Tasks page and each matter's Tasks tab. Walls respected.
- [x] Calendar: month and list views, create/edit/delete events, deadline confirmation enforced in the database.
- [x] Calendar sync: private subscription link per person for Google, Outlook and Apple Calendar; "Add to calendar" for single events (Google, Outlook, .ics).
- [x] Two-way calendar sync with Google and Microsoft (code done; needs the app registrations and secrets in docs/calendar-sync-setup.md before anyone can connect).

## Demo readiness
- [x] Demo workspace (Settings → Demo workspace): partner, lawyer, paralegal and front-desk sign-ins with their own matters, tasks, deadlines, inquiries, time and invoices; one-click reset to this week; sign-in buttons on the sign-in page while it's on.
- [x] Forgot password (reset email + /reset-password) and change password in Settings.
- [x] Edit matter details and client records.
- [x] Firm profile (Settings): name, logo, contact and invoice details, VAT rate. Shown on invoices, the intake form and the sidebar.
- [x] Invoice page with letterhead, VAT and payment details; print or save as PDF.
- [x] Landing page copy no longer promises a client portal.
- [ ] Client portal.
- [ ] Payment dates on invoices (reports use the issue date for "paid").
