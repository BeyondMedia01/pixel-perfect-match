-- Map existing roles onto the demo's roles: admin -> partner, staff -> paralegal
UPDATE public.user_roles SET role = 'partner' WHERE role = 'admin';
UPDATE public.user_roles SET role = 'paralegal' WHERE role = 'staff';

-- partner satisfies every existing admin check
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id
      and (role = _role or (_role = 'admin' and role = 'partner'))
  )
$$;

-- internal = partner, lawyer, paralegal (front desk and clients are not internal)
CREATE OR REPLACE FUNCTION public.is_internal(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role in ('admin','lawyer','staff','partner','paralegal')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_frontdesk(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = 'frontdesk')
$$;

CREATE OR REPLACE FUNCTION public.is_lawyerish(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role in ('admin','partner','lawyer'))
$$;

-- first signup becomes partner, later signups start as paralegal
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)), new.email);
  if not exists (select 1 from public.user_roles where role in ('admin','partner')) then
    insert into public.user_roles (user_id, role) values (new.id, 'partner');
  else
    insert into public.user_roles (user_id, role) values (new.id, 'paralegal');
  end if;
  return new;
end; $$;

-- ethical walls: screen specific people from a matter
CREATE TABLE public.matter_ethical_walls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id uuid NOT NULL REFERENCES public.matters(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (matter_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.matter_ethical_walls TO authenticated;
GRANT ALL ON public.matter_ethical_walls TO service_role;
ALTER TABLE public.matter_ethical_walls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "internal read walls" ON public.matter_ethical_walls FOR SELECT TO authenticated
  USING (public.is_internal(auth.uid()));
CREATE POLICY "partner manage walls" ON public.matter_ethical_walls FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- matter access now excludes walled users, partners included
CREATE OR REPLACE FUNCTION public.can_access_matter(_matter_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select not exists (
    select 1 from public.matter_ethical_walls w
    where w.matter_id = _matter_id and w.user_id = auth.uid()
  ) and (
    public.has_role(auth.uid(),'admin')
    or exists (select 1 from public.matters m where m.id = _matter_id and m.responsible_lawyer_id = auth.uid())
    or exists (select 1 from public.matter_assignments a where a.matter_id = _matter_id and a.user_id = auth.uid())
  )
$$;

-- inquiries: the intake pipeline
CREATE TABLE public.inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at timestamptz NOT NULL DEFAULT now(),
  logged_by uuid,
  name text NOT NULL,
  contact text,
  practice_area practice_area NOT NULL DEFAULT 'other',
  opposing_party text NOT NULL DEFAULT '',
  related_names text,
  summary text,
  status inquiry_status NOT NULL DEFAULT 'new',
  decline_reason text,
  signoff_by uuid,
  signoff_at timestamptz,
  signoff_basis text,
  signoff_note text,
  consult_event_id uuid,
  consult_with uuid,
  matter_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inquiries TO authenticated;
GRANT ALL ON public.inquiries TO service_role;
ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read inquiries" ON public.inquiries FOR SELECT TO authenticated
  USING (public.is_internal(auth.uid()) OR public.is_frontdesk(auth.uid()));
CREATE POLICY "staff log inquiries" ON public.inquiries FOR INSERT TO authenticated
  WITH CHECK (public.is_internal(auth.uid()) OR public.is_frontdesk(auth.uid()));
CREATE POLICY "internal update inquiries" ON public.inquiries FOR UPDATE TO authenticated
  USING (public.is_internal(auth.uid())) WITH CHECK (public.is_internal(auth.uid()));
CREATE POLICY "frontdesk update open inquiries" ON public.inquiries FOR UPDATE TO authenticated
  USING (public.is_frontdesk(auth.uid()) AND status IN ('new','consult'))
  WITH CHECK (status IN ('new','consult'));
CREATE POLICY "partner delete inquiries" ON public.inquiries FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- deadline confirmation workflow on events
ALTER TABLE public.events ADD COLUMN entered_by uuid;
ALTER TABLE public.events ADD COLUMN confirmed_by uuid;
ALTER TABLE public.events ADD COLUMN filed_at timestamptz;
ALTER TABLE public.events ADD COLUMN inquiry_id uuid REFERENCES public.inquiries(id) ON DELETE CASCADE;
UPDATE public.events SET entered_by = owner_id WHERE entered_by IS NULL;

CREATE POLICY "internal read inquiry events" ON public.events FOR SELECT TO authenticated
  USING (public.is_internal(auth.uid()) AND inquiry_id IS NOT NULL);
CREATE POLICY "frontdesk inquiry events" ON public.events FOR SELECT TO authenticated
  USING (public.is_frontdesk(auth.uid()) AND inquiry_id IS NOT NULL);
CREATE POLICY "frontdesk add inquiry events" ON public.events FOR INSERT TO authenticated
  WITH CHECK (public.is_frontdesk(auth.uid()) AND inquiry_id IS NOT NULL AND owner_id = auth.uid());

-- front desk sees matter names and stages (read-only)
CREATE POLICY "frontdesk read matters" ON public.matters FOR SELECT TO authenticated
  USING (public.is_frontdesk(auth.uid()));

-- inquiry history is written to the shared audit log
CREATE POLICY "staff add activity" ON public.activity_log FOR INSERT TO authenticated
  WITH CHECK (public.is_internal(auth.uid()) OR public.is_frontdesk(auth.uid()));
CREATE POLICY "staff read inquiry activity" ON public.activity_log FOR SELECT TO authenticated
  USING (entity_type = 'inquiry' AND (public.is_internal(auth.uid()) OR public.is_frontdesk(auth.uid())));

-- conflict check now also searches open and declined inquiries
CREATE OR REPLACE FUNCTION public.conflict_check(q text)
RETURNS TABLE(source text, name text, detail text, matter_number text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select * from (
    select 'client'::text, c.name, c.type::text, null::text from public.clients c
      where public.is_internal(auth.uid()) and c.name ilike '%' || q || '%'
    union all
    select 'opposing_party', m.opposing_party, m.title, m.matter_number from public.matters m
      where public.is_internal(auth.uid()) and m.opposing_party ilike '%' || q || '%'
    union all
    select rp.role::text, rp.name, m.title, m.matter_number from public.related_parties rp join public.matters m on m.id = rp.matter_id
      where public.is_internal(auth.uid()) and rp.name ilike '%' || q || '%'
    union all
    select 'prospect', i.name, 'Inquiry (' || i.status::text || ')', null::text from public.inquiries i
      where public.is_internal(auth.uid()) and i.status <> 'accepted' and i.name ilike '%' || q || '%'
    union all
    select 'inquiry_opposing', i.opposing_party, 'Opposing party in an inquiry (' || i.status::text || ')', null::text from public.inquiries i
      where public.is_internal(auth.uid()) and i.status <> 'accepted' and i.opposing_party <> '' and i.opposing_party ilike '%' || q || '%'
  ) s limit 50
$$;

-- front desk only learns whether a check is clear or must be referred, never the names
CREATE OR REPLACE FUNCTION public.conflict_check_count(q text)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select (select count(*)::int from public.clients c where c.name ilike '%' || q || '%')
       + (select count(*)::int from public.matters m where m.opposing_party ilike '%' || q || '%')
       + (select count(*)::int from public.related_parties rp where rp.name ilike '%' || q || '%')
       + (select count(*)::int from public.inquiries i where i.status <> 'accepted' and (i.name ilike '%' || q || '%' or (i.opposing_party <> '' and i.opposing_party ilike '%' || q || '%')))
$$;