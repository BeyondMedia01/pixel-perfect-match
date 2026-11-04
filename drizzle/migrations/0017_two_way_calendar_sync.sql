-- Two-way sync with Google Calendar and Microsoft Outlook.
-- Each person can connect their own account. Acta creates a calendar called
-- "Acta" in it, keeps it filled with their dates, and brings back changes they
-- make to meetings there, plus new events they add to that calendar.
-- Tokens and links are server-only: nothing here is readable from the browser.

CREATE TABLE public.calendar_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google', 'microsoft')),
  account_email text,
  access_token text NOT NULL,
  refresh_token text,
  expires_at timestamptz,
  calendar_id text,
  sync_state text,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

-- Which Acta event is which event in the connected calendar.
-- event_id goes NULL when the Acta event is deleted, so the next sync can
-- still find and delete the copy in the person's calendar.
CREATE TABLE public.calendar_event_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.calendar_connections(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  remote_id text NOT NULL,
  pushed_hash text,
  remote_version text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, remote_id),
  UNIQUE (connection_id, event_id)
);

-- One-time values that tie an OAuth sign-in back to the person who started it.
CREATE TABLE public.calendar_oauth_states (
  state text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google', 'microsoft')),
  created_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.calendar_connections, public.calendar_event_links, public.calendar_oauth_states FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.calendar_connections, public.calendar_event_links, public.calendar_oauth_states TO service_role;
ALTER TABLE public.calendar_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_event_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_oauth_states ENABLE ROW LEVEL SECURITY;

-- The events that belong in someone's calendar: their own events,
-- consultations booked with them, and dates on matters they run or are
-- assigned to (ethical walls respected). Nothing once they lose access.
-- Shared by the subscription feed and two-way sync.
CREATE OR REPLACE FUNCTION public.calendar_events_for_user(_user_id uuid)
RETURNS TABLE(id uuid, type text, title text, description text, location text,
              starts_at timestamptz, ends_at timestamptz, matter_id uuid, owner_id uuid,
              inquiry_id uuid, created_at timestamptz)
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
RETURNS TABLE(uid text, kind text, title text, description text, location text,
              starts_at timestamptz, ends_at timestamptz, all_day_date date, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  with me as (
    select f.user_id from public.calendar_feeds f
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
  where t.assignee_id = me.user_id and t.status <> 'done' and t.due_date is not null
    and t.due_date > current_date - 60
    and (t.matter_id is null or not public.user_walled_from_matter(t.matter_id, me.user_id))
$$;

-- What the browser may know about its own connections (never the tokens).
CREATE OR REPLACE FUNCTION public.my_calendar_connections()
RETURNS TABLE(provider text, account_email text, last_synced_at timestamptz, last_error text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select c.provider, c.account_email, c.last_synced_at, c.last_error, c.created_at
  from public.calendar_connections c where c.user_id = auth.uid()
$$;

REVOKE EXECUTE ON FUNCTION public.calendar_events_for_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calendar_events_for_user(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.calendar_feed(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calendar_feed(text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.my_calendar_connections() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_calendar_connections() TO authenticated, service_role;
