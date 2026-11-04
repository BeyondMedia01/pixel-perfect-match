-- Many firms in one Acta, and a platform (Revixions) side for plans and billing.
--
-- Every row of firm data now belongs to a firm. One restrictive policy per
-- table keeps each firm to its own rows, on top of the existing access rules,
-- and the SECURITY DEFINER helpers (which skip row security) check the firm
-- themselves. A firm that is suspended or cancelled sees no firm data.
-- Everything that existed before becomes the first firm.

-- ===== Plans, firms, platform invoices =====
CREATE TABLE public.platform_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 60),
  description text CHECK (description IS NULL OR length(description) <= 300),
  monthly_price numeric(10,2) NOT NULL CHECK (monthly_price >= 0),
  annual_price numeric(10,2) CHECK (annual_price IS NULL OR annual_price >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  user_limit integer CHECK (user_limit IS NULL OR user_limit > 0),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.platform_plans (name, description, monthly_price, annual_price, user_limit, sort_order) VALUES
  ('Starter', 'Sole practitioners and small practices.', 49, 490, 3, 1),
  ('Practice', 'Growing firms.', 129, 1290, 10, 2),
  ('Firm', 'Larger firms, no user limit.', 299, 2990, NULL, 3);

CREATE TABLE public.firms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 120),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$'),
  status text NOT NULL DEFAULT 'trial' CHECK (status IN ('trial', 'active', 'past_due', 'suspended', 'cancelled')),
  plan_id uuid REFERENCES public.platform_plans(id) ON DELETE SET NULL,
  billing_cycle text NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'annual')),
  custom_price numeric(10,2) CHECK (custom_price IS NULL OR custom_price >= 0),
  trial_ends_at date,
  next_billing_date date,
  billing_email text CHECK (billing_email IS NULL OR billing_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  notes text CHECK (notes IS NULL OR length(notes) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER firms_touch BEFORE UPDATE ON public.firms FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.platform_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  invoice_number text NOT NULL UNIQUE,
  description text NOT NULL,
  period_start date,
  period_end date,
  amount numeric(10,2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'due' CHECK (status IN ('due', 'paid', 'void')),
  issued_on date NOT NULL DEFAULT current_date,
  due_date date NOT NULL,
  paid_on date,
  payment_method text CHECK (payment_method IS NULL OR length(payment_method) <= 60),
  payment_reference text CHECK (payment_reference IS NULL OR length(payment_reference) <= 120),
  notes text CHECK (notes IS NULL OR length(notes) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'paid' OR paid_on IS NOT NULL)
);
CREATE INDEX platform_invoices_firm ON public.platform_invoices (firm_id, issued_on DESC);
CREATE TABLE public.platform_invoice_counters (year integer PRIMARY KEY, last_number integer NOT NULL);

REVOKE ALL ON public.platform_plans, public.firms, public.platform_invoices, public.platform_invoice_counters
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.platform_plans, public.firms, public.platform_invoices, public.platform_invoice_counters TO service_role;
ALTER TABLE public.platform_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_invoice_counters ENABLE ROW LEVEL SECURITY;

-- The first firm: everything already in this workspace.
INSERT INTO public.firms (id, name, slug, status, plan_id)
SELECT '00000000-0000-4000-8000-0000000000f1',
       coalesce(nullif(trim(firm_name), ''), 'My firm'),
       'firm-1', 'active',
       (SELECT id FROM public.platform_plans WHERE name = 'Firm')
FROM public.firm_settings WHERE id = 1;
INSERT INTO public.firms (id, name, slug, status)
  VALUES ('00000000-0000-4000-8000-0000000000f1', 'My firm', 'firm-1', 'active') ON CONFLICT DO NOTHING;

-- ===== Who belongs to which firm =====
ALTER TABLE public.profiles ADD COLUMN firm_id uuid REFERENCES public.firms(id) ON DELETE SET NULL;
UPDATE public.profiles SET firm_id = '00000000-0000-4000-8000-0000000000f1';
CREATE INDEX profiles_firm ON public.profiles (firm_id);

-- The caller's firm, if it may use Acta. Server jobs with no signed-in user
-- (demo set-up) can name a firm with set_config('acta.firm_id', …).
CREATE OR REPLACE FUNCTION public.current_firm_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select case
    when auth.uid() is not null then (
      select p.firm_id from public.profiles p join public.firms f on f.id = p.firm_id
      where p.id = auth.uid() and f.status in ('trial', 'active', 'past_due'))
    else nullif(current_setting('acta.firm_id', true), '')::uuid
  end
$$;
-- Someone else's firm, same rule (for the calendar feed and sync).
CREATE OR REPLACE FUNCTION public.user_firm_id(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select p.firm_id from public.profiles p join public.firms f on f.id = p.firm_id
  where p.id = _user_id and f.status in ('trial', 'active', 'past_due')
$$;
CREATE OR REPLACE FUNCTION public.same_firm(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select _user_id = auth.uid() or (
    public.current_firm_id() is not null
    and exists (select 1 from public.profiles p where p.id = _user_id and p.firm_id = public.current_firm_id()))
$$;
-- Files in the documents bucket live under the uploader's id.
CREATE OR REPLACE FUNCTION public.same_firm_path(_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select split_part(_path, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and public.same_firm(split_part(_path, '/', 1)::uuid)
$$;
-- Policies call these for signed-out requests too; they return nothing useful then.
REVOKE EXECUTE ON FUNCTION public.current_firm_id(), public.user_firm_id(uuid), public.same_firm(uuid), public.same_firm_path(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_firm_id(), public.user_firm_id(uuid), public.same_firm(uuid), public.same_firm_path(text) TO anon, authenticated, service_role;

-- Only the platform, or a partner's invitation (invite_team_member), moves people into a firm.
CREATE OR REPLACE FUNCTION public.guard_profile_firm()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
begin
  if new.firm_id is distinct from old.firm_id and auth.uid() is not null
     and coalesce(current_setting('acta.moving_firm', true), '') <> 'on' then
    raise exception 'Your firm can''t be changed here' using errcode = '42501';
  end if;
  return new;
end; $$;
CREATE TRIGGER profiles_guard_firm BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_firm();

CREATE POLICY "own firm only" ON public.profiles AS RESTRICTIVE FOR ALL TO authenticated, anon
  USING (id = auth.uid() OR (firm_id IS NOT NULL AND firm_id = public.current_firm_id()))
  WITH CHECK (id = auth.uid() OR (firm_id IS NOT NULL AND firm_id = public.current_firm_id()));
CREATE POLICY "own firm only" ON public.user_roles AS RESTRICTIVE FOR ALL TO authenticated, anon
  USING (public.same_firm(user_id)) WITH CHECK (public.same_firm(user_id));

-- ===== A firm on every row of firm data =====
DO $$
declare
  t text;
begin
  foreach t in array array[
    'activity_log', 'announcements', 'billing_rates', 'client_intake_submissions', 'clients',
    'documents', 'events', 'inquiries', 'invoice_items', 'invoices', 'matter_assignments',
    'matter_ethical_walls', 'matters', 'notes', 'related_parties', 'tasks', 'team_invitations',
    'time_entries'
  ] loop
    execute format('alter table public.%I add column firm_id uuid references public.firms(id) on delete cascade', t);
    execute format('update public.%I set firm_id = %L', t, '00000000-0000-4000-8000-0000000000f1');
    execute format('alter table public.%I alter column firm_id set default public.current_firm_id()', t);
    execute format('alter table public.%I alter column firm_id set not null', t);
    execute format('create index %I on public.%I (firm_id)', t || '_firm', t);
    execute format(
      'create policy "own firm only" on public.%I as restrictive for all to authenticated, anon
         using (firm_id = public.current_firm_id()) with check (firm_id = public.current_firm_id())', t);
  end loop;
end $$;

-- Firm profile: one row per firm.
ALTER TABLE public.firm_settings ADD COLUMN firm_id uuid REFERENCES public.firms(id) ON DELETE CASCADE;
UPDATE public.firm_settings SET firm_id = '00000000-0000-4000-8000-0000000000f1';
ALTER TABLE public.firm_settings DROP CONSTRAINT firm_settings_pkey;
ALTER TABLE public.firm_settings DROP COLUMN id;
ALTER TABLE public.firm_settings ALTER COLUMN firm_id SET NOT NULL;
ALTER TABLE public.firm_settings ADD PRIMARY KEY (firm_id);
CREATE POLICY "own firm only" ON public.firm_settings AS RESTRICTIVE FOR ALL TO authenticated, anon
  USING (firm_id = public.current_firm_id()) WITH CHECK (firm_id = public.current_firm_id());

-- Numbers run per firm.
ALTER TABLE public.matters DROP CONSTRAINT matters_matter_number_key;
ALTER TABLE public.matters ADD CONSTRAINT matters_firm_number UNIQUE (firm_id, matter_number);
ALTER TABLE public.invoices DROP CONSTRAINT invoices_invoice_number_key;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_firm_number UNIQUE (firm_id, invoice_number);
ALTER TABLE public.invoice_counters ADD COLUMN firm_id uuid REFERENCES public.firms(id) ON DELETE CASCADE;
UPDATE public.invoice_counters SET firm_id = '00000000-0000-4000-8000-0000000000f1';
ALTER TABLE public.invoice_counters DROP CONSTRAINT invoice_counters_pkey;
ALTER TABLE public.invoice_counters ALTER COLUMN firm_id SET NOT NULL;
ALTER TABLE public.invoice_counters ADD PRIMARY KEY (firm_id, year);
CREATE TABLE public.matter_counters (
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  year integer NOT NULL,
  last_number integer NOT NULL,
  PRIMARY KEY (firm_id, year)
);
REVOKE ALL ON public.matter_counters FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.matter_counters TO service_role;
ALTER TABLE public.matter_counters ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_matter_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare
  y int := extract(year from coalesce(new.date_opened, current_date))::int;
  highest int;
  n int;
begin
  if new.matter_number is null then
    select coalesce(max(split_part(matter_number, '-', 2)::int), 0) into highest
      from public.matters where firm_id = new.firm_id and matter_number ~ ('^' || y || '-[0-9]+$');
    insert into public.matter_counters as c (firm_id, year, last_number) values (new.firm_id, y, highest + 1)
      on conflict (firm_id, year) do update set last_number = greatest(c.last_number, highest) + 1
      returning last_number into n;
    new.matter_number := y || '-' || lpad(n::text, 4, '0');
  end if;
  return new;
end; $$;

CREATE OR REPLACE FUNCTION public.next_invoice_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare
  y int := extract(year from current_date)::int;
  f uuid := public.current_firm_id();
  highest int;
  n int;
begin
  if not public.has_role(auth.uid(), 'admin') or f is null then
    raise exception 'Only a partner can issue invoice numbers' using errcode = '42501';
  end if;
  select coalesce(max(split_part(invoice_number, '-', 3)::int), 0) into highest
    from public.invoices where firm_id = f and invoice_number ~ ('^INV-' || y || '-[0-9]+$');
  insert into public.invoice_counters as c (firm_id, year, last_number) values (f, y, highest + 1)
    on conflict (firm_id, year) do update set last_number = greatest(c.last_number, highest) + 1
    returning last_number into n;
  return 'INV-' || y || '-' || lpad(n::text, 4, '0');
end; $$;

-- ===== Helpers that skip row security now check the firm =====
CREATE OR REPLACE FUNCTION public.user_can_access_matter(_matter_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select exists (
    select 1 from public.matters m where m.id = _matter_id and m.firm_id = public.user_firm_id(_user_id)
  ) and not exists (
    select 1 from public.matter_ethical_walls w where w.matter_id = _matter_id and w.user_id = _user_id
  ) and (
    public.has_role(_user_id, 'admin')
    or exists (select 1 from public.matters m where m.id = _matter_id and m.responsible_lawyer_id = _user_id)
    or exists (select 1 from public.matter_assignments a where a.matter_id = _matter_id and a.user_id = _user_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.can_access_client(_client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select public.is_internal(auth.uid())
    and exists (select 1 from public.clients c where c.id = _client_id and c.firm_id = public.current_firm_id())
    and (
      exists (
        select 1 from public.matters m
        where m.client_id = _client_id
          and (public.can_access_matter(m.id)
               or (m.created_by = auth.uid() and not exists (
                     select 1 from public.matter_ethical_walls w where w.matter_id = m.id and w.user_id = auth.uid())))
      )
      or (
        (public.has_role(auth.uid(), 'admin')
         or exists (select 1 from public.clients c where c.id = _client_id and c.created_by = auth.uid()))
        and not exists (
          select 1 from public.matters m join public.matter_ethical_walls w on w.matter_id = m.id
          where m.client_id = _client_id and w.user_id = auth.uid())
      )
    )
$$;

CREATE OR REPLACE FUNCTION public.can_read_document_file(_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select public.is_internal(auth.uid()) and case
    when exists (select 1 from public.documents d where d.file_path = _path)
      then exists (select 1 from public.documents d where d.file_path = _path
                   and d.firm_id = public.current_firm_id()
                   and (d.matter_id is null or public.can_access_matter(d.matter_id)))
    else split_part(_path, '/', 1) = auth.uid()::text
         or (public.has_role(auth.uid(), 'admin') and public.same_firm_path(_path))
  end
$$;
DROP POLICY "uploader or partner deletes document files" ON storage.objects;
CREATE POLICY "uploader or partner deletes document files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'matter-documents' AND public.is_internal(auth.uid())
         AND (split_part(name, '/', 1) = auth.uid()::text
              OR (public.has_role(auth.uid(), 'admin') AND public.same_firm_path(name))));

-- Logos go under the firm's id.
DROP POLICY "partners upload firm assets" ON storage.objects;
DROP POLICY "partners update firm assets" ON storage.objects;
DROP POLICY "partners delete firm assets" ON storage.objects;
CREATE POLICY "partners upload firm assets" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'firm-assets' AND public.has_role(auth.uid(), 'admin')
              AND split_part(name, '/', 1) = public.current_firm_id()::text);
CREATE POLICY "partners update firm assets" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'firm-assets' AND public.has_role(auth.uid(), 'admin')
         AND split_part(name, '/', 1) = public.current_firm_id()::text);
CREATE POLICY "partners delete firm assets" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'firm-assets' AND public.has_role(auth.uid(), 'admin')
         AND (split_part(name, '/', 1) = public.current_firm_id()::text
              OR name = (select logo_path from public.firm_settings where firm_id = public.current_firm_id())));

CREATE OR REPLACE FUNCTION public.client_directory()
RETURNS TABLE(id uuid, name text, type client_type) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select c.id, c.name, c.type from public.clients c
  where public.is_internal(auth.uid()) and c.firm_id = public.current_firm_id()
    and not exists (
      select 1 from public.matters m join public.matter_ethical_walls w on w.matter_id = m.id
      where m.client_id = c.id and w.user_id = auth.uid())
  order by c.name
$$;

CREATE OR REPLACE FUNCTION public.matter_directory()
RETURNS TABLE(id uuid, matter_number text, title text, status matter_status, practice_area practice_area, date_opened date, client_name text, lawyer_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select m.id, m.matter_number, m.title, m.status, m.practice_area, m.date_opened, c.name, p.full_name
  from public.matters m
  join public.clients c on c.id = m.client_id
  left join public.profiles p on p.id = m.responsible_lawyer_id
  where public.is_frontdesk(auth.uid()) and m.firm_id = public.current_firm_id()
    and not exists (select 1 from public.matter_ethical_walls w where w.matter_id = m.id and w.user_id = auth.uid())
  order by m.matter_number desc
$$;

CREATE OR REPLACE FUNCTION public.conflict_check(q text)
RETURNS TABLE(source text, name text, detail text, matter_number text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  with f as (select public.current_firm_id() as id where public.is_internal(auth.uid()))
  select * from (
    select 'client'::text, c.name, c.type::text, null::text from public.clients c, f
      where c.firm_id = f.id and c.name ilike '%' || q || '%'
    union all
    select 'opposing_party', m.opposing_party, m.title, m.matter_number from public.matters m, f
      where m.firm_id = f.id and m.opposing_party ilike '%' || q || '%'
    union all
    select rp.role::text, rp.name, m.title, m.matter_number from public.related_parties rp join public.matters m on m.id = rp.matter_id, f
      where rp.firm_id = f.id and rp.name ilike '%' || q || '%'
    union all
    select 'prospect', i.name, 'Inquiry (' || i.status::text || ')', null::text from public.inquiries i, f
      where i.firm_id = f.id and i.status <> 'accepted' and i.name ilike '%' || q || '%'
    union all
    select 'inquiry_opposing', i.opposing_party, 'Opposing party in an inquiry (' || i.status::text || ')', null::text from public.inquiries i, f
      where i.firm_id = f.id and i.status <> 'accepted' and i.opposing_party <> '' and i.opposing_party ilike '%' || q || '%'
  ) s limit 50
$$;

CREATE OR REPLACE FUNCTION public.conflict_check_count(q text)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
declare
  f uuid := public.current_firm_id();
begin
  if not (public.is_internal(auth.uid()) or public.is_frontdesk(auth.uid())) or f is null then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  return (select count(*)::int from public.clients c where c.firm_id = f and c.name ilike '%' || q || '%')
       + (select count(*)::int from public.matters m where m.firm_id = f and m.opposing_party ilike '%' || q || '%')
       + (select count(*)::int from public.related_parties rp where rp.firm_id = f and rp.name ilike '%' || q || '%')
       + (select count(*)::int from public.inquiries i where i.firm_id = f and i.status <> 'accepted'
            and (i.name ilike '%' || q || '%' or (i.opposing_party <> '' and i.opposing_party ilike '%' || q || '%')));
end; $$;

CREATE OR REPLACE FUNCTION public.calendar_events_for_user(_user_id uuid)
RETURNS TABLE(id uuid, type text, title text, description text, location text, starts_at timestamptz, ends_at timestamptz, matter_id uuid, owner_id uuid, inquiry_id uuid, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select e.id, e.type::text,
         e.title || coalesce(' · ' || m.matter_number, ''),
         concat_ws(E'\n',
           case when m.id is not null then m.matter_number || ' ' || m.title end,
           case when e.type in ('court_date', 'filing_deadline') and e.filed_at is null and e.confirmed_by is null
                then 'Awaiting lawyer confirmation' end),
         e.location, e.starts_at, e.ends_at, e.matter_id, e.owner_id, e.inquiry_id, e.created_at
  from public.events e
  left join public.matters m on m.id = e.matter_id
  left join public.inquiries i on i.id = e.inquiry_id
  where public.is_internal(_user_id)
    and e.firm_id = public.user_firm_id(_user_id)
    and e.starts_at > now() - interval '60 days'
    and e.starts_at < now() + interval '400 days'
    and (
      (e.matter_id is null and (e.owner_id = _user_id or i.consult_with = _user_id))
      or (e.matter_id is not null and public.user_can_access_matter(e.matter_id, _user_id)
          and (m.responsible_lawyer_id = _user_id or e.owner_id = _user_id
               or exists (select 1 from public.matter_assignments a where a.matter_id = e.matter_id and a.user_id = _user_id)))
    )
$$;

CREATE OR REPLACE FUNCTION public.calendar_feed(_token text)
RETURNS TABLE(uid text, kind text, title text, description text, location text, starts_at timestamptz, ends_at timestamptz, all_day_date date, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  with me as (
    select f.user_id, public.user_firm_id(f.user_id) as firm_id from public.calendar_feeds f
    where f.token = _token and public.is_internal(f.user_id)
  )
  select 'event-' || e.id, e.type, e.title, e.description, e.location, e.starts_at, e.ends_at, null::date, e.created_at
  from me cross join lateral public.calendar_events_for_user(me.user_id) e
  union all
  select 'task-' || t.id, 'task', 'Task: ' || t.title || coalesce(' · ' || m.matter_number, ''),
         t.description, null, null, null, t.due_date, t.created_at
  from public.tasks t
  cross join me
  left join public.matters m on m.id = t.matter_id
  where t.firm_id = me.firm_id and t.assignee_id = me.user_id and t.status <> 'done' and t.due_date is not null
    and t.due_date > current_date - 60
    and (t.matter_id is null or not public.user_walled_from_matter(t.matter_id, me.user_id))
$$;

CREATE OR REPLACE FUNCTION public.log_matter_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  if tg_op = 'INSERT' then
    insert into public.activity_log(firm_id, entity_type, entity_id, matter_id, action, summary, user_id)
    values (new.firm_id, 'matter', new.id, new.id, 'created', 'Matter opened', auth.uid());
    return new;
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      insert into public.activity_log(firm_id, entity_type, entity_id, matter_id, action, summary, changes, user_id)
      values (new.firm_id, 'matter', new.id, new.id, 'status_changed', 'Status changed from ' || old.status || ' to ' || new.status,
        jsonb_build_object('from', old.status, 'to', new.status), auth.uid());
    else
      insert into public.activity_log(firm_id, entity_type, entity_id, matter_id, action, summary, user_id)
      values (new.firm_id, 'matter', new.id, new.id, 'updated', 'Matter details updated', auth.uid());
    end if;
    return new;
  else
    insert into public.activity_log(firm_id, entity_type, entity_id, matter_id, action, summary, user_id)
    values (old.firm_id, 'matter', old.id, null, 'deleted', 'Matter ' || old.matter_number || ' deleted', auth.uid());
    return old;
  end if;
end; $$;

CREATE OR REPLACE FUNCTION public.set_invoice_tax_rate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  if new.tax_rate is null then
    new.tax_rate := coalesce((select vat_rate from public.firm_settings where firm_id = new.firm_id), 0);
  end if;
  return new;
end; $$;

-- Name and logo for the sign-in and intake pages. With a firm's web address
-- (slug) it works signed out; without one it's the signed-in person's firm.
DROP FUNCTION public.public_firm_profile();
CREATE FUNCTION public.public_firm_profile(_slug text DEFAULT NULL)
RETURNS TABLE(firm_name text, logo_path text, slug text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select coalesce(s.firm_name, f.name), s.logo_path, f.slug
  from public.firms f left join public.firm_settings s on s.firm_id = f.id
  where f.status in ('trial', 'active', 'past_due')
    and case when _slug is not null then f.slug = lower(_slug) else f.id = public.current_firm_id() end
$$;
REVOKE EXECUTE ON FUNCTION public.public_firm_profile(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_firm_profile(text) TO anon, authenticated, service_role;

-- The public intake form names its firm. Old links without one still work
-- while the workspace has a single firm.
DROP FUNCTION public.submit_client_intake(text, text, text, practice_area, text, text, text, text);
CREATE FUNCTION public.submit_client_intake(_name text, _email text, _phone text, _area practice_area, _opposing text, _related text, _summary text, _ip_hash text DEFAULT NULL, _firm text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_id uuid; rate_key text; requests_count integer; max_requests integer; f uuid;
BEGIN
IF _firm IS NOT NULL THEN
  SELECT id INTO f FROM public.firms WHERE slug = lower(_firm) AND status IN ('trial', 'active', 'past_due');
ELSIF (SELECT count(*) FROM public.firms WHERE status IN ('trial', 'active', 'past_due')) = 1 THEN
  SELECT id INTO f FROM public.firms WHERE status IN ('trial', 'active', 'past_due');
END IF;
IF f IS NULL THEN RAISE EXCEPTION 'INTAKE_UNKNOWN_FIRM'; END IF;
IF length(trim(_name)) NOT BETWEEN 2 AND 100 OR length(_email) NOT BETWEEN 3 AND 255 OR _email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR length(_phone)>40 OR length(_opposing)>200 OR length(_related)>500 OR length(trim(_summary)) NOT BETWEEN 10 AND 3000 THEN RAISE EXCEPTION 'Invalid intake details'; END IF;
FOREACH rate_key IN ARRAY ARRAY['global:' || f, 'email:' || md5(lower(trim(_email))), CASE WHEN _ip_hash IS NOT NULL THEN 'ip:' || _ip_hash ELSE 'email:' || md5(lower(trim(_email))) || ':fallback' END] LOOP
max_requests := CASE WHEN rate_key LIKE 'global:%' THEN 100 WHEN rate_key LIKE 'ip:%' THEN 10 ELSE 3 END;
INSERT INTO public.intake_rate_limits AS r(key,window_start,requests) VALUES(rate_key,now(),1) ON CONFLICT(key) DO UPDATE SET requests=CASE WHEN r.window_start<now()-interval '1 hour' THEN 1 ELSE r.requests+1 END, window_start=CASE WHEN r.window_start<now()-interval '1 hour' THEN now() ELSE r.window_start END RETURNING requests INTO requests_count;
IF requests_count>max_requests THEN RAISE EXCEPTION 'INTAKE_RATE_LIMIT'; END IF;
END LOOP;
INSERT INTO public.inquiries(firm_id,name,contact,practice_area,opposing_party,related_names,summary,status) VALUES(f,trim(_name),trim(_email) || CASE WHEN trim(coalesce(_phone,''))<>'' THEN ' · ' || trim(_phone) ELSE '' END,_area,trim(_opposing),nullif(trim(_related),''),trim(_summary),'new') RETURNING id INTO new_id;
INSERT INTO public.client_intake_submissions(firm_id,inquiry_id,name,email,phone) VALUES(f,new_id,trim(_name),lower(trim(_email)),nullif(trim(_phone),''));
RETURN new_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.submit_client_intake(text, text, text, practice_area, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_client_intake(text, text, text, practice_area, text, text, text, text, text) TO service_role;

-- ===== Invitations carry the firm =====
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare
  inv public.team_invitations%rowtype;
begin
  select * into inv from public.team_invitations
    where lower(email) = lower(new.email) and accepted_at is null and revoked_at is null
    order by created_at desc limit 1;

  insert into public.profiles (id, full_name, email, firm_id)
  values (new.id,
          coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), nullif(inv.full_name, ''), split_part(new.email, '@', 1)),
          new.email, inv.firm_id);

  if inv.id is not null then
    insert into public.user_roles (user_id, role) values (new.id, inv.role);
    update public.team_invitations set accepted_at = now(), accepted_user_id = new.id where id = inv.id;
  end if;
  return new;
end; $$;

-- How many people a firm has, counting invitations not yet used.
CREATE OR REPLACE FUNCTION public.firm_seats_used(_firm_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select (select count(distinct p.id)::int from public.profiles p join public.user_roles r on r.user_id = p.id where p.firm_id = _firm_id)
       + (select count(*)::int from public.team_invitations i where i.firm_id = _firm_id and i.accepted_at is null and i.revoked_at is null)
$$;
REVOKE EXECUTE ON FUNCTION public.firm_seats_used(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.firm_seats_used(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.invite_team_member(_email text, _full_name text, _role public.app_role)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare
  e text := lower(trim(_email));
  f uuid := public.current_firm_id();
  lim int;
  existing public.profiles%rowtype;
begin
  if not public.has_role(auth.uid(), 'admin') or f is null then
    raise exception 'Only a partner can invite team members' using errcode = '42501';
  end if;
  if _role not in ('partner', 'lawyer', 'paralegal', 'frontdesk') then
    raise exception 'Choose partner, lawyer, paralegal or front desk';
  end if;

  select * into existing from public.profiles p where lower(p.email) = e;
  if existing.id is not null then
    if existing.firm_id is not null and existing.firm_id <> f then
      raise exception '% already uses Acta at another firm', e;
    end if;
    if existing.firm_id = f and exists (select 1 from public.user_roles r where r.user_id = existing.id) then
      raise exception '% is already on the team', e;
    end if;
  end if;

  if not exists (select 1 from public.team_invitations i
                 where lower(i.email) = e and i.firm_id = f and i.accepted_at is null and i.revoked_at is null) then
    select pl.user_limit into lim from public.firms fm join public.platform_plans pl on pl.id = fm.plan_id where fm.id = f;
    if lim is not null and public.firm_seats_used(f) >= lim then
      raise exception 'Your plan allows % people. Ask Revixions to move you to a bigger plan.', lim;
    end if;
  end if;

  if existing.id is not null then
    perform set_config('acta.moving_firm', 'on', true);
    update public.profiles set firm_id = f where id = existing.id;
    perform set_config('acta.moving_firm', '', true);
    delete from public.user_roles where user_id = existing.id;
    insert into public.user_roles (user_id, role) values (existing.id, _role);
    return 'assigned';
  end if;

  update public.team_invitations
    set role = _role, full_name = coalesce(nullif(trim(_full_name), ''), full_name), invited_by = auth.uid(), created_at = now()
    where lower(email) = e and firm_id = f and accepted_at is null and revoked_at is null;
  if not found then
    if exists (select 1 from public.team_invitations i
               where lower(i.email) = e and i.accepted_at is null and i.revoked_at is null) then
      raise exception '% has already been invited by another firm', e;
    end if;
    insert into public.team_invitations (firm_id, email, full_name, role) values (f, e, nullif(trim(_full_name), ''), _role);
  end if;
  return 'invited';
end; $$;
-- Invitations are made only through invite_team_member(), which checks the plan's user limit.
REVOKE INSERT ON public.team_invitations FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.invite_team_member(text, text, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invite_team_member(text, text, public.app_role) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.complete_onboarding(
  _full_name text, _title text, _phone text, _firm jsonb DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
declare
  me uuid := auth.uid();
  f uuid := public.current_firm_id();
  partner boolean := public.has_role(me, 'admin');
begin
  if me is null then
    raise exception 'Please sign in again' using errcode = '42501';
  end if;
  if f is null or not exists (select 1 from public.user_roles where user_id = me) then
    raise exception 'Your account is waiting for a partner to give you access' using errcode = '42501';
  end if;
  if length(trim(coalesce(_full_name, ''))) not between 2 and 100 then
    raise exception 'Enter your full name';
  end if;

  if _firm is not null then
    if not partner then
      raise exception 'Only a partner can set the firm''s details' using errcode = '42501';
    end if;
    update public.firm_settings set
      firm_name = nullif(trim(_firm->>'firm_name'), ''),
      address = nullif(trim(_firm->>'address'), ''),
      phone = nullif(trim(_firm->>'phone'), ''),
      email = nullif(lower(trim(_firm->>'email')), ''),
      registration_no = nullif(trim(_firm->>'registration_no'), ''),
      vat_number = nullif(trim(_firm->>'vat_number'), ''),
      vat_rate = coalesce(nullif(_firm->>'vat_rate', '')::numeric, 0),
      updated_by = me,
      updated_at = now()
    where firm_id = f;
  end if;
  if partner and (select nullif(trim(firm_name), '') from public.firm_settings where firm_id = f) is null then
    raise exception 'Enter your firm''s name. It appears on your invoices.';
  end if;

  update public.profiles set
    full_name = trim(_full_name),
    title = nullif(trim(coalesce(_title, '')), ''),
    phone = nullif(trim(coalesce(_phone, '')), ''),
    onboarded_at = coalesce(onboarded_at, now())
  where id = me;
end; $$;

-- ===== What a firm member may know about their firm =====
-- Works while suspended too, so the app can say why access is paused.
CREATE OR REPLACE FUNCTION public.my_firm()
RETURNS TABLE(id uuid, name text, slug text, status text, plan_name text, user_limit integer, seats_used integer,
              billing_cycle text, price numeric, currency text, trial_ends_at date, next_billing_date date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select f.id, coalesce(s.firm_name, f.name), f.slug, f.status, pl.name, pl.user_limit, public.firm_seats_used(f.id),
         f.billing_cycle,
         case when public.has_role(auth.uid(), 'admin') then
           coalesce(f.custom_price, case when f.billing_cycle = 'annual' then pl.annual_price else pl.monthly_price end) end,
         coalesce(pl.currency, 'USD'), f.trial_ends_at, f.next_billing_date
  from public.profiles p
  join public.firms f on f.id = p.firm_id
  left join public.firm_settings s on s.firm_id = f.id
  left join public.platform_plans pl on pl.id = f.plan_id
  where p.id = auth.uid()
$$;
REVOKE EXECUTE ON FUNCTION public.my_firm() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_firm() TO authenticated, service_role;

-- Partners see their firm's Acta invoices, even while suspended for non-payment.
GRANT SELECT ON public.platform_invoices TO authenticated;
CREATE POLICY "partners read their firm's Acta invoices" ON public.platform_invoices FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin')
         AND firm_id = (select p.firm_id from public.profiles p where p.id = auth.uid()));

-- ===== Platform operations (server, service role only) =====
CREATE OR REPLACE FUNCTION public.platform_create_firm(
  _name text, _slug text, _plan_id uuid, _billing_cycle text, _trial_days integer, _billing_email text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare
  f uuid;
  s text := lower(trim(coalesce(_slug, '')));
begin
  if s = '' then
    s := trim(both '-' from regexp_replace(lower(trim(_name)), '[^a-z0-9]+', '-', 'g'));
    s := left(s, 40);
    if length(s) < 3 then s := 'firm-' || substr(md5(random()::text), 1, 6); end if;
    if exists (select 1 from public.firms where slug = s) then
      s := left(s, 33) || '-' || substr(md5(random()::text), 1, 6);
    end if;
  end if;
  if exists (select 1 from public.firms where slug = s) then
    raise exception 'Another firm already uses the web address "%"', s;
  end if;
  insert into public.firms (name, slug, plan_id, billing_cycle, status, trial_ends_at, next_billing_date, billing_email)
    values (trim(_name), s, _plan_id, coalesce(_billing_cycle, 'monthly'),
            case when coalesce(_trial_days, 0) > 0 then 'trial' else 'active' end,
            case when coalesce(_trial_days, 0) > 0 then current_date + _trial_days end,
            current_date + greatest(coalesce(_trial_days, 0), 0),
            nullif(lower(trim(coalesce(_billing_email, ''))), ''))
    returning id into f;
  insert into public.firm_settings (firm_id, firm_name) values (f, trim(_name));
  return f;
end; $$;

CREATE OR REPLACE FUNCTION public.platform_invite_owner(_firm_id uuid, _email text, _full_name text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare
  e text := lower(trim(_email));
  existing public.profiles%rowtype;
begin
  if e !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email address';
  end if;
  if not exists (select 1 from public.firms where id = _firm_id) then
    raise exception 'Firm not found';
  end if;
  select * into existing from public.profiles p where lower(p.email) = e;
  if existing.id is not null then
    if existing.firm_id is not null and existing.firm_id <> _firm_id
       and exists (select 1 from public.user_roles where user_id = existing.id) then
      raise exception '% already uses Acta at another firm', e;
    end if;
    update public.profiles set firm_id = _firm_id where id = existing.id;
    delete from public.user_roles where user_id = existing.id and role <> 'partner';
    insert into public.user_roles (user_id, role) values (existing.id, 'partner') on conflict do nothing;
    return 'assigned';
  end if;
  if exists (select 1 from public.team_invitations i
             where lower(i.email) = e and i.firm_id <> _firm_id and i.accepted_at is null and i.revoked_at is null) then
    raise exception '% has an open invitation from another firm', e;
  end if;
  update public.team_invitations
    set role = 'partner', full_name = coalesce(nullif(trim(_full_name), ''), full_name), invited_by = null, created_at = now()
    where lower(email) = e and firm_id = _firm_id and accepted_at is null and revoked_at is null;
  if not found then
    insert into public.team_invitations (firm_id, email, full_name, role, invited_by)
      values (_firm_id, e, nullif(trim(_full_name), ''), 'partner', null);
  end if;
  return 'invited';
end; $$;
DROP FUNCTION IF EXISTS public.platform_invite_owner(text, text, text);

CREATE OR REPLACE FUNCTION public.platform_next_invoice_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare
  y int := extract(year from current_date)::int;
  n int;
begin
  insert into public.platform_invoice_counters as c (year, last_number) values (y, 1)
    on conflict (year) do update set last_number = c.last_number + 1 returning last_number into n;
  return 'ACTA-' || y || '-' || lpad(n::text, 4, '0');
end; $$;

-- One row per firm for the platform dashboard.
CREATE OR REPLACE FUNCTION public.platform_firm_overview()
RETURNS TABLE(id uuid, name text, slug text, status text, plan_id uuid, plan_name text, user_limit integer,
              billing_cycle text, price numeric, currency text, trial_ends_at date, next_billing_date date,
              billing_email text, notes text, created_at timestamptz, members integer, seats_used integer,
              matters integer, last_active timestamptz, owner_email text, amount_due numeric, overdue integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select f.id, f.name, f.slug, f.status, f.plan_id, pl.name, pl.user_limit, f.billing_cycle,
         coalesce(f.custom_price, case when f.billing_cycle = 'annual' then pl.annual_price else pl.monthly_price end),
         coalesce(pl.currency, 'USD'), f.trial_ends_at, f.next_billing_date, f.billing_email, f.notes, f.created_at,
         (select count(distinct p.id)::int from public.profiles p join public.user_roles r on r.user_id = p.id where p.firm_id = f.id),
         public.firm_seats_used(f.id),
         (select count(*)::int from public.matters m where m.firm_id = f.id),
         (select max(a.created_at) from public.activity_log a where a.firm_id = f.id),
         coalesce(
           (select p.email from public.profiles p join public.user_roles r on r.user_id = p.id
             where p.firm_id = f.id and r.role in ('partner', 'admin') order by p.created_at limit 1),
           (select i.email from public.team_invitations i
             where i.firm_id = f.id and i.role = 'partner' and i.revoked_at is null order by i.created_at limit 1)),
         coalesce((select sum(v.amount) from public.platform_invoices v where v.firm_id = f.id and v.status = 'due'), 0),
         (select count(*)::int from public.platform_invoices v where v.firm_id = f.id and v.status = 'due' and v.due_date < current_date)
  from public.firms f left join public.platform_plans pl on pl.id = f.plan_id
  order by f.name
$$;

REVOKE EXECUTE ON FUNCTION public.platform_create_firm(text, text, uuid, text, integer, text),
  public.platform_invite_owner(uuid, text, text), public.platform_next_invoice_number(),
  public.platform_firm_overview() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_create_firm(text, text, uuid, text, integer, text),
  public.platform_invite_owner(uuid, text, text), public.platform_next_invoice_number(),
  public.platform_firm_overview() TO service_role;

-- ===== Demo =====
CREATE OR REPLACE FUNCTION public.demo_firm_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select coalesce(
    (select p.firm_id from public.demo_settings s join public.profiles p on p.id = s.partner_id where s.id = 1),
    (select m.firm_id from public.matters m where m.id = '22222222-0000-0000-0000-000000000001'),
    '00000000-0000-4000-8000-0000000000f1')
$$;
REVOKE EXECUTE ON FUNCTION public.demo_firm_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.demo_firm_id() TO service_role;

CREATE OR REPLACE FUNCTION public.seed_demo_firm_profile()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  insert into public.firm_settings (firm_id) values (public.demo_firm_id()) on conflict do nothing;
  update public.firm_settings set
    firm_name = coalesce(firm_name, 'Makoni & Partners'),
    address = coalesce(address, '7th Floor, Pearl House' || E'\n' || '48 Samora Machel Avenue, Harare'),
    phone = coalesce(phone, '+263 242 703 990'),
    email = coalesce(email, 'accounts@makonipartners.co.zw'),
    website = coalesce(website, 'makonipartners.co.zw'),
    registration_no = coalesce(registration_no, 'Law Society of Zimbabwe reg. 2014/117'),
    vat_number = coalesce(vat_number, '10023377'),
    vat_rate = case when vat_rate = 0 then 15 else vat_rate end,
    bank_details = coalesce(bank_details, 'CBZ Bank, Kwame Nkrumah Branch' || E'\n' || 'Account: Makoni & Partners Trust · 01234567890123' || E'\n' || 'Branch code 6101'),
    invoice_footer = coalesce(invoice_footer, 'Payment is due within 30 days. Please quote the invoice number with your payment.'),
    updated_at = now()
  where firm_id = public.demo_firm_id();
  update public.invoices set tax_rate = 15 where id = 'dddddddd-0005-0000-0000-000000000001' and tax_rate = 0;
$$;

CREATE OR REPLACE FUNCTION public.refresh_demo_data()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
declare
  s public.demo_settings%rowtype;
  p uuid; l uuid; para uuid; fd uuid;
  demo_firm uuid;
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
  demo_firm := public.demo_firm_id();
  -- Rows below default to the demo firm.
  perform set_config('acta.firm_id', demo_firm::text, true);
  update public.profiles set firm_id = demo_firm, onboarded_at = coalesce(onboarded_at, now()) where id in (p, l, para, fd);
  if not exists (select 1 from public.matters where id = '22222222-0000-0000-0000-000000000001') then
    raise exception 'Demo matters are missing. Load drizzle/seed/demo.sql into the database first.';
  end if;

  -- Roles
  delete from public.user_roles where user_id in (p, l, para, fd);
  insert into public.user_roles (user_id, role) values (p, 'partner'), (l, 'lawyer'), (para, 'paralegal'), (fd, 'frontdesk');
  insert into public.billing_rates (firm_id, user_id, hourly_rate) values (demo_firm, p, 450), (demo_firm, l, 300), (demo_firm, para, 120)
    on conflict (firm_id, user_id) do update set hourly_rate = excluded.hourly_rate, updated_at = now();

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

  insert into public.invoice_counters as c (firm_id, year, last_number)
    values (demo_firm, yr, coalesce((select max(split_part(invoice_number, '-', 3)::int) from public.invoices where firm_id = demo_firm and invoice_number ~ ('^INV-' || yr || '-[0-9]+$')), 0) + 1)
    on conflict (firm_id, year) do update set last_number = c.last_number + 1 returning last_number into n;
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

-- Role changes say so plainly when the person isn't in your firm.
CREATE OR REPLACE FUNCTION public.set_user_role(_user_id uuid, _role public.app_role)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Only a partner can change roles' using errcode = '42501';
  end if;
  if _user_id = auth.uid() then
    raise exception 'You can''t change your own role';
  end if;
  if not public.same_firm(_user_id) then
    raise exception 'That person isn''t in your firm' using errcode = '42501';
  end if;
  delete from public.user_roles where user_id = _user_id;
  insert into public.user_roles (user_id, role) values (_user_id, _role);
end; $$;

CREATE OR REPLACE FUNCTION public.remove_team_member(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Only a partner can remove team members' using errcode = '42501';
  end if;
  if _user_id = auth.uid() then
    raise exception 'You can''t remove yourself';
  end if;
  if not public.same_firm(_user_id) then
    raise exception 'That person isn''t in your firm' using errcode = '42501';
  end if;
  delete from public.user_roles where user_id = _user_id;
end; $$;

-- ===== Hardening (from the cross-firm security review) =====

-- People's email, firm and onboarding state are set by Acta, not by them.
-- Email comes from their sign-in account; onboarding can only move forward.
CREATE OR REPLACE FUNCTION public.guard_profile_firm()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
begin
  if auth.uid() is null or coalesce(current_setting('acta.moving_firm', true), '') = 'on' then
    return new;
  end if;
  if new.firm_id is distinct from old.firm_id then
    raise exception 'Your firm can''t be changed here' using errcode = '42501';
  end if;
  if new.email is distinct from old.email then
    raise exception 'Your email is your sign-in address and can''t be changed here' using errcode = '42501';
  end if;
  if old.onboarded_at is not null and new.onboarded_at is distinct from old.onboarded_at then
    raise exception 'That can''t be changed' using errcode = '42501';
  end if;
  return new;
end; $$;

-- Invitations are made and cancelled only through functions, so nobody can
-- rewrite an invitation's email or bring a cancelled one back.
REVOKE UPDATE, DELETE ON public.team_invitations FROM authenticated;
CREATE OR REPLACE FUNCTION public.revoke_invitation(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  if not public.has_role(auth.uid(), 'admin') or public.current_firm_id() is null then
    raise exception 'Only a partner can cancel invitations' using errcode = '42501';
  end if;
  update public.team_invitations set revoked_at = now()
    where id = _id and firm_id = public.current_firm_id() and accepted_at is null and revoked_at is null;
  if not found then raise exception 'Invitation not found'; end if;
end; $$;
REVOKE EXECUTE ON FUNCTION public.revoke_invitation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_invitation(uuid) TO authenticated, service_role;

-- An existing account is found by its real sign-in email, and only once that
-- email is confirmed: an unconfirmed sign-up can't claim someone's place.
CREATE OR REPLACE FUNCTION public.account_by_email(_email text)
RETURNS TABLE(id uuid, firm_id uuid, confirmed boolean) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select p.id, p.firm_id, u.email_confirmed_at is not null
  from auth.users u join public.profiles p on p.id = u.id
  where lower(u.email) = lower(trim(_email))
$$;
REVOKE EXECUTE ON FUNCTION public.account_by_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_by_email(text) TO service_role;

CREATE OR REPLACE FUNCTION public.invite_team_member(_email text, _full_name text, _role public.app_role)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare
  e text := lower(trim(_email));
  f uuid := public.current_firm_id();
  lim int;
  acct record;
begin
  if not public.has_role(auth.uid(), 'admin') or f is null then
    raise exception 'Only a partner can invite team members' using errcode = '42501';
  end if;
  if _role not in ('partner', 'lawyer', 'paralegal', 'frontdesk') then
    raise exception 'Choose partner, lawyer, paralegal or front desk';
  end if;
  if e !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email address';
  end if;

  select * into acct from public.account_by_email(e);
  if acct.id is not null then
    if acct.firm_id is not null and acct.firm_id <> f then
      raise exception '% already uses Acta at another firm', e;
    end if;
    if acct.firm_id = f and exists (select 1 from public.user_roles r where r.user_id = acct.id) then
      raise exception '% is already on the team', e;
    end if;
    if not acct.confirmed then
      raise exception '% has an unconfirmed Acta account. Ask Revixions to remove it, then invite them again.', e;
    end if;
  end if;

  if not exists (select 1 from public.team_invitations i
                 where lower(i.email) = e and i.firm_id = f and i.accepted_at is null and i.revoked_at is null) then
    select pl.user_limit into lim from public.firms fm join public.platform_plans pl on pl.id = fm.plan_id where fm.id = f;
    if lim is not null and public.firm_seats_used(f) >= lim then
      raise exception 'Your plan allows % people. Ask Revixions to move you to a bigger plan.', lim;
    end if;
  end if;

  if acct.id is not null then
    perform set_config('acta.moving_firm', 'on', true);
    update public.profiles set firm_id = f where id = acct.id;
    perform set_config('acta.moving_firm', '', true);
    delete from public.user_roles where user_id = acct.id;
    insert into public.user_roles (user_id, role) values (acct.id, _role);
    return 'assigned';
  end if;

  update public.team_invitations
    set role = _role, full_name = coalesce(nullif(trim(_full_name), ''), full_name), invited_by = auth.uid(), created_at = now()
    where lower(email) = e and firm_id = f and accepted_at is null and revoked_at is null;
  if not found then
    if exists (select 1 from public.team_invitations i
               where lower(i.email) = e and i.accepted_at is null and i.revoked_at is null) then
      raise exception '% has already been invited by another firm', e;
    end if;
    insert into public.team_invitations (firm_id, email, full_name, role) values (f, e, nullif(trim(_full_name), ''), _role);
  end if;
  return 'invited';
end; $$;

CREATE OR REPLACE FUNCTION public.platform_invite_owner(_firm_id uuid, _email text, _full_name text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare
  e text := lower(trim(_email));
  acct record;
begin
  if e !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email address';
  end if;
  if not exists (select 1 from public.firms where id = _firm_id) then
    raise exception 'Firm not found';
  end if;
  select * into acct from public.account_by_email(e);
  if acct.id is not null then
    if acct.firm_id is not null and acct.firm_id <> _firm_id
       and exists (select 1 from public.user_roles where user_id = acct.id) then
      raise exception '% already uses Acta at another firm', e;
    end if;
    if not acct.confirmed then
      raise exception '% has an unconfirmed Acta account. Remove it in Lovable Cloud, then invite again.', e;
    end if;
    update public.profiles set firm_id = _firm_id where id = acct.id;
    delete from public.user_roles where user_id = acct.id and role <> 'partner';
    insert into public.user_roles (user_id, role) values (acct.id, 'partner') on conflict do nothing;
    return 'assigned';
  end if;
  if exists (select 1 from public.team_invitations i
             where lower(i.email) = e and i.firm_id <> _firm_id and i.accepted_at is null and i.revoked_at is null) then
    raise exception '% has an open invitation from another firm', e;
  end if;
  update public.team_invitations
    set role = 'partner', full_name = coalesce(nullif(trim(_full_name), ''), full_name), invited_by = null, created_at = now()
    where lower(email) = e and firm_id = _firm_id and accepted_at is null and revoked_at is null;
  if not found then
    insert into public.team_invitations (firm_id, email, full_name, role, invited_by)
      values (_firm_id, e, nullif(trim(_full_name), ''), 'partner', null);
  end if;
  return 'invited';
end; $$;

-- An invitation is only used once the account's email is proven: when Acta
-- made the account (invited, or confirmed at creation) or when it's confirmed.
CREATE OR REPLACE FUNCTION public.bind_invitation(_user_id uuid, _email text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare
  inv public.team_invitations%rowtype;
begin
  if exists (select 1 from public.user_roles where user_id = _user_id) then return; end if;
  select * into inv from public.team_invitations
    where lower(email) = lower(_email) and accepted_at is null and revoked_at is null
    order by created_at desc limit 1;
  if inv.id is null then return; end if;
  perform set_config('acta.moving_firm', 'on', true);
  update public.profiles set firm_id = inv.firm_id,
    full_name = case when full_name = split_part(_email, '@', 1) and nullif(inv.full_name, '') is not null
                     then inv.full_name else full_name end
    where id = _user_id;
  perform set_config('acta.moving_firm', '', true);
  insert into public.user_roles (user_id, role) values (_user_id, inv.role);
  update public.team_invitations set accepted_at = now(), accepted_user_id = _user_id where id = inv.id;
end; $$;
REVOKE EXECUTE ON FUNCTION public.bind_invitation(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare
  inv_name text;
begin
  select full_name into inv_name from public.team_invitations
    where lower(email) = lower(new.email) and accepted_at is null and revoked_at is null
    order by created_at desc limit 1;
  insert into public.profiles (id, full_name, email)
  values (new.id,
          coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), nullif(inv_name, ''), split_part(new.email, '@', 1)),
          new.email);
  if new.email_confirmed_at is not null or new.invited_at is not null then
    perform public.bind_invitation(new.id, new.email);
  end if;
  return new;
end; $$;

CREATE OR REPLACE FUNCTION public.handle_user_verified()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  if (old.email_confirmed_at is null and new.email_confirmed_at is not null)
     or (old.invited_at is null and new.invited_at is not null) then
    perform public.bind_invitation(new.id, new.email);
  end if;
  return new;
end; $$;
DROP TRIGGER IF EXISTS on_auth_user_verified ON auth.users;
CREATE TRIGGER on_auth_user_verified AFTER UPDATE OF email_confirmed_at, invited_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_user_verified();

-- Role questions about other people only get answers inside your own firm.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select (auth.uid() is null or _user_id = auth.uid() or public.same_firm(_user_id))
    and exists (select 1 from public.user_roles
                where user_id = _user_id and (role = _role or (_role = 'admin' and role = 'partner')))
$$;
CREATE OR REPLACE FUNCTION public.is_internal(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select (auth.uid() is null or _user_id = auth.uid() or public.same_firm(_user_id))
    and exists (select 1 from public.user_roles
                where user_id = _user_id and role in ('admin','lawyer','staff','partner','paralegal'))
$$;
CREATE OR REPLACE FUNCTION public.is_frontdesk(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select (auth.uid() is null or _user_id = auth.uid() or public.same_firm(_user_id))
    and exists (select 1 from public.user_roles where user_id = _user_id and role = 'frontdesk')
$$;
CREATE OR REPLACE FUNCTION public.is_lawyerish(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select (auth.uid() is null or _user_id = auth.uid() or public.same_firm(_user_id))
    and exists (select 1 from public.user_roles where user_id = _user_id and role in ('admin','partner','lawyer'))
$$;
CREATE OR REPLACE FUNCTION public.user_walled_from_matter(_matter_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select (auth.uid() is null or _user_id = auth.uid() or public.same_firm(_user_id))
    and exists (select 1 from public.matter_ethical_walls w where w.matter_id = _matter_id and w.user_id = _user_id)
$$;

-- Matter access also needs a current role: someone removed from the team keeps
-- their firm and assignments on record, but no longer reaches the matters.
CREATE OR REPLACE FUNCTION public.user_can_access_matter(_matter_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select public.is_internal(_user_id)
  and exists (
    select 1 from public.matters m where m.id = _matter_id and m.firm_id = public.user_firm_id(_user_id)
  ) and not exists (
    select 1 from public.matter_ethical_walls w where w.matter_id = _matter_id and w.user_id = _user_id
  ) and (
    public.has_role(_user_id, 'admin')
    or exists (select 1 from public.matters m where m.id = _matter_id and m.responsible_lawyer_id = _user_id)
    or exists (select 1 from public.matter_assignments a where a.matter_id = _matter_id and a.user_id = _user_id)
  )
$$;
DROP POLICY IF EXISTS "notes delete own" ON public.notes;
CREATE POLICY "notes delete own" ON public.notes FOR DELETE TO authenticated
  USING (public.is_internal(auth.uid()) AND ((author_id = auth.uid()) OR public.has_role(auth.uid(), 'admin')));

-- Every reference stays inside the row's firm.
CREATE OR REPLACE FUNCTION public.check_same_firm()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare
  i int := 0;
  col text;
  tbl text;
  ref uuid;
  ok boolean;
begin
  while i < tg_nargs loop
    col := tg_argv[i];
    tbl := tg_argv[i + 1];
    execute format('select ($1).%I::uuid', col) into ref using new;
    if ref is not null then
      execute format('select exists (select 1 from public.%I where id = $1 and firm_id = $2)', tbl)
        into ok using ref, new.firm_id;
      if not ok then
        raise exception '% not found', replace(col, '_id', '') using errcode = '23503';
      end if;
    end if;
    i := i + 2;
  end loop;
  return new;
end; $$;

DO $$
declare
  spec text[];
begin
  foreach spec slice 1 in array array[
    ['matters', 'client_id,clients,responsible_lawyer_id,profiles'],
    ['matter_assignments', 'matter_id,matters,user_id,profiles'],
    ['matter_ethical_walls', 'matter_id,matters,user_id,profiles'],
    ['notes', 'matter_id,matters'],
    ['related_parties', 'matter_id,matters'],
    ['documents', 'matter_id,matters,uploaded_by,profiles'],
    ['events', 'matter_id,matters,inquiry_id,inquiries,owner_id,profiles'],
    ['tasks', 'matter_id,matters,assignee_id,profiles'],
    ['time_entries', 'matter_id,matters,user_id,profiles,invoice_id,invoices'],
    ['invoices', 'matter_id,matters,client_id,clients'],
    ['invoice_items', 'invoice_id,invoices'],
    ['announcements', 'matter_id,matters'],
    ['inquiries', 'matter_id,matters,consult_with,profiles,consult_event_id,events'],
    ['client_intake_submissions', 'inquiry_id,inquiries'],
    ['billing_rates', 'user_id,profiles'],
    ['activity_log', 'matter_id,matters']
  ] loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.check_same_firm(%s)',
      spec[1] || '_same_firm', spec[1],
      (select string_agg(quote_literal(x), ', ') from unnest(string_to_array(spec[2], ',')) x));
  end loop;
end $$;

-- Files belong to their uploader's folder.
CREATE OR REPLACE FUNCTION public.check_document_path()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
begin
  if new.file_path not like new.uploaded_by::text || '/%' then
    raise exception 'Files must be uploaded to your own folder' using errcode = '42501';
  end if;
  return new;
end; $$;
CREATE TRIGGER documents_own_path BEFORE INSERT OR UPDATE OF file_path, uploaded_by ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.check_document_path();

CREATE OR REPLACE FUNCTION public.matter_directory()
RETURNS TABLE(id uuid, matter_number text, title text, status matter_status, practice_area practice_area, date_opened date, client_name text, lawyer_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select m.id, m.matter_number, m.title, m.status, m.practice_area, m.date_opened, c.name, p.full_name
  from public.matters m
  join public.clients c on c.id = m.client_id and c.firm_id = m.firm_id
  left join public.profiles p on p.id = m.responsible_lawyer_id and p.firm_id = m.firm_id
  where public.is_frontdesk(auth.uid()) and m.firm_id = public.current_firm_id()
    and not exists (select 1 from public.matter_ethical_walls w where w.matter_id = m.id and w.user_id = auth.uid())
  order by m.matter_number desc
$$;

-- Hourly rates: one per person per firm, read within the firm.
ALTER TABLE public.billing_rates DROP CONSTRAINT billing_rates_pkey;
ALTER TABLE public.billing_rates ADD PRIMARY KEY (firm_id, user_id);
CREATE OR REPLACE FUNCTION public.enforce_time_entry_rate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  if auth.uid() is null or public.has_role(auth.uid(), 'admin') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.hourly_rate := coalesce((select r.hourly_rate from public.billing_rates r
                                 where r.user_id = new.user_id and r.firm_id = new.firm_id), 250);
  else
    new.hourly_rate := old.hourly_rate;
  end if;
  return new;
end; $$;

-- Logos: only inside the firm's own folder.
CREATE OR REPLACE FUNCTION public.check_logo_path()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
begin
  if new.logo_path is distinct from old.logo_path and new.logo_path is not null
     and new.logo_path not like new.firm_id::text || '/%' then
    raise exception 'Logos go in the firm''s own folder' using errcode = '42501';
  end if;
  return new;
end; $$;
CREATE TRIGGER firm_settings_logo_path BEFORE UPDATE OF logo_path ON public.firm_settings
  FOR EACH ROW EXECUTE FUNCTION public.check_logo_path();
DROP POLICY "partners delete firm assets" ON storage.objects;
CREATE POLICY "partners delete firm assets" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'firm-assets' AND public.has_role(auth.uid(), 'admin')
         AND split_part(name, '/', 1) = public.current_firm_id()::text);
-- Logos are served by public URL; listing the bucket shows only your own firm's files.
DROP POLICY "anyone reads firm assets" ON storage.objects;
CREATE POLICY "partners list own firm assets" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'firm-assets' AND split_part(name, '/', 1) = public.current_firm_id()::text);

-- Document files: a suspended firm can't reach them either.
DROP POLICY "upload document files to own folder" ON storage.objects;
DROP POLICY "update own document files" ON storage.objects;
DROP POLICY "uploader or partner deletes document files" ON storage.objects;
CREATE POLICY "upload document files to own folder" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'matter-documents' AND public.is_internal(auth.uid()) AND public.current_firm_id() IS NOT NULL
              AND split_part(name, '/', 1) = auth.uid()::text);
CREATE POLICY "update own document files" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'matter-documents' AND public.is_internal(auth.uid()) AND public.current_firm_id() IS NOT NULL
         AND split_part(name, '/', 1) = auth.uid()::text);
CREATE POLICY "uploader or partner deletes document files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'matter-documents' AND public.is_internal(auth.uid()) AND public.current_firm_id() IS NOT NULL
         AND (split_part(name, '/', 1) = auth.uid()::text
              OR (public.has_role(auth.uid(), 'admin') AND public.same_firm_path(name))));
CREATE OR REPLACE FUNCTION public.can_read_document_file(_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select public.is_internal(auth.uid()) and public.current_firm_id() is not null and case
    when exists (select 1 from public.documents d where d.file_path = _path)
      then exists (select 1 from public.documents d where d.file_path = _path
                   and d.firm_id = public.current_firm_id()
                   and (d.matter_id is null or public.can_access_matter(d.matter_id)))
    else split_part(_path, '/', 1) = auth.uid()::text
         or (public.has_role(auth.uid(), 'admin') and public.same_firm_path(_path))
  end
$$;

-- Demo mode: only in a workspace that holds the demo firm alone (a demo
-- database), so no real firm's data can sit behind the public demo sign-in.
CREATE OR REPLACE FUNCTION public.demo_firm_id()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
declare
  f uuid;
begin
  if (select count(*) from public.firms where status <> 'cancelled') > 1 then
    raise exception 'Demo mode only works in a workspace with a single firm. Use a separate demo database.';
  end if;
  select m.firm_id into f from public.matters m where m.id = '22222222-0000-0000-0000-000000000001';
  if f is null then
    raise exception 'Demo matters are missing. Load drizzle/seed/demo.sql into the database first.';
  end if;
  return f;
end; $$;
REVOKE EXECUTE ON FUNCTION public.demo_firm_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.demo_firm_id() TO service_role;

-- Second review round.
-- Invitations attach only to accounts Acta made (invited) or that were already
-- confirmed when created (Google sign-in). A self sign-up that is confirmed
-- later never picks one up, so nobody can sign up ahead of an invitee.
CREATE OR REPLACE FUNCTION public.handle_user_verified()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  if old.invited_at is null and new.invited_at is not null then
    perform public.bind_invitation(new.id, new.email);
  end if;
  return new;
end; $$;
DROP TRIGGER IF EXISTS on_auth_user_verified ON auth.users;
CREATE TRIGGER on_auth_user_verified AFTER UPDATE OF invited_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_user_verified();

-- Only check references that are being set, so a row naming someone who has
-- since left the firm can still be edited.
CREATE OR REPLACE FUNCTION public.check_same_firm()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare
  i int := 0;
  col text;
  tbl text;
  ref uuid;
  was uuid;
  ok boolean;
begin
  while i < tg_nargs loop
    col := tg_argv[i];
    tbl := tg_argv[i + 1];
    execute format('select ($1).%I::uuid', col) into ref using new;
    if tg_op = 'UPDATE' then
      execute format('select ($1).%I::uuid', col) into was using old;
    end if;
    if ref is not null and (tg_op = 'INSERT' or ref is distinct from was or new.firm_id is distinct from old.firm_id) then
      execute format('select exists (select 1 from public.%I where id = $1 and firm_id = $2)', tbl)
        into ok using ref, new.firm_id;
      if not ok then
        raise exception '% not found', replace(col, '_id', '') using errcode = '23503';
      end if;
    end if;
    i := i + 2;
  end loop;
  return new;
end; $$;

DROP TRIGGER documents_same_firm ON public.documents;
CREATE TRIGGER documents_same_firm BEFORE INSERT OR UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.check_same_firm('matter_id', 'matters', 'client_id', 'clients', 'uploaded_by', 'profiles');

-- Matters someone created also need a current role to read.
DROP POLICY "read accessible matters" ON public.matters;
CREATE POLICY "read accessible matters" ON public.matters FOR SELECT TO authenticated
  USING (public.can_access_matter(id)
         OR (public.is_internal(auth.uid()) AND created_by = auth.uid()
             AND NOT EXISTS (SELECT 1 FROM public.matter_ethical_walls w WHERE w.matter_id = matters.id AND w.user_id = auth.uid())));

-- Can a partner of this firm be given a sign-in link for this email? Only for
-- someone invited to the firm, or in it and not yet joined.
CREATE OR REPLACE FUNCTION public.can_link_invitee(_firm_id uuid, _email text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select exists (select 1 from public.team_invitations i
                 where lower(i.email) = lower(trim(_email)) and i.firm_id = _firm_id
                   and i.accepted_at is null and i.revoked_at is null)
      or exists (select 1 from auth.users u join public.profiles p on p.id = u.id
                 where lower(u.email) = lower(trim(_email)) and p.firm_id = _firm_id and p.onboarded_at is null)
$$;
REVOKE EXECUTE ON FUNCTION public.can_link_invitee(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_link_invitee(uuid, text) TO service_role;
