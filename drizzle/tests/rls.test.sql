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

-- ===== Sign-up and approval =====
insert into auth.users(id, email) values (:'P', 'partner@test');
insert into auth.users(id, email) values (:'L', 'lawyer@test'), (:'A', 'para@test'), (:'F', 'desk@test'), (:'X', 'pending@test');
select tests.ok('first sign-up becomes partner, later ones get no role',
  (select array_agg(user_id) from user_roles) = array[:'P'::uuid]);

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
insert into user_roles(user_id, role) values (:'L', 'lawyer'), (:'A', 'paralegal'), (:'F', 'frontdesk');
select tests.ok('partner sees the pending account', exists (select 1 from profiles where id = :'X'));
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
select set_user_role(:'X', 'paralegal');
select tests.ok('partner approves a pending account in one step',
  (select array_agg(role::text) from user_roles where user_id = :'X') = array['paralegal']);
reset role;

-- ===== Team invitations =====
select tests.login(:'L'); set role authenticated;
select tests.ok('only partners can invite', tests.refused($$select invite_team_member('someone@firm.test', 'Someone', 'lawyer')$$));
reset role;
select tests.login(:'P'); set role authenticated;
select tests.ok('partner invites a new person by email', invite_team_member('  Newbie@Firm.test ', 'New Bie', 'lawyer') = 'invited');
select tests.ok('cannot invite someone already on the team', tests.refused($$select invite_team_member('lawyer@test', 'L', 'paralegal')$$));
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

-- ===== Storage =====
select tests.ok('documents bucket is private', not (select public from storage.buckets where id = 'matter-documents'));

select 'All access-rule checks passed.';
