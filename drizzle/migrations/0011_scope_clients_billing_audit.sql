-- Security fixes from the November 2026 audit, batch 2 (findings 4, 5, 7, 8 and 9).

-- 4. Full client records only for people working on that client.
-- Someone can open a client when they can open one of its matters (or created one
-- that they aren't walled from), or when they are a partner or created the client
-- and aren't walled from any of its matters.
ALTER TABLE public.clients ALTER COLUMN created_by SET DEFAULT auth.uid();

CREATE OR REPLACE FUNCTION public.can_access_client(_client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select public.is_internal(auth.uid()) and (
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

DROP POLICY IF EXISTS "internal read clients" ON public.clients;
DROP POLICY IF EXISTS "internal update clients" ON public.clients;
CREATE POLICY "read accessible clients" ON public.clients FOR SELECT TO authenticated
  USING (public.can_access_client(id));
CREATE POLICY "update accessible clients" ON public.clients FOR UPDATE TO authenticated
  USING (public.can_access_client(id)) WITH CHECK (public.is_internal(auth.uid()));

-- Names only, for picking a client when opening a matter. Hides clients the
-- caller is walled from.
CREATE OR REPLACE FUNCTION public.client_directory()
RETURNS TABLE(id uuid, name text, type public.client_type)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select c.id, c.name, c.type from public.clients c
  where public.is_internal(auth.uid())
    and not exists (
      select 1 from public.matters m join public.matter_ethical_walls w on w.matter_id = m.id
      where m.client_id = c.id and w.user_id = auth.uid())
  order by c.name
$$;

-- 5. Front desk sees matter names and stages only, never the full record.
DROP POLICY IF EXISTS "frontdesk read matters" ON public.matters;

CREATE OR REPLACE FUNCTION public.matter_directory()
RETURNS TABLE(id uuid, matter_number text, title text, status public.matter_status,
              practice_area public.practice_area, date_opened date, client_name text, lawyer_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select m.id, m.matter_number, m.title, m.status, m.practice_area, m.date_opened, c.name, p.full_name
  from public.matters m
  join public.clients c on c.id = m.client_id
  left join public.profiles p on p.id = m.responsible_lawyer_id
  where public.is_frontdesk(auth.uid())
    and not exists (select 1 from public.matter_ethical_walls w where w.matter_id = m.id and w.user_id = auth.uid())
  order by m.matter_number desc
$$;

-- 7. Activity entries are always written in the author's own name, for inquiries only.
ALTER TABLE public.activity_log ALTER COLUMN user_id SET DEFAULT auth.uid();
DROP POLICY IF EXISTS "staff add activity" ON public.activity_log;
CREATE POLICY "staff add own inquiry activity" ON public.activity_log FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND entity_type = 'inquiry'
    AND (public.is_internal(auth.uid()) OR public.is_frontdesk(auth.uid())));

-- 8. Hourly rates are set by partners, and invoiced time is locked.
CREATE TABLE public.billing_rates (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  hourly_rate numeric(10,2) NOT NULL CHECK (hourly_rate >= 0),
  updated_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_rates TO authenticated;
GRANT ALL ON public.billing_rates TO service_role;
ALTER TABLE public.billing_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own rate or partner" ON public.billing_rates FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "partner manages rates" ON public.billing_rates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Anyone but a partner gets their partner-set rate (250 when none is set yet)
-- and can't change the rate on an existing entry.
CREATE OR REPLACE FUNCTION public.enforce_time_entry_rate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  if auth.uid() is null or public.has_role(auth.uid(), 'admin') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.hourly_rate := coalesce((select r.hourly_rate from public.billing_rates r where r.user_id = new.user_id), 250);
  else
    new.hourly_rate := old.hourly_rate;
  end if;
  return new;
end; $$;
CREATE TRIGGER time_entries_rate BEFORE INSERT OR UPDATE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.enforce_time_entry_rate();

DROP POLICY IF EXISTS "edit own or partner edits" ON public.time_entries;
DROP POLICY IF EXISTS "delete own or partner deletes" ON public.time_entries;
CREATE POLICY "edit own unbilled or partner edits" ON public.time_entries FOR UPDATE TO authenticated
  USING (((user_id = auth.uid() AND invoice_id IS NULL) OR public.has_role(auth.uid(),'admin')) AND public.can_access_matter(matter_id))
  WITH CHECK (((user_id = auth.uid() AND invoice_id IS NULL) OR public.has_role(auth.uid(),'admin')) AND public.can_access_matter(matter_id));
CREATE POLICY "delete own unbilled or partner deletes" ON public.time_entries FOR DELETE TO authenticated
  USING (((user_id = auth.uid() AND invoice_id IS NULL) OR public.has_role(auth.uid(),'admin')) AND public.can_access_matter(matter_id));

-- 9. Announcements respect roles and walls.
DROP POLICY IF EXISTS "Staff read all, clients read firm-wide or own matters" ON public.announcements;
DROP POLICY IF EXISTS "Internal staff post announcements" ON public.announcements;
DROP POLICY IF EXISTS "Authors and partners update announcements" ON public.announcements;
DROP POLICY IF EXISTS "Authors and partners delete announcements" ON public.announcements;
CREATE POLICY "read firm-wide or accessible matter announcements" ON public.announcements FOR SELECT TO authenticated
  USING (CASE WHEN matter_id IS NULL
    THEN public.is_internal(auth.uid()) OR public.is_frontdesk(auth.uid())
    ELSE public.is_internal(auth.uid()) AND public.can_access_matter(matter_id) END);
CREATE POLICY "staff post announcements" ON public.announcements FOR INSERT TO authenticated
  WITH CHECK (public.is_internal(auth.uid()) AND created_by = auth.uid()
    AND (matter_id IS NULL OR public.can_access_matter(matter_id)));
CREATE POLICY "authors and partners update announcements" ON public.announcements FOR UPDATE TO authenticated
  USING (public.is_internal(auth.uid()) AND (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    AND (matter_id IS NULL OR public.can_access_matter(matter_id)))
  WITH CHECK (public.is_internal(auth.uid()) AND (matter_id IS NULL OR public.can_access_matter(matter_id)));
CREATE POLICY "authors and partners delete announcements" ON public.announcements FOR DELETE TO authenticated
  USING (public.is_internal(auth.uid()) AND (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    AND (matter_id IS NULL OR public.can_access_matter(matter_id)));

-- New helper functions: signed-in users only.
REVOKE EXECUTE ON FUNCTION public.can_access_client(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.client_directory() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.matter_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_client(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.client_directory() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.matter_directory() TO authenticated, service_role;
