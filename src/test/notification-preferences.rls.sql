-- Run after npm run test:rls against the same throwaway local database.
\set ON_ERROR_STOP on
begin;
select tests.login('aaaaaaaa-0000-0000-0000-000000000002'); set role authenticated;
insert into notification_preferences(user_id, new_inquiries, email_new_inquiries, whatsapp_tasks_due_today)
values ('aaaaaaaa-0000-0000-0000-000000000002', false, true, true);
select tests.ok('channel preferences persist independently', (select not new_inquiries and tasks_due_today and email_new_inquiries and not email_tasks_due_today and whatsapp_tasks_due_today and not whatsapp_new_inquiries from notification_preferences));
select tests.ok('staff cannot save another person preferences', tests.refused($$insert into notification_preferences(user_id, email_new_inquiries) values ('aaaaaaaa-0000-0000-0000-000000000001', true)$$));
update notification_preferences set email_tasks_due_today = true;
select tests.ok('staff can update own channel preferences', (select email_tasks_due_today from notification_preferences));
reset role;
select tests.login('aaaaaaaa-0000-0000-0000-000000000001'); set role authenticated;
select tests.ok('partner cannot read another person preferences', (select count(*) from notification_preferences) = 0);
select tests.ok('partner cannot change another person preferences', tests.refused($$update notification_preferences set email_new_inquiries = false$$));
reset role;
select tests.login(null); set role anon;
select tests.ok('anonymous visitors cannot read preferences', tests.refused($$select * from notification_preferences$$));
reset role;
rollback;