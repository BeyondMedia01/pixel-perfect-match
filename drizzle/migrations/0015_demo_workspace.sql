-- Demo workspace: one sign-in per role, with matters, tasks, dates, inquiries
-- and billing attached to each, and a reset that brings the dates back to
-- "this week". Only meant for a demo database: anyone can use the demo
-- sign-in buttons while it is switched on.

-- One row of settings, readable and writable only by the server.
CREATE TABLE public.demo_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT false,
  password text,
  partner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  lawyer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  paralegal_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  frontdesk_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  refreshed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.demo_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.demo_settings TO service_role;
-- Same for the invoice counter from 0012: the server-side functions use it, nobody reads it directly.
REVOKE ALL ON public.invoice_counters FROM PUBLIC, anon, authenticated;
ALTER TABLE public.demo_settings ENABLE ROW LEVEL SECURITY;

-- Rows the demo creates have ids starting with dddddddd-<kind>, so a reset can
-- replace them without touching anything people added themselves.
--   0001 tasks · 0002 events · 0003 inquiries · 0004 time · 0005 invoices · 0006 announcements
CREATE OR REPLACE FUNCTION public.refresh_demo_data()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare
  s public.demo_settings%rowtype;
  p uuid; l uuid; para uuid; fd uuid;
  today date := current_date;
  t0 timestamptz := date_trunc('day', now());
  yr int := extract(year from current_date)::int;
  n int;
  inv_sent uuid := 'dddddddd-0005-0000-0000-000000000001';
  inv_draft uuid := 'dddddddd-0005-0000-0000-000000000002';
begin
  select * into s from public.demo_settings where id = 1;
  if s.id is null or s.partner_id is null then raise exception 'Demo accounts are not set up'; end if;
  p := s.partner_id; l := s.lawyer_id; para := s.paralegal_id; fd := s.frontdesk_id;
  if not exists (select 1 from public.matters where id = '22222222-0000-0000-0000-000000000001') then
    raise exception 'Demo matters are missing. Load drizzle/seed/demo.sql into the database first.';
  end if;

  -- Roles
  delete from public.user_roles where user_id in (p, l, para, fd);
  insert into public.user_roles (user_id, role) values (p, 'partner'), (l, 'lawyer'), (para, 'paralegal'), (fd, 'frontdesk');
  insert into public.billing_rates (user_id, hourly_rate) values (p, 450), (l, 300), (para, 120)
    on conflict (user_id) do update set hourly_rate = excluded.hourly_rate, updated_at = now();

  -- Who runs which demo matter (only matters nobody else has taken over)
  update public.matters set responsible_lawyer_id = l
    where id in ('22222222-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000004',
                 '22222222-0000-0000-0000-000000000005', '22222222-0000-0000-0000-000000000013', '22222222-0000-0000-0000-000000000015')
      and (responsible_lawyer_id is null or responsible_lawyer_id in (p, l, para));
  update public.matters set responsible_lawyer_id = p
    where id in ('22222222-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000007', '22222222-0000-0000-0000-000000000011',
                 '22222222-0000-0000-0000-000000000012', '22222222-0000-0000-0000-000000000017')
      and (responsible_lawyer_id is null or responsible_lawyer_id in (p, l, para));
  insert into public.matter_assignments (matter_id, user_id) values
    ('22222222-0000-0000-0000-000000000001', para), ('22222222-0000-0000-0000-000000000004', para),
    ('22222222-0000-0000-0000-000000000005', para), ('22222222-0000-0000-0000-000000000009', para),
    -- also assign the demo lawyer, so they keep access if someone else now runs the matter
    ('22222222-0000-0000-0000-000000000001', l), ('22222222-0000-0000-0000-000000000003', l), ('22222222-0000-0000-0000-000000000004', l),
    ('22222222-0000-0000-0000-000000000005', l), ('22222222-0000-0000-0000-000000000013', l), ('22222222-0000-0000-0000-000000000015', l)
    on conflict do nothing;
  -- The paralegal is screened from the protection-order matter, to show ethical walls.
  insert into public.matter_ethical_walls (matter_id, user_id, reason, created_by) values
    ('22222222-0000-0000-0000-000000000011', para, 'Knows the respondent personally', p)
    on conflict (matter_id, user_id) do nothing;

  -- Tasks, due around today
  delete from public.tasks where id::text like 'dddddddd-0001-%';
  insert into public.tasks (id, matter_id, title, description, assignee_id, due_date, priority, status, created_by) values
    ('dddddddd-0001-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'Finalise discovery affidavit', 'Attach the March–June delivery notes.', l, today - 1, 'high', 'in_progress', p),
    ('dddddddd-0001-0000-0000-000000000002', '22222222-0000-0000-0000-000000000004', 'Draft heads of argument', null, l, today, 'urgent', 'in_progress', l),
    ('dddddddd-0001-0000-0000-000000000003', '22222222-0000-0000-0000-000000000005', 'Request social welfare report', 'Follow up with the Department of Social Welfare.', para, today, 'high', 'waiting', l),
    ('dddddddd-0001-0000-0000-000000000004', '22222222-0000-0000-0000-000000000001', 'Index trial bundle', null, para, today + 2, 'medium', 'todo', l),
    ('dddddddd-0001-0000-0000-000000000005', '22222222-0000-0000-0000-000000000003', 'Lodge transfer documents at the Deeds Office', null, para, today + 4, 'medium', 'todo', l),
    ('dddddddd-0001-0000-0000-000000000006', '22222222-0000-0000-0000-000000000002', 'Review audited financials', null, p, today + 3, 'medium', 'todo', p),
    ('dddddddd-0001-0000-0000-000000000007', null, 'Approve new letterhead', null, p, today + 7, 'low', 'todo', p),
    ('dddddddd-0001-0000-0000-000000000008', '22222222-0000-0000-0000-000000000013', 'Obtain hospital theatre records', null, l, today + 5, 'high', 'todo', p),
    ('dddddddd-0001-0000-0000-000000000009', '22222222-0000-0000-0000-000000000004', 'Send client the settlement offer', null, l, today - 3, 'medium', 'done', l);

  -- Dates this week and next
  delete from public.events where id::text like 'dddddddd-0002-%';
  insert into public.events (id, matter_id, title, type, starts_at, ends_at, location, owner_id, entered_by, confirmed_by) values
    ('dddddddd-0002-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'Pre-trial conference', 'court_date', t0 + interval '1 day 9 hours', null, 'High Court, Harare, Court 4', l, para, l),
    ('dddddddd-0002-0000-0000-000000000002', '22222222-0000-0000-0000-000000000004', 'File heads of argument', 'filing_deadline', t0 + interval '2 days 16 hours', null, 'Labour Court, Bulawayo', para, para, null),
    ('dddddddd-0002-0000-0000-000000000003', '22222222-0000-0000-0000-000000000005', 'Custody hearing', 'hearing', t0 + interval '3 days 10 hours', t0 + interval '3 days 12 hours', 'High Court, Chamber 2', l, l, null),
    ('dddddddd-0002-0000-0000-000000000004', '22222222-0000-0000-0000-000000000013', 'Plea deadline', 'filing_deadline', t0 + interval '6 days 16 hours', null, null, l, l, l),
    ('dddddddd-0002-0000-0000-000000000005', '22222222-0000-0000-0000-000000000002', 'Due diligence meeting with sellers', 'meeting', t0 + interval '2 days 11 hours', t0 + interval '2 days 12 hours 30 minutes', 'Our boardroom', p, p, null),
    ('dddddddd-0002-0000-0000-000000000006', null, 'Partners'' meeting', 'meeting', t0 + interval '4 days 8 hours', t0 + interval '4 days 9 hours', 'Boardroom', p, p, null),
    ('dddddddd-0002-0000-0000-000000000007', '22222222-0000-0000-0000-000000000007', 'Trial — day 1', 'court_date', t0 + interval '8 days 9 hours', null, 'Magistrates Court, Bulawayo', p, p, p),
    ('dddddddd-0002-0000-0000-000000000008', '22222222-0000-0000-0000-000000000003', 'Signing with the seller', 'meeting', t0 + interval '9 hours 30 minutes', t0 + interval '10 hours 30 minutes', 'Our boardroom', l, l, null);

  -- Inquiries: a fresh walk-in, a booked consultation, and one with a conflict
  delete from public.inquiries where id::text like 'dddddddd-0003-%';
  insert into public.inquiries (id, received_at, logged_by, name, contact, practice_area, opposing_party, related_names, summary, status, consult_with) values
    ('dddddddd-0003-0000-0000-000000000001', now() - interval '2 hours', fd, 'Tatenda Mapfumo', 'tatenda.mapfumo@gmail.com · +263 77 245 8810', 'labour', 'Chitungwiza Municipality', null,
     'Dismissed after 11 years without a hearing. Wants to know whether to challenge the dismissal.', 'new', null),
    ('dddddddd-0003-0000-0000-000000000002', now() - interval '1 day', fd, 'Kudzai Mlambo', '+263 71 300 4471', 'conveyancing', 'Seller: P. Nyamande', null,
     'Buying a house in Mount Pleasant and needs the transfer done.', 'consult', l),
    ('dddddddd-0003-0000-0000-000000000003', now() - interval '3 hours', fd, 'Sable Mining (Pvt) Ltd', 'legal@sablemining.co.zw', 'litigation', 'Mhondoro Holdings', null,
     'Wants us to defend a claim brought by Mhondoro Holdings.', 'new', null);
  insert into public.events (id, inquiry_id, title, type, starts_at, ends_at, location, owner_id, entered_by) values
    ('dddddddd-0002-0000-0000-000000000009', 'dddddddd-0003-0000-0000-000000000002', 'Consultation: Kudzai Mlambo', 'meeting',
     t0 + interval '1 day 14 hours', t0 + interval '1 day 15 hours', 'Our boardroom', fd, fd);
  update public.inquiries set consult_event_id = 'dddddddd-0002-0000-0000-000000000009' where id = 'dddddddd-0003-0000-0000-000000000002';

  -- Time and invoices on the Sable Mining matter
  delete from public.invoices where id in (inv_sent, inv_draft);
  delete from public.time_entries where id::text like 'dddddddd-0004-%';
  insert into public.time_entries (id, matter_id, user_id, entry_date, description, hours, hourly_rate, billable) values
    ('dddddddd-0004-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', l, today - 20, 'Consultation with client and review of supply contract', 2.0, 300, true),
    ('dddddddd-0004-0000-0000-000000000002', '22222222-0000-0000-0000-000000000001', l, today - 18, 'Letter of demand to Sable Mining', 1.5, 300, true),
    ('dddddddd-0004-0000-0000-000000000003', '22222222-0000-0000-0000-000000000001', para, today - 9, 'Collating delivery notes', 3.0, 120, true),
    ('dddddddd-0004-0000-0000-000000000004', '22222222-0000-0000-0000-000000000001', l, today - 6, 'Drafting discovery affidavit', 3.5, 300, true),
    ('dddddddd-0004-0000-0000-000000000005', '22222222-0000-0000-0000-000000000001', l, today - 2, 'Internal strategy meeting', 1.0, 0, false),
    ('dddddddd-0004-0000-0000-000000000006', '22222222-0000-0000-0000-000000000004', l, today - 4, 'Research on unfair dismissal remedies', 2.5, 300, true),
    ('dddddddd-0004-0000-0000-000000000007', '22222222-0000-0000-0000-000000000005', para, today - 1, 'Preparing custody bundle', 2.0, 120, true);

  insert into public.invoice_counters as c (year, last_number)
    values (yr, coalesce((select max(split_part(invoice_number, '-', 3)::int) from public.invoices where invoice_number ~ ('^INV-' || yr || '-[0-9]+$')), 0) + 1)
    on conflict (year) do update set last_number = c.last_number + 1 returning last_number into n;
  insert into public.invoices (id, invoice_number, matter_id, client_id, status, issue_date, due_date, created_by)
    values (inv_sent, 'INV-' || yr || '-' || lpad(n::text, 4, '0'), '22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'sent', today - 15, today + 15, p);
  insert into public.invoice_items (invoice_id, description, quantity, unit_price)
    select inv_sent, t.description || ' (' || to_char(t.entry_date, 'FMDD Mon YYYY') || ')', t.hours, t.hourly_rate
    from public.time_entries t where t.id in ('dddddddd-0004-0000-0000-000000000001', 'dddddddd-0004-0000-0000-000000000002');
  update public.time_entries set invoice_id = inv_sent where id in ('dddddddd-0004-0000-0000-000000000001', 'dddddddd-0004-0000-0000-000000000002');

  -- A firm notice
  delete from public.announcements where id::text like 'dddddddd-0006-%';
  insert into public.announcements (id, title, body, created_by, created_at) values
    ('dddddddd-0006-0000-0000-000000000001', 'High Court registry closes early on Friday',
     'The registry closes at 12:00 this Friday. File anything due that day by Thursday afternoon.', p, now() - interval '5 hours');

  -- Unread alerts again for everyone in the demo
  delete from public.notification_dismissals where user_id in (p, l, para, fd);
  update public.demo_settings set refreshed_at = now(), updated_at = now() where id = 1;
end; $$;

REVOKE EXECUTE ON FUNCTION public.refresh_demo_data() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_demo_data() TO service_role;
