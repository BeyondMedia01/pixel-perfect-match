-- Team invitations, task assignment rules, event rules and calendar subscriptions.

-- ===== Matter access for any user (used by the calendar feed) =====
-- Same rule as can_access_matter(), for a given user instead of the caller.
CREATE OR REPLACE FUNCTION public.user_can_access_matter(_matter_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select not exists (
    select 1 from public.matter_ethical_walls w where w.matter_id = _matter_id and w.user_id = _user_id
  ) and (
    public.has_role(_user_id, 'admin')
    or exists (select 1 from public.matters m where m.id = _matter_id and m.responsible_lawyer_id = _user_id)
    or exists (select 1 from public.matter_assignments a where a.matter_id = _matter_id and a.user_id = _user_id)
  )
$$;
CREATE OR REPLACE FUNCTION public.can_access_matter(_matter_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select public.user_can_access_matter(_matter_id, auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.user_walled_from_matter(_matter_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select exists (select 1 from public.matter_ethical_walls w where w.matter_id = _matter_id and w.user_id = _user_id)
$$;

-- ===== Team invitations =====
CREATE TABLE public.team_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL CHECK (email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  full_name text,
  role public.app_role NOT NULL CHECK (role IN ('partner', 'lawyer', 'paralegal', 'frontdesk')),
  invited_by uuid DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  accepted_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  revoked_at timestamptz
);
CREATE UNIQUE INDEX team_invitations_open_email ON public.team_invitations (lower(email))
  WHERE accepted_at IS NULL AND revoked_at IS NULL;
GRANT SELECT, INSERT, UPDATE ON public.team_invitations TO authenticated;
GRANT ALL ON public.team_invitations TO service_role;
ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "partners manage invitations" ON public.team_invitations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- New accounts: the first becomes partner; anyone with an open invitation gets
-- the invited role straight away; everyone else waits for approval.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare
  inv public.team_invitations%rowtype;
begin
  select * into inv from public.team_invitations
    where lower(email) = lower(new.email) and accepted_at is null and revoked_at is null
    order by created_at desc limit 1;

  insert into public.profiles (id, full_name, email)
  values (new.id,
          coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), nullif(inv.full_name, ''), split_part(new.email, '@', 1)),
          new.email);

  if not exists (select 1 from public.user_roles where role in ('admin', 'partner')) then
    insert into public.user_roles (user_id, role) values (new.id, 'partner');
  elsif inv.id is not null then
    insert into public.user_roles (user_id, role) values (new.id, inv.role);
    update public.team_invitations set accepted_at = now(), accepted_user_id = new.id where id = inv.id;
  end if;
  return new;
end; $$;

-- Invite someone by email. If they already have an account waiting for
-- approval, they get the role now. Returns 'invited' or 'assigned'.
CREATE OR REPLACE FUNCTION public.invite_team_member(_email text, _full_name text, _role public.app_role)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
declare
  e text := lower(trim(_email));
  existing uuid;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Only a partner can invite team members' using errcode = '42501';
  end if;
  if _role not in ('partner', 'lawyer', 'paralegal', 'frontdesk') then
    raise exception 'Choose partner, lawyer, paralegal or front desk';
  end if;

  select p.id into existing from public.profiles p where lower(p.email) = e;
  if existing is not null then
    if exists (select 1 from public.user_roles r where r.user_id = existing) then
      raise exception '% is already on the team', e;
    end if;
    perform public.set_user_role(existing, _role);
    return 'assigned';
  end if;

  update public.team_invitations
    set role = _role, full_name = coalesce(nullif(trim(_full_name), ''), full_name), invited_by = auth.uid(), created_at = now()
    where lower(email) = e and accepted_at is null and revoked_at is null;
  if not found then
    insert into public.team_invitations (email, full_name, role) values (e, nullif(trim(_full_name), ''), _role);
  end if;
  return 'invited';
end; $$;

-- Take away someone's access. Their account stays (and their history), but they
-- go back to waiting for approval and see no firm data.
CREATE OR REPLACE FUNCTION public.remove_team_member(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Only a partner can remove team members' using errcode = '42501';
  end if;
  if _user_id = auth.uid() then
    raise exception 'You can''t remove yourself';
  end if;
  delete from public.user_roles where user_id = _user_id;
end; $$;

-- ===== Tasks =====
-- Tasks can be created by any staff member and assigned to any staff member.
-- People see tasks assigned to them or created by them, and tasks on matters
-- they can open; ethical walls still win.
ALTER TABLE public.tasks ALTER COLUMN created_by SET DEFAULT auth.uid();
DROP POLICY IF EXISTS "tasks access" ON public.tasks;
CREATE POLICY "read visible tasks" ON public.tasks FOR SELECT TO authenticated USING (
  public.is_internal(auth.uid()) AND (
    CASE WHEN matter_id IS NULL
      THEN assignee_id = auth.uid() OR created_by = auth.uid() OR public.has_role(auth.uid(), 'admin')
      ELSE public.can_access_matter(matter_id)
        OR ((assignee_id = auth.uid() OR created_by = auth.uid()) AND NOT public.user_walled_from_matter(matter_id, auth.uid()))
    END)
);
CREATE POLICY "staff create tasks" ON public.tasks FOR INSERT TO authenticated WITH CHECK (
  public.is_internal(auth.uid()) AND created_by = auth.uid()
  AND (matter_id IS NULL OR public.can_access_matter(matter_id))
  AND (assignee_id IS NULL OR (public.is_internal(assignee_id)
       AND (matter_id IS NULL OR NOT public.user_walled_from_matter(matter_id, assignee_id))))
);
CREATE POLICY "staff update visible tasks" ON public.tasks FOR UPDATE TO authenticated USING (
  public.is_internal(auth.uid()) AND (
    CASE WHEN matter_id IS NULL
      THEN assignee_id = auth.uid() OR created_by = auth.uid() OR public.has_role(auth.uid(), 'admin')
      ELSE public.can_access_matter(matter_id)
        OR ((assignee_id = auth.uid() OR created_by = auth.uid()) AND NOT public.user_walled_from_matter(matter_id, auth.uid()))
    END)
) WITH CHECK (
  public.is_internal(auth.uid())
  AND (matter_id IS NULL OR public.can_access_matter(matter_id)
       OR ((assignee_id = auth.uid() OR created_by = auth.uid()) AND NOT public.user_walled_from_matter(matter_id, auth.uid())))
  AND (assignee_id IS NULL OR (public.is_internal(assignee_id)
       AND (matter_id IS NULL OR NOT public.user_walled_from_matter(matter_id, assignee_id))))
);
CREATE POLICY "creator or partner deletes tasks" ON public.tasks FOR DELETE TO authenticated USING (
  public.is_internal(auth.uid()) AND (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  AND (matter_id IS NULL OR NOT public.user_walled_from_matter(matter_id, auth.uid()))
);

-- ===== Events =====
ALTER TABLE public.events ALTER COLUMN entered_by SET DEFAULT auth.uid();
ALTER TABLE public.events ALTER COLUMN owner_id SET DEFAULT auth.uid();
-- Only a lawyer or partner can confirm a deadline, and only in their own name.
CREATE OR REPLACE FUNCTION public.enforce_deadline_confirmation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  if auth.uid() is null then return new; end if;
  if new.confirmed_by is not null
     and (tg_op = 'INSERT' or new.confirmed_by is distinct from old.confirmed_by) then
    if not public.is_lawyerish(auth.uid()) or new.confirmed_by <> auth.uid() then
      raise exception 'Only a lawyer can confirm a deadline, in their own name' using errcode = '42501';
    end if;
  end if;
  return new;
end; $$;
CREATE TRIGGER events_confirmation BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.enforce_deadline_confirmation();

-- ===== Calendar subscriptions =====
-- Each person can have one private feed link that Google, Outlook or Apple
-- Calendar subscribes to. The token is the only secret; regenerating it
-- breaks the old link.
CREATE TABLE public.calendar_feeds (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_feeds TO authenticated;
GRANT ALL ON public.calendar_feeds TO service_role;
ALTER TABLE public.calendar_feeds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own calendar feed" ON public.calendar_feeds FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.is_internal(auth.uid()))
  WITH CHECK (user_id = auth.uid() AND public.is_internal(auth.uid()));

-- What a feed shows: the person's own events, consultations they're booked
-- for, dates on matters they run or are assigned to (walls respected), and
-- their open tasks with a due date. Nothing once they lose access.
-- Called only by the server with the feed token.
CREATE OR REPLACE FUNCTION public.calendar_feed(_token text)
RETURNS TABLE(uid text, kind text, title text, description text, location text,
              starts_at timestamptz, ends_at timestamptz, all_day_date date, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  with me as (
    select f.user_id from public.calendar_feeds f
    where f.token = _token and public.is_internal(f.user_id)
  )
  select 'event-' || e.id, e.type::text,
         e.title || coalesce(' · ' || m.matter_number, ''),
         concat_ws(E'\n',
           case when m.id is not null then m.matter_number || ' ' || m.title end,
           case when e.type in ('court_date', 'filing_deadline') and e.filed_at is null and e.confirmed_by is null
                then 'Awaiting lawyer confirmation' end),
         e.location, e.starts_at, e.ends_at, null::date, e.created_at
  from public.events e
  cross join me
  left join public.matters m on m.id = e.matter_id
  left join public.inquiries i on i.id = e.inquiry_id
  where e.starts_at > now() - interval '60 days'
    and e.starts_at < now() + interval '400 days'
    and (
      (e.matter_id is null and (e.owner_id = me.user_id or i.consult_with = me.user_id))
      or (e.matter_id is not null and public.user_can_access_matter(e.matter_id, me.user_id)
          and (m.responsible_lawyer_id = me.user_id or e.owner_id = me.user_id
               or exists (select 1 from public.matter_assignments a where a.matter_id = e.matter_id and a.user_id = me.user_id)))
    )
  union all
  select 'task-' || t.id, 'task', 'Task: ' || t.title || coalesce(' · ' || m.matter_number, ''),
         t.description, null, null, null, t.due_date, t.created_at
  from public.tasks t
  cross join me
  left join public.matters m on m.id = t.matter_id
  where t.assignee_id = me.user_id and t.status <> 'done' and t.due_date is not null
    and t.due_date > current_date - 60
    and (t.matter_id is null or not public.user_walled_from_matter(t.matter_id, me.user_id))
$$;

-- ===== Function access =====
REVOKE EXECUTE ON FUNCTION public.user_can_access_matter(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.calendar_feed(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_access_matter(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.calendar_feed(text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.user_walled_from_matter(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.invite_team_member(text, text, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.remove_team_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_walled_from_matter(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.invite_team_member(text, text, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_team_member(uuid) TO authenticated, service_role;
