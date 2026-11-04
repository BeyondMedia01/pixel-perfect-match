-- Access-rule tests: signs in as each role and checks what they can see and do.
-- Run with drizzle/tests/run-rls-tests.sh. Any failed check stops the run.
\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

create schema tests;
grant usage on schema tests to anon, authenticated;
create function tests.login(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', coalesce(u, ''), false) $$;
create function tests.ok(name text, passed boolean) returns text language plpgsql as $$
begin
  if passed is not true then raise exception 'FAIL: %', name; end if;
  return 'ok   ' || name;
end $$;
-- true when the statement errors or changes nothing
create function tests.refused(stmt text) returns boolean language plpgsql as $$
declare n int;
begin
  execute stmt; get diagnostics n = row_count; return n = 0;
exception when others then return true;
end $$;
grant execute on all functions in schema tests to anon, authenticated;

\set P 'aaaaaaaa-0000-0000-0000-000000000001'
\set L 'aaaaaaaa-0000-0000-0000-000000000002'
\set A 'aaaaaaaa-0000-0000-0000-000000000003'
\set F 'aaaaaaaa-0000-0000-0000-000000000004'
\set X 'aaaaaaaa-0000-0000-0000-000000000005'
-- seeded demo data
\set M1  '22222222-0000-0000-0000-000000000001'
\set M5  '22222222-0000-0000-0000-000000000005'
\set M11 '22222222-0000-0000-0000-000000000011'
\set C1  '11111111-0000-0000-0000-000000000001'
\set C4  '11111111-0000-0000-0000-000000000004'
\set C10 '11111111-0000-0000-0000-000000000010'

\set FIRM1 '00000000-0000-4000-8000-0000000000f1'

-- ===== Sign-up and invitations =====
insert into auth.users(id, email) values ('aaaaaaaa-0000-0000-0000-0000000000ff', 'walkin@test');
select tests.ok('signing up without an invitation gives no role and no firm',
  not exists (select 1 from user_roles)
  and (select firm_id from profiles where id = 'aaaaaaaa-0000-0000-0000-0000000000ff') is null);
select tests.login('aaaaaaaa-0000-0000-0000-0000000000ff'); set role authenticated;
select tests.ok('a signed-in person cannot invite a firm owner',
  tests.refused(format($$select platform_invite_owner(%L, 'x@firm.test', 'X')$$, :'FIRM1')));
select tests.ok('a signed-in person cannot create a firm',
  tests.refused($$select platform_create_firm('Mine', '', null, 'monthly', 0, '')$$));
reset role;
select tests.login(null);
-- the platform (service role) invites the managing partner
select platform_invite_owner(:'FIRM1', 'Partner@Firm.test', 'Pat Partner') as owner_invite \gset
select tests.ok('the platform invites a firm owner', :'owner_invite' = 'invited');
insert into auth.users(id, email) values (:'P', 'partner@firm.test');
select tests.login(:'P'); set role authenticated;
select invite_team_member('lawyer@firm.test', '', 'lawyer'), invite_team_member('para@firm.test', '', 'paralegal'),
       invite_team_member('desk@firm.test', '', 'frontdesk');
reset role;
select tests.login(null);
insert into auth.users(id, email) values (:'L', 'lawyer@firm.test'), (:'A', 'para@firm.test'), (:'F', 'desk@firm.test'), (:'X', 'pending@firm.test');
select tests.ok('invited people get their role and firm; uninvited sign-ups get nothing',
  (select string_agg(role::text, ',' order by user_id) from user_roles) = 'partner,lawyer,paralegal,frontdesk'
  and (select count(*) from profiles where firm_id = :'FIRM1' and id in (:'P', :'L', :'A', :'F')) = 4
  and (select firm_id from profiles where id = :'X') is null
  and (select full_name from profiles where id = :'P') = 'Pat Partner');
select tests.ok('new accounts start onboarding',
  (select count(*) from profiles where onboarded_at is null and id in (:'P', :'L')) = 2);

-- ===== Onboarding =====
select tests.login(:'P'); set role authenticated;
select tests.ok('a partner must give the firm a name',
  tests.refused($$select complete_onboarding('Pat Partner', 'Managing Partner', '', '{"firm_name":" "}'::jsonb)$$));
select complete_onboarding('Pat Partner', 'Managing Partner', '+263 77 000 0000',
  '{"firm_name":"Moyo & Partners","address":"1 Main St","email":"Accounts@Moyo.test","vat_number":"123","vat_rate":"15"}'::jsonb);
select tests.ok('partner onboarding saves their details and the firm''s',
  (select title = 'Managing Partner' and phone = '+263 77 000 0000' and onboarded_at is not null from profiles where id = :'P')
  and (select firm_name = 'Moyo & Partners' and email = 'accounts@moyo.test' and vat_rate = 15 from firm_settings));
reset role;
select tests.login(:'X'); set role authenticated;
select tests.ok('someone without access cannot complete onboarding',
  tests.refused($$select complete_onboarding('Pending Person', '', '')$$));
reset role;

select tests.login(:'X'); set role authenticated;
select tests.ok('pending user sees no clients, matters, documents, inquiries or announcements',
  (select count(*) from clients) + (select count(*) from matters) + (select count(*) from documents)
  + (select count(*) from inquiries) + (select count(*) from announcements) = 0);
select tests.ok('pending user cannot run the conflict count', tests.refused($$select conflict_check_count('Moyo')$$));
reset role;

select tests.login(null); set role anon;
select tests.ok('signed-out visitor cannot run the conflict count', tests.refused($$select conflict_check_count('Moyo')$$));
select tests.ok('signed-out visitor cannot call has_role', tests.refused($$select has_role(gen_random_uuid(), 'partner')$$));
reset role;

select tests.login(:'P'); set role authenticated;
select tests.ok('partner cannot see accounts outside the firm', not exists (select 1 from profiles where id = :'X'));
select tests.ok('partner cannot give a role to someone outside the firm',
  tests.refused(format($$insert into user_roles(user_id, role) values (%L, 'lawyer')$$, :'X')));
reset role;
select tests.login(:'L'); set role authenticated;
select tests.ok('a lawyer cannot change the firm''s details while onboarding',
  tests.refused($$select complete_onboarding('Lee Lawyer', '', '', '{"firm_name":"Mine"}'::jsonb)$$));
select complete_onboarding('Lee Lawyer', 'Associate', '');
select tests.ok('a lawyer finishes onboarding with their own details only',
  (select full_name = 'Lee Lawyer' and title = 'Associate' and onboarded_at is not null from profiles where id = :'L')
  and (select firm_name from firm_settings) = 'Moyo & Partners');
select tests.ok('people cannot finish onboarding with an empty name',
  tests.refused($$select complete_onboarding(' ', '', '')$$));
reset role;

-- Fixtures (as the database owner): L runs M1, A is assigned to M5,
-- L and P are walled from M11 (the only matter of client C10).
update matters set responsible_lawyer_id = :'L' where id = :'M1';
insert into matter_assignments(matter_id, user_id) values (:'M5', :'A');
insert into matter_ethical_walls(matter_id, user_id, reason) values (:'M11', :'L', 'test'), (:'M11', :'P', 'test');
insert into announcements(title, body, created_by) values ('Firm notice', 'Office closed Friday', :'P');
insert into announcements(matter_id, title, body, created_by) values (:'M11', 'M11 update', 'Hearing moved', :'P');

-- ===== Documents and files =====
select tests.login(:'L'); set role authenticated;
insert into storage.objects(bucket_id, name) values ('matter-documents', :'L' || '/brief.pdf');
insert into documents(matter_id, name, file_path, uploaded_by) values (:'M1', 'brief.pdf', :'L' || '/brief.pdf', :'L');
select tests.ok('lawyer sees own document and file',
  (select count(*) from documents) = 1 and (select count(*) from storage.objects) = 1);
reset role;

select tests.login(:'A'); set role authenticated;
select tests.ok('paralegal not on M1 cannot see its document or file',
  (select count(*) from documents) = 0 and (select count(*) from storage.objects) = 0);
select tests.ok('paralegal cannot upload into someone else''s folder',
  tests.refused(format($$insert into storage.objects(bucket_id, name) values ('matter-documents', %L)$$, :'L' || '/forged.pdf')));
insert into storage.objects(bucket_id, name) values ('matter-documents', :'A' || '/draft.pdf');
select tests.ok('paralegal sees own upload in progress', exists (select 1 from storage.objects where name like '%/draft.pdf'));
select tests.ok('paralegal cannot delete lawyer''s document', tests.refused($$delete from documents$$));
reset role;

select tests.login(:'L'); set role authenticated;
select tests.ok('lawyer cannot see paralegal''s upload in progress', not exists (select 1 from storage.objects where name like '%/draft.pdf'));
reset role;

select tests.login(:'P'); set role authenticated;
insert into matter_ethical_walls(matter_id, user_id, reason) values (:'M1', :'L', 'test');
reset role;
select tests.login(:'L'); set role authenticated;
select tests.ok('walled lawyer loses the matter, its document and file',
  not exists (select 1 from matters where id = :'M1') and (select count(*) from documents) = 0
  and (select count(*) from storage.objects) = 0);
reset role;
delete from matter_ethical_walls where matter_id = :'M1';

-- ===== Creator walls =====
select tests.login(:'A'); set role authenticated;
insert into matters(id, title, client_id, created_by) values ('33333333-0000-0000-0000-000000000001', 'Para matter', :'C1', :'A');
reset role;
insert into matter_ethical_walls(matter_id, user_id, reason) values ('33333333-0000-0000-0000-000000000001', :'A', 'test');
select tests.login(:'A'); set role authenticated;
select tests.ok('walled creator cannot see the matter they created',
  not exists (select 1 from matters where id = '33333333-0000-0000-0000-000000000001'));
reset role;

-- ===== Clients =====
select tests.login(:'L'); set role authenticated;
select tests.ok('lawyer sees clients of their matters only',
  exists (select 1 from clients where id = :'C1') and not exists (select 1 from clients where id = :'C4'));
select tests.ok('client picker lists other clients by name but hides walled ones',
  exists (select 1 from client_directory() where id = :'C4') and not exists (select 1 from client_directory() where id = :'C10'));
reset role;

select tests.login(:'L'); set role authenticated;
insert into clients(name) values ('Lawyer Created Client') returning id as lawyer_client \gset
select tests.ok('non-partner can create a client and read it back', exists (select 1 from clients where id = :'lawyer_client'));
reset role;

select tests.login(:'A'); set role authenticated;
select tests.ok('assigned paralegal sees that matter''s client', exists (select 1 from clients where id = :'C4'));
reset role;

select tests.login(:'P'); set role authenticated;
select tests.ok('walled partner cannot see the walled client, sees the rest',
  not exists (select 1 from clients where id = :'C10') and exists (select 1 from clients where id = :'C4'));
insert into clients(name) values ('Brand New Client');
select tests.ok('new clients are stamped with their creator',
  (select created_by from clients where name = 'Brand New Client') = :'P'::uuid);
reset role;

-- ===== Front desk =====
insert into matter_ethical_walls(matter_id, user_id, reason) values (:'M5', :'F', 'test');
select tests.login(:'F'); set role authenticated;
select tests.ok('front desk cannot read matter records or clients',
  (select count(*) from matters) = 0 and (select count(*) from clients) = 0);
select tests.ok('front desk directory lists matters, minus walled ones',
  (select count(*) from matter_directory()) > 0 and not exists (select 1 from matter_directory() where id = :'M5'));
select tests.ok('front desk sees firm-wide announcements only',
  (select count(*) from announcements) = 1 and (select bool_and(matter_id is null) from announcements));
reset role;

-- ===== Audit log =====
select tests.login(:'A'); set role authenticated;
select tests.ok('cannot write activity in someone else''s name',
  tests.refused(format($$insert into activity_log(entity_type, entity_id, action, user_id) values ('inquiry', gen_random_uuid(), 'x', %L)$$, :'P')));
select tests.ok('cannot write matter activity by hand',
  tests.refused($$insert into activity_log(entity_type, entity_id, action) values ('matter', gen_random_uuid(), 'x')$$));
insert into activity_log(entity_type, entity_id, action) values ('inquiry', gen_random_uuid(), 'note');
reset role;
select tests.ok('own inquiry activity is stamped with the author',
  (select user_id from activity_log where action = 'note') = :'A'::uuid);

-- ===== Billing =====
select tests.login(:'L'); set role authenticated;
insert into time_entries(matter_id, user_id, description, hours, hourly_rate) values (:'M1', :'L', 'Draft A', 1, 9999);
select tests.ok('lawyer cannot choose their own rate (default 250 applies)',
  (select hourly_rate from time_entries where description = 'Draft A') = 250);
reset role;

select tests.login(:'P'); set role authenticated;
insert into billing_rates(user_id, hourly_rate) values (:'L', 300);
reset role;

select tests.login(:'L'); set role authenticated;
insert into time_entries(matter_id, user_id, description, hours, hourly_rate) values (:'M1', :'L', 'Draft B', 2, 1);
select tests.ok('partner-set rate applies to new entries', (select hourly_rate from time_entries where description = 'Draft B') = 300);
update time_entries set hourly_rate = 5000 where description = 'Draft B';
select tests.ok('lawyer cannot raise the rate on an entry', (select hourly_rate from time_entries where description = 'Draft B') = 300);
select tests.ok('lawyer sees own rate only', (select count(*) from billing_rates) = 1);
reset role;

select tests.login(:'P'); set role authenticated;
insert into invoices(invoice_number, matter_id, client_id) values ('TEST-1', :'M1', :'C1');
update time_entries set invoice_id = (select id from invoices where invoice_number = 'TEST-1') where description = 'Draft B';
reset role;

select tests.login(:'L'); set role authenticated;
select tests.ok('invoiced time cannot be edited', tests.refused($$update time_entries set hours = 9 where description = 'Draft B'$$));
select tests.ok('invoiced time cannot be deleted', tests.refused($$delete from time_entries where description = 'Draft B'$$));
select tests.ok('unbilled time can still be edited', not tests.refused($$update time_entries set hours = 3 where description = 'Draft A'$$));
reset role;

-- ===== Announcements =====
select tests.login(:'L'); set role authenticated;
select tests.ok('walled lawyer cannot read the walled matter''s announcements',
  not exists (select 1 from announcements where matter_id = :'M11'));
select tests.ok('walled lawyer cannot post to the walled matter',
  tests.refused(format($$insert into announcements(matter_id, title, body, created_by) values (%L, 't', 'b', %L)$$, :'M11', :'L')));
reset role;

-- ===== One-step invoices =====
select tests.login(:'L'); set role authenticated;
select tests.ok('only partners can create invoices',
  tests.refused(format($$select * from create_invoice(%L, array(select id from time_entries where description = 'Draft A'), current_date + 30)$$, :'M1')));
reset role;

select tests.login(:'P'); set role authenticated;
select count(*) as invoices_before from invoices \gset
select tests.ok('invoice cannot include time that is already invoiced, and nothing is half-created',
  tests.refused(format($$select * from create_invoice(%L, array(select id from time_entries where description in ('Draft A', 'Draft B')), current_date + 30)$$, :'M1'))
  and (select count(*) from invoices) = :invoices_before);
select invoice_number as first_number from create_invoice(:'M1', array(select id from time_entries where description = 'Draft A'), current_date + 30) \gset
select tests.ok('invoice links its time and copies it into line items',
  (select count(*) from invoice_items ii join invoices v on v.id = ii.invoice_id where v.invoice_number = :'first_number') = 1
  and (select v.invoice_number from time_entries t join invoices v on v.id = t.invoice_id where t.description = 'Draft A') = :'first_number');
reset role;
insert into time_entries(matter_id, user_id, description, hours) values (:'M1', :'L', 'Draft C', 1);
select tests.login(:'P'); set role authenticated;
select invoice_number as second_number from create_invoice(:'M1', array(select id from time_entries where description = 'Draft C'), current_date + 30) \gset
select tests.ok('invoice numbers count up within the year and never repeat',
  split_part(:'second_number', '-', 3)::int = split_part(:'first_number', '-', 3)::int + 1
  and split_part(:'first_number', '-', 2) = extract(year from current_date)::text
  and (select count(*) from invoices where invoice_number in (:'first_number', :'second_number')) = 2);
reset role;

-- ===== One-step inquiry acceptance =====
insert into inquiries(id, name, contact, practice_area, summary) values
  ('44444444-0000-0000-0000-000000000001', 'Mhondoro Holdings', 'legal@mhondoro.test · +263 77 000 0000', 'corporate', 'New supply dispute'),
  ('44444444-0000-0000-0000-000000000002', 'Fresh Prospect', 'fresh@prospect.test · +263 77 111 1111', 'family', 'Custody question');

select tests.login(:'F'); set role authenticated;
select tests.ok('front desk cannot accept inquiries',
  tests.refused($$select * from accept_inquiry('44444444-0000-0000-0000-000000000002', 'x')$$));
reset role;

select tests.login(:'L'); set role authenticated;
select tests.ok('cannot attach an inquiry to a client you are walled from, and nothing changes',
  tests.refused(format($$select * from accept_inquiry('44444444-0000-0000-0000-000000000001', 'x', %L)$$, :'C10'))
  and (select status from inquiries where id = '44444444-0000-0000-0000-000000000001') = 'new');
select matter_id as reused_matter from accept_inquiry('44444444-0000-0000-0000-000000000001', 'Mhondoro supply dispute', :'C1') \gset
select matter_id as new_matter, client_id as new_client from accept_inquiry('44444444-0000-0000-0000-000000000002', 'Fresh Prospect: new family matter') \gset
select tests.ok('accepting can reuse an existing client',
  (select client_id from matters where id = :'reused_matter') = :'C1'::uuid);
select tests.ok('accepting a new prospect creates the client with email and phone split out',
  (select email = 'fresh@prospect.test' and phone = '+263 77 111 1111' from clients where id = :'new_client'));
select tests.ok('the inquiry is marked accepted and linked to the matter',
  (select status = 'accepted' and matter_id = :'new_matter'::uuid from inquiries where id = '44444444-0000-0000-0000-000000000002'));
select tests.ok('an inquiry cannot be accepted twice',
  tests.refused($$select * from accept_inquiry('44444444-0000-0000-0000-000000000002', 'again')$$));
reset role;
select tests.ok('acceptance is logged in the lawyer''s name',
  (select count(*) from activity_log where entity_id = '44444444-0000-0000-0000-000000000002' and action = 'accepted' and user_id = :'L') = 1);

-- ===== One-step role changes =====
select tests.login(:'L'); set role authenticated;
select tests.ok('only partners can change roles', tests.refused(format($$select set_user_role(%L, 'partner')$$, :'L')));
reset role;
select tests.login(:'P'); set role authenticated;
select tests.ok('partner cannot change their own role', tests.refused(format($$select set_user_role(%L, 'lawyer')$$, :'P')));
select tests.ok('partner cannot give a role to an account outside the firm',
  tests.refused(format($$select set_user_role(%L, 'paralegal')$$, :'X')));
select set_user_role(:'F', 'paralegal');
select tests.ok('partner changes a team member''s role in one step',
  (select array_agg(role::text) from user_roles where user_id = :'F') = array['paralegal']);
select set_user_role(:'F', 'frontdesk');
reset role;

-- ===== Team invitations =====
select tests.login(:'L'); set role authenticated;
select tests.ok('only partners can invite', tests.refused($$select invite_team_member('someone@firm.test', 'Someone', 'lawyer')$$));
reset role;
select tests.login(:'P'); set role authenticated;
select tests.ok('partner invites a new person by email', invite_team_member('  Newbie@Firm.test ', 'New Bie', 'lawyer') = 'invited');
select tests.ok('cannot invite someone already on the team', tests.refused($$select invite_team_member('lawyer@firm.test', 'L', 'paralegal')$$));
reset role;
insert into auth.users(id, email) values ('aaaaaaaa-0000-0000-0000-000000000006', 'newbie@firm.test');
select tests.ok('invited person gets their role on sign-up and the invitation is used up',
  (select role::text from user_roles where user_id = 'aaaaaaaa-0000-0000-0000-000000000006') = 'lawyer'
  and (select accepted_user_id from team_invitations where email = 'newbie@firm.test') = 'aaaaaaaa-0000-0000-0000-000000000006'
  and (select full_name from profiles where id = 'aaaaaaaa-0000-0000-0000-000000000006') = 'New Bie');
insert into auth.users(id, email) values ('aaaaaaaa-0000-0000-0000-000000000007', 'waiting@firm.test');
select tests.login(:'P'); set role authenticated;
select invite_team_member('waiting@firm.test', '', 'frontdesk') as invite_result \gset
select tests.ok('inviting someone already waiting for approval gives them the role at once',
  :'invite_result' = 'assigned'
  and (select role::text from user_roles where user_id = 'aaaaaaaa-0000-0000-0000-000000000007') = 'frontdesk');
select remove_team_member('aaaaaaaa-0000-0000-0000-000000000007');
select tests.ok('partner removes someone''s access', not exists (select 1 from user_roles where user_id = 'aaaaaaaa-0000-0000-0000-000000000007'));
select tests.ok('partner cannot remove themselves', tests.refused(format($$select remove_team_member(%L)$$, :'P')));
reset role;

-- ===== Tasks =====
update matters set responsible_lawyer_id = :'A' where id = :'M11';
select tests.login(:'A'); set role authenticated;
insert into tasks(title, assignee_id) values ('Call the registrar', :'L');
select tests.ok('staff can assign a task to a colleague and still see it', exists (select 1 from tasks where title = 'Call the registrar'));
select tests.ok('tasks cannot be assigned to front desk',
  tests.refused(format($$insert into tasks(title, assignee_id) values ('x', %L)$$, :'F')));
select tests.ok('tasks cannot be assigned to someone walled from the matter',
  tests.refused(format($$insert into tasks(title, matter_id, assignee_id) values ('x', %L, %L)$$, :'M11', :'L')));
insert into tasks(title, matter_id, assignee_id, due_date) values ('Prepare bundle', :'M5', :'L', current_date + 3);
reset role;
select tests.login(:'L'); set role authenticated;
select tests.ok('assignee sees tasks given to them, even on a matter they are not on',
  (select count(*) from tasks where title in ('Call the registrar', 'Prepare bundle')) = 2);
select tests.ok('assignee can move their task along', not tests.refused($$update tasks set status = 'in_progress' where title = 'Call the registrar'$$));
select tests.ok('only the creator or a partner can delete a task', tests.refused($$delete from tasks where title = 'Call the registrar'$$));
reset role;
select tests.login(:'A'); set role authenticated;
select tests.ok('creator can delete their task', not tests.refused($$delete from tasks where title = 'Call the registrar'$$));
reset role;

-- ===== Deadline confirmation =====
select tests.login(:'A'); set role authenticated;
select tests.ok('a paralegal cannot mark a deadline confirmed',
  tests.refused(format($$insert into events(matter_id, title, type, starts_at, confirmed_by) values (%L, 'x', 'filing_deadline', now() + interval '3 days', %L)$$, :'M5', :'A')));
reset role;
select tests.login(:'L'); set role authenticated;
insert into events(matter_id, title, type, starts_at) values (:'M1', 'File heads', 'filing_deadline', now() + interval '2 days');
select tests.ok('a lawyer cannot confirm in someone else''s name',
  tests.refused(format($$update events set confirmed_by = %L where title = 'File heads'$$, :'P')));
select tests.ok('a lawyer confirms in their own name',
  not tests.refused(format($$update events set confirmed_by = %L where title = 'File heads'$$, :'L')));
insert into events(title, type, starts_at) values ('Lunch with counsel', 'meeting', now() + interval '1 day');
select tests.ok('new events are stamped with who entered them',
  (select owner_id = :'L'::uuid and entered_by = :'L'::uuid from events where title = 'Lunch with counsel'));
insert into calendar_feeds(user_id) values (:'L') returning token as l_token \gset
select tests.ok('signed-in users cannot read a feed directly', tests.refused(format($$select * from calendar_feed(%L)$$, :'l_token')));
reset role;

-- ===== Calendar feed (as the server) =====
insert into events(matter_id, title, type, starts_at) values (:'M11', 'Walled hearing', 'hearing', now() + interval '4 days');
select tests.ok('feed shows the lawyer''s matter dates, own events and tasks',
  exists (select 1 from calendar_feed(:'l_token') where title like 'File heads%')
  and exists (select 1 from calendar_feed(:'l_token') where title = 'Lunch with counsel')
  and exists (select 1 from calendar_feed(:'l_token') where kind = 'task' and title like 'Task: Prepare bundle%'));
select tests.ok('feed leaves out walled matters', not exists (select 1 from calendar_feed(:'l_token') where title like 'Walled hearing%'));
select tests.ok('a wrong token shows nothing', not exists (select 1 from calendar_feed('not-a-token')));
delete from user_roles where user_id = :'L';
select tests.ok('feed goes empty when the person loses access', not exists (select 1 from calendar_feed(:'l_token')));
insert into user_roles(user_id, role) values (:'L', 'lawyer');

-- ===== Demo workspace =====
insert into auth.users(id, email, raw_user_meta_data) values
  ('dddddddd-9999-0000-0000-000000000001', 'demo.partner@example.com', '{"full_name":"Rumbidzai Makoni"}'),
  ('dddddddd-9999-0000-0000-000000000002', 'demo.lawyer@example.com', '{"full_name":"Tafadzwa Chirwa"}'),
  ('dddddddd-9999-0000-0000-000000000003', 'demo.paralegal@example.com', '{"full_name":"Nyasha Gumbo"}'),
  ('dddddddd-9999-0000-0000-000000000004', 'demo.frontdesk@example.com', '{"full_name":"Precious Ndlovu"}');
insert into demo_settings(id, enabled, password, partner_id, lawyer_id, paralegal_id, frontdesk_id) values
  (1, true, 'x', 'dddddddd-9999-0000-0000-000000000001', 'dddddddd-9999-0000-0000-000000000002', 'dddddddd-9999-0000-0000-000000000003', 'dddddddd-9999-0000-0000-000000000004');
-- the server calls this with the service role, so nobody is signed in
select tests.login(null);
select refresh_demo_data();
select refresh_demo_data();
select tests.ok('demo reset can run again without duplicating anything',
  (select count(*) from tasks where id::text like 'dddddddd-0001-%') = 9
  and (select count(*) from inquiries where id::text like 'dddddddd-0003-%') = 3
  and (select count(*) from invoices where id = 'dddddddd-0005-0000-0000-000000000001') = 1);

select tests.login('dddddddd-9999-0000-0000-000000000002'); set role authenticated;
select tests.ok('demo lawyer sees their matters, tasks due today and this week''s dates',
  (select count(*) from matters) >= 6
  and exists (select 1 from tasks where due_date = current_date and assignee_id = auth.uid())
  and (select count(*) from events where starts_at between now() and now() + interval '7 days') >= 3);
select tests.ok('demo lawyer sees billed and unbilled time', (select count(*) from time_entries where invoice_id is null) >= 3
  and (select count(*) from invoices) >= 1);
reset role;
select tests.login('dddddddd-9999-0000-0000-000000000003'); set role authenticated;
select tests.ok('demo paralegal sees assigned matters but not the walled one',
  (select count(*) from matters) = 4 and not exists (select 1 from matters where id = :'M11'));
reset role;
select tests.login('dddddddd-9999-0000-0000-000000000004'); set role authenticated;
select tests.ok('demo front desk sees the inquiries and the matter directory, not records',
  (select count(*) from inquiries where id::text like 'dddddddd-0003-%') = 3
  and (select count(*) from matters) = 0 and (select count(*) from matter_directory()) > 0);
select tests.ok('demo front desk is warned about the conflicted inquiry', conflict_check_count('Mhondoro Holdings') > 0);
reset role;
select tests.ok('signed-in users cannot run the demo reset or read its settings',
  (select not has_function_privilege('authenticated', 'refresh_demo_data()', 'execute'))
  and not has_table_privilege('authenticated', 'demo_settings', 'select'));

-- ===== Firm profile and VAT =====
select tests.login(null);
-- start from a blank profile (onboarding tests above filled it in)
update firm_settings set firm_name = null, address = null, phone = null, email = null,
  registration_no = null, vat_number = null, vat_rate = 0;
select seed_demo_firm_profile();
set role anon;
select tests.ok('anyone can see the firm name for the intake page', (select firm_name from public_firm_profile('firm-1')) = 'Makoni & Partners');
select tests.ok('signed-out visitors cannot read the full firm profile', tests.refused($$select bank_details from firm_settings$$));
reset role;
select tests.login(:'F'); set role authenticated;
select tests.ok('front desk can read the firm profile', (select count(*) from firm_settings) = 1);
reset role;
select tests.login(:'L'); set role authenticated;
select tests.ok('a lawyer cannot change the firm profile', tests.refused($$update firm_settings set firm_name = 'Other'$$));
reset role;
select tests.login(:'P'); set role authenticated;
update firm_settings set vat_rate = 15;
insert into time_entries(matter_id, user_id, description, hours) values (:'M1', :'P', 'VAT check', 1);
select invoice_number as vat_number from create_invoice(:'M1', array(select id from time_entries where description = 'VAT check'), current_date + 30) \gset
select tests.ok('new invoices carry the firm''s VAT rate', (select tax_rate from invoices where invoice_number = :'vat_number') = 15);
update firm_settings set vat_rate = 0;
select tests.ok('changing the VAT rate later leaves old invoices alone', (select tax_rate from invoices where invoice_number = :'vat_number') = 15);
reset role;

-- ===== Two-way calendar sync =====
insert into calendar_connections(user_id, provider, account_email, access_token, refresh_token)
  values (:'L', 'google', 'lawyer@gmail.test', 'secret-access', 'secret-refresh');
select tests.login(:'L'); set role authenticated;
select tests.ok('nobody can read calendar tokens from the browser, not even their own',
  tests.refused($$select access_token from calendar_connections$$)
  and tests.refused($$select * from calendar_event_links$$)
  and tests.refused($$select * from calendar_oauth_states$$));
select tests.ok('people see their own connection status, without tokens',
  (select count(*) from my_calendar_connections()) = 1
  and (select account_email from my_calendar_connections()) = 'lawyer@gmail.test');
select tests.ok('signed-in users cannot list someone''s calendar events through the sync function',
  tests.refused(format($$select * from calendar_events_for_user(%L)$$, :'P')));
reset role;
select tests.login(:'A'); set role authenticated;
select tests.ok('colleagues cannot see each other''s connections', (select count(*) from my_calendar_connections()) = 0);
reset role;
select tests.login(null);
select tests.ok('the sync list matches the subscription feed''s events',
  (select count(*) from calendar_events_for_user(:'L'))
  = (select count(*) from calendar_feed((select token from calendar_feeds where user_id = :'L')) where kind <> 'task'));

-- ===== Storage =====
select tests.ok('documents bucket is private', not (select public from storage.buckets where id = 'matter-documents'));

-- ===== Firms are walled off from each other =====
\set Q 'aaaaaaaa-0000-0000-0000-0000000000a2'
select tests.login(null);
select platform_create_firm('Chikwanha Law', '', (select id from platform_plans where name = 'Starter'), 'monthly', 14, 'Billing@Chik.test') as f2 \gset
select tests.ok('the platform creates a firm on a trial, with its own profile and web address',
  (select slug = 'chikwanha-law' and status = 'trial' and trial_ends_at = current_date + 14 and billing_email = 'billing@chik.test' from firms where id = :'f2')
  and (select firm_name from firm_settings where firm_id = :'f2') = 'Chikwanha Law');
select tests.ok('two firms cannot share a web address',
  tests.refused($$select platform_create_firm('Another', 'chikwanha-law', null, 'monthly', 0, '')$$));
select tests.ok('a firm owner already at another firm cannot be invited',
  tests.refused(format($$select platform_invite_owner(%L, 'lawyer@firm.test', 'L')$$, :'f2')));
select platform_invite_owner(:'f2', 'owner@chik.test', 'Owner Two');
insert into auth.users(id, email) values (:'Q', 'owner@chik.test');
select tests.ok('the new firm''s owner joins it as partner',
  (select firm_id from profiles where id = :'Q') = :'f2'
  and (select role::text from user_roles where user_id = :'Q') = 'partner');

select tests.login(:'Q'); set role authenticated;
select tests.ok('a new firm sees none of another firm''s data',
  (select count(*) from clients) + (select count(*) from matters) + (select count(*) from documents)
  + (select count(*) from inquiries) + (select count(*) from events) + (select count(*) from tasks)
  + (select count(*) from invoices) + (select count(*) from time_entries) + (select count(*) from announcements)
  + (select count(*) from activity_log) + (select count(*) from matter_ethical_walls) + (select count(*) from billing_rates)
  + (select count(*) from team_invitations where firm_id <> :'f2') + (select count(*) from client_directory()) = 0);
select tests.ok('people in another firm are invisible',
  (select array_agg(id) from profiles) = array[:'Q'::uuid] and (select count(*) from user_roles) = 1);
select tests.ok('the conflict check only searches your own firm', conflict_check_count('Moyo') = 0 and not exists (select 1 from conflict_check('a')));
select tests.ok('a partner cannot open another firm''s matter, even by id', not can_access_matter(:'M1'));
select tests.ok('or read its document files', not can_read_document_file(:'L' || '/brief.pdf'));
select tests.ok('the firm profile is only their own', (select array_agg(firm_name) from firm_settings) = array['Chikwanha Law']);
select tests.ok('nothing can be written into another firm',
  tests.refused(format($$insert into clients(firm_id, name) values (%L, 'Planted')$$, :'FIRM1'))
  and tests.refused(format($$update matters set title = 'x' where id = %L$$, :'M1'))
  and tests.refused(format($$delete from clients where id = %L$$, :'C1'))
  and tests.refused(format($$insert into matter_assignments(matter_id, user_id) values (%L, %L)$$, :'M1', :'Q')));
select tests.ok('roles of another firm''s people cannot be changed',
  tests.refused(format($$select set_user_role(%L, 'partner')$$, :'L'))
  and tests.refused(format($$select remove_team_member(%L)$$, :'L'))
  and tests.refused(format($$update user_roles set role = 'partner' where user_id = %L$$, :'A')));
select tests.ok('people already at another firm cannot be invited', tests.refused($$select invite_team_member('para@firm.test', '', 'lawyer')$$));
select tests.ok('people cannot move themselves to another firm',
  tests.refused(format($$update profiles set firm_id = %L where id = %L$$, :'FIRM1', :'Q')));
insert into clients(name) values ('Own client') returning firm_id = :'f2' as own_firm \gset
select tests.ok('new rows land in your own firm', :'own_firm');
insert into matters(title, client_id, created_by) select 'First matter', id, :'Q' from clients where name = 'Own client';
select tests.ok('matter numbers start again for each firm',
  (select matter_number from matters where title = 'First matter') = extract(year from current_date)::int || '-0001');
select tests.ok('the plan''s user limit applies to invitations',
  invite_team_member('one@chik.test', '', 'lawyer') = 'invited'
  and invite_team_member('two@chik.test', '', 'paralegal') = 'invited'
  and tests.refused($$select invite_team_member('three@chik.test', '', 'lawyer')$$));
select tests.ok('invitations only go through invite_team_member', tests.refused($$insert into team_invitations(email, role) values ('side@chik.test', 'lawyer')$$));
select tests.ok('a partner sees their firm, plan and price', (select name = 'Chikwanha Law' and plan_name = 'Starter' and user_limit = 3 and seats_used = 3 and price = 49 from my_firm()));
reset role;
select tests.login(:'P'); set role authenticated;
select tests.ok('the first firm cannot see the new firm''s client', not exists (select 1 from clients where name = 'Own client'));
reset role;
select tests.login(:'L'); set role authenticated;
select tests.ok('staff see their firm but not its price', (select price is null and name is not null from my_firm()));
reset role;

-- Attempts found in the security review
select tests.login(:'Q'); set role authenticated;
select tests.ok('nobody can change their own sign-in email on their profile',
  tests.refused(format($$update profiles set email = 'partner@firm.test' where id = %L$$, :'Q')));
select tests.ok('invitations cannot be rewritten or brought back',
  tests.refused($$update team_invitations set email = 'partner@firm.test' where email = 'one@chik.test'$$)
  and tests.refused($$update team_invitations set revoked_at = null$$)
  and tests.refused($$delete from team_invitations$$));
select revoke_invitation((select id from team_invitations where email = 'two@chik.test'));
select tests.ok('a partner cancels an invitation, freeing the seat', (select seats_used from my_firm()) = 2);
select tests.ok('a firm cannot point its rows at another firm''s records',
  tests.refused(format($$insert into matters(title, client_id, created_by) values ('Probe', %L, %L)$$, :'C1', :'Q'))
  and tests.refused(format($$insert into invoice_items(invoice_id, description, quantity, unit_price) values ((select id from invoices limit 1), 'x', 1, 1)$$))
  and tests.refused(format($$insert into tasks(title, assignee_id) values ('x', %L)$$, :'L'))
  and tests.refused(format($$insert into billing_rates(user_id, hourly_rate) values (%L, 1)$$, :'A')));
select tests.ok('role checks say nothing about other firms'' people',
  not has_role(:'P', 'partner') and not is_internal(:'L') and not is_frontdesk(:'F'));
select tests.ok('a logo can only point inside the firm''s own folder',
  tests.refused(format($$update firm_settings set logo_path = %L$$, :'FIRM1' || '/logo.png')));
select tests.ok('documents cannot name another firm''s client',
  tests.refused(format($$insert into documents(name, file_path, uploaded_by, client_id) values ('x', %L, %L, %L)$$, :'Q' || '/x.pdf', :'Q', :'C1')));
select tests.ok('documents must point at the uploader''s own folder',
  tests.refused(format($$insert into documents(name, file_path, uploaded_by) values ('x', %L, %L)$$, :'L' || '/brief.pdf', :'Q')));
reset role;
select tests.login(:'P'); set role authenticated;
select tests.ok('onboarding can''t be undone', tests.refused(format($$update profiles set onboarded_at = null where id = %L$$, :'P')));
select invite_team_member('temp@firm.test', 'Temp', 'paralegal');
select invite_team_member('pre@firm.test', 'Pre', 'lawyer');
reset role;
select tests.login(null);
insert into auth.users(id, email, email_confirmed_at) values ('aaaaaaaa-0000-0000-0000-0000000000b1', 'pre@firm.test', null);
select tests.ok('an unconfirmed sign-up does not claim an open invitation',
  not exists (select 1 from user_roles where user_id = 'aaaaaaaa-0000-0000-0000-0000000000b1'));
update auth.users set email_confirmed_at = now() where id = 'aaaaaaaa-0000-0000-0000-0000000000b1';
select tests.ok('nor once that sign-up is confirmed: someone could have signed up ahead of the invitee',
  not exists (select 1 from user_roles where user_id = 'aaaaaaaa-0000-0000-0000-0000000000b1'));
update auth.users set invited_at = now() where id = 'aaaaaaaa-0000-0000-0000-0000000000b1';
select tests.ok('the invitation is used when Acta sends it to the account',
  (select role::text from user_roles where user_id = 'aaaaaaaa-0000-0000-0000-0000000000b1') = 'lawyer'
  and (select firm_id from profiles where id = 'aaaaaaaa-0000-0000-0000-0000000000b1') = :'FIRM1');
insert into auth.users(id, email, email_confirmed_at) values ('aaaaaaaa-0000-0000-0000-0000000000b2', 'ghost@chik.test', null);
select tests.login(:'Q'); set role authenticated;
select tests.ok('an unconfirmed account cannot be pulled into a firm', tests.refused($$select invite_team_member('ghost@chik.test', '', 'lawyer')$$));
reset role;
select tests.login(null);
insert into auth.users(id, email) values ('aaaaaaaa-0000-0000-0000-0000000000b3', 'temp@firm.test');
insert into matter_assignments(firm_id, matter_id, user_id) values (:'FIRM1', :'M1', 'aaaaaaaa-0000-0000-0000-0000000000b3');
select tests.login('aaaaaaaa-0000-0000-0000-0000000000b3'); set role authenticated;
select tests.ok('an assigned paralegal sees the matter', exists (select 1 from matters where id = :'M1'));
insert into matters(title, client_id, created_by) values ('Opened by temp', :'C1', 'aaaaaaaa-0000-0000-0000-0000000000b3');
reset role;
select tests.login(null);
select coalesce(responsible_lawyer_id::text, '') as m5_lawyer, status::text as m5_status from matters where id = :'M5' \gset
update matters set responsible_lawyer_id = 'aaaaaaaa-0000-0000-0000-0000000000b3' where id = :'M5';
select tests.login(:'P'); set role authenticated;
select remove_team_member('aaaaaaaa-0000-0000-0000-0000000000b3');
reset role;
select tests.login('aaaaaaaa-0000-0000-0000-0000000000b3'); set role authenticated;
select tests.ok('someone removed from the team loses their matters, even ones they opened or are assigned to',
  not exists (select 1 from matters) and not exists (select 1 from matter_assignments));
reset role;
select tests.login(null);
select platform_invite_owner(:'f2', 'temp@firm.test', 'Temp');
select tests.login(:'P'); set role authenticated;
update matters set status = 'active' where id = :'M5';
select tests.ok('a matter naming someone who has since left the firm can still be edited',
  (select status::text from matters where id = :'M5') = 'active');
reset role;
select tests.login(null);
update matters set responsible_lawyer_id = nullif(:'m5_lawyer', '')::uuid, status = :'m5_status' where id = :'M5';
select tests.login(null);
select tests.ok('demo mode refuses to run in a workspace with several firms', tests.refused($$select refresh_demo_data()$$));

-- Billing and suspension (the platform acts with the service role)
select tests.login(null);
insert into platform_invoices(firm_id, invoice_number, description, amount, due_date)
  values (:'f2', platform_next_invoice_number(), 'Starter plan, monthly', 49, current_date - 1);
select tests.ok('platform invoice numbers run on', platform_next_invoice_number() like 'ACTA-%-0002');
select tests.ok('the overview shows each firm''s people, balance and overdue invoices',
  (select members = 2 and seats_used = 3 and amount_due = 49 and overdue = 1 and owner_email = 'owner@chik.test' and matters = 1
   from platform_firm_overview() where id = :'f2'));
select tests.login(:'Q'); set role authenticated;
select tests.ok('a partner sees their own Acta invoices', (select count(*) from platform_invoices) = 1);
select tests.ok('but cannot change them', tests.refused($$update platform_invoices set status = 'paid', paid_on = current_date$$));
select tests.ok('plans, firms and other firms'' accounts are hidden',
  tests.refused($$select * from firms$$) and tests.refused($$select * from platform_plans$$)
  and tests.refused($$select * from platform_firm_overview()$$));
reset role;
select tests.login(:'P'); set role authenticated;
select tests.ok('other firms'' Acta invoices are hidden', (select count(*) from platform_invoices) = 0);
reset role;
update firms set status = 'suspended' where id = :'f2';
select tests.login(:'Q'); set role authenticated;
select tests.ok('a suspended firm sees none of its data',
  (select count(*) from clients) + (select count(*) from matters) + (select count(*) from firm_settings) = 0);
select tests.ok('or its document files', not can_read_document_file(:'Q' || '/anything.pdf'));
select tests.ok('but can see why, and its unpaid invoice',
  (select status from my_firm()) = 'suspended' and (select count(*) from platform_invoices) = 1);
reset role;
update firms set status = 'active' where id = :'f2';

-- Public intake goes to the named firm
select tests.login(null); set role anon;
select tests.ok('a firm''s name is public by its web address', (select firm_name from public_firm_profile('chikwanha-law')) = 'Chikwanha Law');
select tests.ok('a suspended or unknown firm shows nothing', not exists (select 1 from public_firm_profile('no-such-firm')));
reset role;
select submit_client_intake('Rudo Banda', 'rudo@mail.test', '', 'family', 'Ex', '', 'Needs help with maintenance.', null, 'chikwanha-law') as intake_id \gset
select tests.ok('intake submissions go to the named firm', (select firm_id from inquiries where id = :'intake_id') = :'f2');
select tests.ok('with several firms, an intake must name one',
  tests.refused($$select submit_client_intake('Rudo Banda', 'rudo2@mail.test', '', 'family', 'Ex', '', 'Needs help with maintenance.')$$));

select 'All access-rule checks passed.';
