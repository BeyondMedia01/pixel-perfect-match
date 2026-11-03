-- Demo data for the Makoni & Partners reference build.
-- Not a migration: run it by hand on a demo database only, after all migrations.
-- The billing rows attach to the profile with the email below; change it to your demo account.

insert into public.clients (id, type, name, id_number, email, phone, address, notes) values
('11111111-0000-0000-0000-000000000001','company','Mhondoro Holdings (Pvt) Ltd','REG 4471/2011','legal@mhondoro.co.zw','+263 242 700 112','14 Samora Machel Ave, Harare','Long-standing corporate client. Retainer agreement in place.'),
('11111111-0000-0000-0000-000000000002','individual','Tendai Moyo','63-221874-K-42','tendai.moyo@gmail.com','+263 77 412 3390','22 Borrowdale Rd, Harare','Referred by Mhondoro Holdings.'),
('11111111-0000-0000-0000-000000000003','company','Zambezi Logistics Ltd','REG 1182/2015','ops@zambezilog.com','+263 292 881 004','Plot 9, Belmont Industrial, Bulawayo',null),
('11111111-0000-0000-0000-000000000004','individual','Rudo Chikwanha','08-554201-F-08','rudo.c@outlook.com','+263 71 220 9981','5 Cecil Rd, Avondale, Harare','Prefers contact by email.'),
('11111111-0000-0000-0000-000000000005','company','Kariba Sun Hotels','REG 902/2008','gm@karibasun.co.zw','+263 261 214 550','Lakeshore Drive, Kariba',null),
('11111111-0000-0000-0000-000000000006','individual','Farai Ncube','29-110345-B-29','farai.ncube@yahoo.com','+263 78 600 1145','41 Hillside Rd, Bulawayo',null),
('11111111-0000-0000-0000-000000000007','company','Greenfields Agro Co-operative','REG 3310/2019','admin@greenfields.coop','+263 39 226 701','Masvingo Road, Masvingo','Co-operative of 140 members.'),
('11111111-0000-0000-0000-000000000008','individual','Nyasha Mutasa','75-990012-T-75','nyasha.m@gmail.com','+263 77 831 2207','18 Fife St, Gweru',null),
('11111111-0000-0000-0000-000000000009','company','Highveld Medical Group','REG 2205/2013','finance@highveldmed.co.zw','+263 242 336 980','3 Baines Ave, Harare',null),
('11111111-0000-0000-0000-000000000010','individual','Chipo Dube','14-778320-L-14','chipo.dube@icloud.com','+263 73 455 6612','7 Golden Stairs Rd, Harare','Matter is sensitive — limit discussion.');

insert into public.matters (id, title, client_id, practice_area, status, opposing_party, opposing_counsel, court, case_number, description, date_opened, date_closed) values
('22222222-0000-0000-0000-000000000001','Mhondoro v Sable Mining — breach of supply contract','11111111-0000-0000-0000-000000000001','litigation','active','Sable Mining (Pvt) Ltd','Gill, Godlonton & Gerrans','High Court, Harare','HC 2214/26','Claim for USD 1.2m in unpaid deliveries.','2026-02-11',null),
('22222222-0000-0000-0000-000000000002','Acquisition of Pamberi Packaging shares','11111111-0000-0000-0000-000000000001','corporate','active','Pamberi Packaging shareholders','Atherstone & Cook',null,null,'Due diligence and SPA drafting.','2026-05-03',null),
('22222222-0000-0000-0000-000000000003','Transfer of Stand 1123 Borrowdale','11111111-0000-0000-0000-000000000002','conveyancing','active','Joseph Banda',null,'Deeds Office, Harare',null,'Purchase of residential property.','2026-07-20',null),
('22222222-0000-0000-0000-000000000004','Zambezi Logistics — wrongful dismissal claim','11111111-0000-0000-0000-000000000003','labour','active','Peter Sibanda','Mtetwa & Nyambirai','Labour Court, Bulawayo','LC/B/118/26','Former driver alleges unfair dismissal.','2026-03-15',null),
('22222222-0000-0000-0000-000000000005','Chikwanha divorce and custody','11111111-0000-0000-0000-000000000004','family','active','Simba Chikwanha','Scanlen & Holderness','High Court, Harare','HC 5501/26','Contested custody of two minors.','2026-04-02',null),
('22222222-0000-0000-0000-000000000006','Kariba Sun lease renewal','11111111-0000-0000-0000-000000000005','corporate','on_hold','Kariba Municipality',null,null,null,'Awaiting municipal council resolution.','2026-01-19',null),
('22222222-0000-0000-0000-000000000007','State v Ncube — fraud charges','11111111-0000-0000-0000-000000000006','criminal','active','The State','National Prosecuting Authority','Magistrates Court, Bulawayo','CRB 3390/26','Defence of client on three counts of fraud.','2026-06-08',null),
('22222222-0000-0000-0000-000000000008','Greenfields land tenure dispute','11111111-0000-0000-0000-000000000007','litigation','intake','Masvingo Rural District Council',null,'Administrative Court',null,'Dispute over allocation of 300ha.','2026-10-12',null),
('22222222-0000-0000-0000-000000000009','Mutasa estate administration','11111111-0000-0000-0000-000000000008','other','active',null,null,'Master of the High Court','DR 1440/26','Winding up estate of late father.','2026-05-27',null),
('22222222-0000-0000-0000-000000000010','Highveld Medical — supplier agreement review','11111111-0000-0000-0000-000000000009','corporate','closed','MedPharm Distributors',null,null,null,'Review and negotiation of supply terms.','2026-01-08','2026-04-30'),
('22222222-0000-0000-0000-000000000011','Dube protection order','11111111-0000-0000-0000-000000000010','family','active','Tinashe Dube',null,'Magistrates Court, Harare','DV 220/26','Urgent protection order application.','2026-09-29',null),
('22222222-0000-0000-0000-000000000012','Zambezi Logistics fleet finance facility','11111111-0000-0000-0000-000000000003','corporate','active','CBZ Bank','Wintertons',null,null,'Security documents for USD 4m facility.','2026-08-14',null),
('22222222-0000-0000-0000-000000000013','Highveld Medical — negligence claim defence','11111111-0000-0000-0000-000000000009','litigation','active','Grace Mlambo','Mbidzo, Muchadehama & Makoni','High Court, Harare','HC 7012/26','Defence of alleged surgical negligence claim.','2026-06-30',null),
('22222222-0000-0000-0000-000000000014','Sale of Kariba staff housing units','11111111-0000-0000-0000-000000000005','conveyancing','intake','Various purchasers',null,'Deeds Office, Harare',null,'Subdivision and sale of 12 units.','2026-10-05',null),
('22222222-0000-0000-0000-000000000015','Moyo v Banda — deposit recovery','11111111-0000-0000-0000-000000000002','litigation','on_hold','Joseph Banda',null,'Magistrates Court, Harare','CIV 881/26','Recovery of deposit paid on earlier sale.','2026-03-03',null),
('22222222-0000-0000-0000-000000000016','Greenfields co-op constitution redraft','11111111-0000-0000-0000-000000000007','corporate','active',null,null,null,null,'Update governance documents.','2026-07-01',null),
('22222222-0000-0000-0000-000000000017','Highveld Medical — staff retrenchment','11111111-0000-0000-0000-000000000009','labour','active','Hospital Workers Union',null,'Retrenchment Board','RB/22/26','Retrenchment of 18 staff.','2026-08-22',null),
('22222222-0000-0000-0000-000000000018','Mutasa — Gweru property transfer','11111111-0000-0000-0000-000000000008','conveyancing','closed','Estate Late Mutasa',null,'Deeds Office, Bulawayo',null,'Transfer to heirs complete.','2026-02-14','2026-06-20'),
('22222222-0000-0000-0000-000000000019','State v Ncube — bail appeal','11111111-0000-0000-0000-000000000006','criminal','closed','The State','National Prosecuting Authority','High Court, Bulawayo','B 404/26','Bail granted on appeal.','2026-06-10','2026-06-25'),
('22222222-0000-0000-0000-000000000020','Mhondoro trademark registration','11111111-0000-0000-0000-000000000001','other','intake',null,null,'ZIPO',null,'Register MHONDORO word mark in classes 6 and 37.','2026-10-16',null);

insert into public.related_parties (matter_id, name, role, organisation) values
('22222222-0000-0000-0000-000000000001','Sable Mining (Pvt) Ltd','opposing_party',null),
('22222222-0000-0000-0000-000000000001','Adv. T. Mpofu','opposing_counsel','Gill, Godlonton & Gerrans'),
('22222222-0000-0000-0000-000000000004','Peter Sibanda','opposing_party',null),
('22222222-0000-0000-0000-000000000005','Simba Chikwanha','opposing_party',null),
('22222222-0000-0000-0000-000000000007','Linda Moyo','witness','Ncube Traders'),
('22222222-0000-0000-0000-000000000013','Grace Mlambo','opposing_party',null),
('22222222-0000-0000-0000-000000000003','Joseph Banda','related_party','Seller');

insert into public.events (matter_id, title, type, starts_at, location, reminder_days) values
('22222222-0000-0000-0000-000000000001','Pre-trial conference','court_date', date_trunc('day', now()) + interval '9 hours','High Court, Court 4','{1,3}'),
('22222222-0000-0000-0000-000000000005','Custody hearing','hearing', date_trunc('day', now()) + interval '14 hours','High Court, Chamber 2','{1,7}'),
('22222222-0000-0000-0000-000000000004','File heads of argument','filing_deadline', now() + interval '30 hours',null,'{1,3}'),
('22222222-0000-0000-0000-000000000007','Trial — day 1','court_date', date_trunc('day', now()) + interval '3 days 9 hours','Magistrates Court, Bulawayo','{1,3,7}'),
('22222222-0000-0000-0000-000000000002','Due diligence meeting with sellers','meeting', date_trunc('day', now()) + interval '2 days 11 hours','Our boardroom','{1}'),
('22222222-0000-0000-0000-000000000013','Plea deadline','filing_deadline', now() + interval '5 days',null,'{1,3}'),
('22222222-0000-0000-0000-000000000011','Return date — protection order','hearing', date_trunc('day', now()) + interval '6 days 10 hours','Magistrates Court, Harare','{1}'),
('22222222-0000-0000-0000-000000000012','Signing of security documents','meeting', date_trunc('day', now()) + interval '12 days 15 hours','CBZ Head Office','{1}');

insert into public.tasks (matter_id, title, priority, status, due_date) values
('22222222-0000-0000-0000-000000000001','Prepare discovery affidavit','high','in_progress', current_date),
('22222222-0000-0000-0000-000000000001','Brief counsel on trial strategy','medium','todo', current_date + 4),
('22222222-0000-0000-0000-000000000004','Draft heads of argument','urgent','in_progress', current_date + 1),
('22222222-0000-0000-0000-000000000005','Obtain social welfare report','high','waiting', current_date + 3),
('22222222-0000-0000-0000-000000000003','Lodge transfer documents','medium','todo', current_date + 6),
('22222222-0000-0000-0000-000000000007','Interview witness Linda Moyo','high','todo', current_date + 2),
('22222222-0000-0000-0000-000000000002','Review audited financials','medium','in_progress', current_date + 5),
('22222222-0000-0000-0000-000000000009','File first liquidation account','low','todo', current_date + 14),
('22222222-0000-0000-0000-000000000013','Obtain hospital theatre records','high','todo', current_date),
('22222222-0000-0000-0000-000000000010','Archive closed file','low','done', current_date - 10);

insert into public.notes (matter_id, body, created_at) values
('22222222-0000-0000-0000-000000000001','Client confirmed delivery notes for March–June are available. Collect originals.', now() - interval '2 days'),
('22222222-0000-0000-0000-000000000005','Client concerned about relocation; consider interim order.', now() - interval '1 day'),
('22222222-0000-0000-0000-000000000007','Prosecutor indicated openness to plea discussion on count 3.', now() - interval '3 hours');

-- demo billing data on seeded matters
INSERT INTO public.time_entries (matter_id, user_id, entry_date, description, hours, hourly_rate)
SELECT m.id, p.id, current_date - 12, 'Initial consultation and case assessment', 1.5, 250
FROM public.matters m, public.profiles p WHERE m.matter_number = '2026-0001' AND p.email = 'bechanibk@gmail.com';
INSERT INTO public.time_entries (matter_id, user_id, entry_date, description, hours, hourly_rate)
SELECT m.id, p.id, current_date - 9, 'Draft letter of demand to Sable Mining', 2.0, 250
FROM public.matters m, public.profiles p WHERE m.matter_number = '2026-0001' AND p.email = 'bechanibk@gmail.com';
INSERT INTO public.time_entries (matter_id, user_id, entry_date, description, hours, hourly_rate)
SELECT m.id, p.id, current_date - 4, 'Review of supply contract and breach analysis', 3.5, 250
FROM public.matters m, public.profiles p WHERE m.matter_number = '2026-0001' AND p.email = 'bechanibk@gmail.com';
INSERT INTO public.time_entries (matter_id, user_id, entry_date, description, hours, hourly_rate, billable)
SELECT m.id, p.id, current_date - 2, 'Internal team briefing (non-billable)', 1.0, 0, false
FROM public.matters m, public.profiles p WHERE m.matter_number = '2026-0001' AND p.email = 'bechanibk@gmail.com';
INSERT INTO public.time_entries (matter_id, user_id, entry_date, description, hours, hourly_rate)
SELECT m.id, p.id, current_date - 6, 'Consultation on estate planning options', 2.0, 220
FROM public.matters m, public.profiles p WHERE m.matter_number = '2026-0003' AND p.email = 'bechanibk@gmail.com';
INSERT INTO public.time_entries (matter_id, user_id, entry_date, description, hours, hourly_rate)
SELECT m.id, p.id, current_date - 3, 'Draft will and testament', 2.5, 220
FROM public.matters m, public.profiles p WHERE m.matter_number = '2026-0003' AND p.email = 'bechanibk@gmail.com';

-- one paid invoice on 2026-0003 covering two earlier entries
INSERT INTO public.invoices (invoice_number, matter_id, client_id, status, issue_date, due_date, created_by)
SELECT 'INV-2026-0001', m.id, m.client_id, 'paid', current_date - 20, current_date - 20 + 30, p.id
FROM public.matters m, public.profiles p WHERE m.matter_number = '2026-0003' AND p.email = 'bechanibk@gmail.com';
INSERT INTO public.invoice_items (invoice_id, description, quantity, unit_price)
SELECT i.id, 'Estate planning consultation', 2.0, 220 FROM public.invoices i WHERE i.invoice_number = 'INV-2026-0001';
INSERT INTO public.invoice_items (invoice_id, description, quantity, unit_price)
SELECT i.id, 'Drafting of will', 1.0, 440 FROM public.invoices i WHERE i.invoice_number = 'INV-2026-0001';