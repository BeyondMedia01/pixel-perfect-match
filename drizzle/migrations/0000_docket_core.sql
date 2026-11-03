
create type public.app_role as enum ('admin','lawyer','staff','client');
create type public.client_type as enum ('individual','company');
create type public.practice_area as enum ('litigation','conveyancing','corporate','family','labour','criminal','other');
create type public.matter_status as enum ('intake','active','on_hold','closed');
create type public.party_role as enum ('opposing_party','opposing_counsel','related_party','witness','other');
create type public.event_type as enum ('court_date','hearing','meeting','filing_deadline','other');
create type public.task_status as enum ('todo','in_progress','waiting','done');
create type public.task_priority as enum ('low','medium','high','urgent');

-- profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  title text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_internal(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role in ('admin','lawyer','staff'))
$$;

create policy "internal read profiles" on public.profiles for select to authenticated
  using (public.is_internal(auth.uid()) or id = auth.uid());
create policy "update own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "read own roles or admin" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_internal(auth.uid()));
create policy "admin manage roles" on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
grant insert, update, delete on public.user_roles to authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)), new.email);
  if not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  else
    insert into public.user_roles (user_id, role) values (new.id, 'staff');
  end if;
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- clients
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  type client_type not null default 'individual',
  name text not null,
  id_number text,
  email text,
  phone text,
  address text,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.clients to authenticated;
grant all on public.clients to service_role;
alter table public.clients enable row level security;
create policy "internal read clients" on public.clients for select to authenticated using (public.is_internal(auth.uid()));
create policy "internal insert clients" on public.clients for insert to authenticated with check (public.is_internal(auth.uid()));
create policy "internal update clients" on public.clients for update to authenticated using (public.is_internal(auth.uid()));
create policy "admin delete clients" on public.clients for delete to authenticated using (public.has_role(auth.uid(),'admin'));

-- matters
create sequence public.matter_seq;
create table public.matters (
  id uuid primary key default gen_random_uuid(),
  matter_number text unique,
  title text not null,
  client_id uuid not null references public.clients(id) on delete restrict,
  practice_area practice_area not null default 'other',
  status matter_status not null default 'intake',
  responsible_lawyer_id uuid references public.profiles(id) on delete set null,
  opposing_party text,
  opposing_counsel text,
  court text,
  case_number text,
  description text,
  date_opened date not null default current_date,
  date_closed date,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.matters to authenticated;
grant all on public.matters to service_role;
alter table public.matters enable row level security;

create or replace function public.set_matter_number()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.matter_number is null then
    new.matter_number := extract(year from coalesce(new.date_opened, current_date))::text || '-' || lpad(nextval('public.matter_seq')::text, 4, '0');
  end if;
  return new;
end; $$;
create trigger matters_number before insert on public.matters for each row execute function public.set_matter_number();

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end; $$;
create trigger matters_touch before update on public.matters for each row execute function public.touch_updated_at();
create trigger clients_touch before update on public.clients for each row execute function public.touch_updated_at();

create table public.matter_assignments (
  id uuid primary key default gen_random_uuid(),
  matter_id uuid not null references public.matters(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (matter_id, user_id)
);
grant select, insert, update, delete on public.matter_assignments to authenticated;
grant all on public.matter_assignments to service_role;
alter table public.matter_assignments enable row level security;

create or replace function public.can_access_matter(_matter_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(auth.uid(),'admin')
    or exists (select 1 from public.matters m where m.id = _matter_id and m.responsible_lawyer_id = auth.uid())
    or exists (select 1 from public.matter_assignments a where a.matter_id = _matter_id and a.user_id = auth.uid())
$$;

create policy "read accessible matters" on public.matters for select to authenticated
  using (public.has_role(auth.uid(),'admin') or responsible_lawyer_id = auth.uid()
    or exists (select 1 from public.matter_assignments a where a.matter_id = id and a.user_id = auth.uid())
    or (created_by = auth.uid()));
create policy "internal create matters" on public.matters for insert to authenticated
  with check (public.is_internal(auth.uid()) and created_by = auth.uid());
create policy "update accessible matters" on public.matters for update to authenticated
  using (public.is_internal(auth.uid()) and public.can_access_matter(id));
create policy "admin delete matters" on public.matters for delete to authenticated
  using (public.has_role(auth.uid(),'admin'));

create policy "read assignments" on public.matter_assignments for select to authenticated
  using (public.can_access_matter(matter_id));
create policy "manage assignments" on public.matter_assignments for all to authenticated
  using (public.is_internal(auth.uid()) and public.can_access_matter(matter_id))
  with check (public.is_internal(auth.uid()) and public.can_access_matter(matter_id));

-- related parties
create table public.related_parties (
  id uuid primary key default gen_random_uuid(),
  matter_id uuid not null references public.matters(id) on delete cascade,
  name text not null,
  role party_role not null default 'related_party',
  email text, phone text, organisation text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.related_parties to authenticated;
grant all on public.related_parties to service_role;
alter table public.related_parties enable row level security;
create policy "rp access" on public.related_parties for all to authenticated
  using (public.is_internal(auth.uid()) and public.can_access_matter(matter_id))
  with check (public.is_internal(auth.uid()) and public.can_access_matter(matter_id));

-- notes
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  matter_id uuid not null references public.matters(id) on delete cascade,
  body text not null,
  author_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.notes to authenticated;
grant all on public.notes to service_role;
alter table public.notes enable row level security;
create policy "notes read" on public.notes for select to authenticated using (public.is_internal(auth.uid()) and public.can_access_matter(matter_id));
create policy "notes insert" on public.notes for insert to authenticated with check (public.is_internal(auth.uid()) and public.can_access_matter(matter_id) and author_id = auth.uid());
create policy "notes delete own" on public.notes for delete to authenticated using (author_id = auth.uid() or public.has_role(auth.uid(),'admin'));

-- events
create table public.events (
  id uuid primary key default gen_random_uuid(),
  matter_id uuid references public.matters(id) on delete cascade,
  title text not null,
  type event_type not null default 'other',
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  reminder_days int[] not null default '{}',
  owner_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.events to authenticated;
grant all on public.events to service_role;
alter table public.events enable row level security;
create policy "events access" on public.events for all to authenticated
  using (public.is_internal(auth.uid()) and (matter_id is null and owner_id = auth.uid() or matter_id is not null and public.can_access_matter(matter_id)))
  with check (public.is_internal(auth.uid()) and (matter_id is null or public.can_access_matter(matter_id)));

-- tasks
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  matter_id uuid references public.matters(id) on delete cascade,
  title text not null,
  description text,
  assignee_id uuid references public.profiles(id) on delete set null,
  due_date date,
  priority task_priority not null default 'medium',
  status task_status not null default 'todo',
  created_by uuid,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.tasks to authenticated;
grant all on public.tasks to service_role;
alter table public.tasks enable row level security;
create policy "tasks access" on public.tasks for all to authenticated
  using (public.is_internal(auth.uid()) and (assignee_id = auth.uid() or (matter_id is not null and public.can_access_matter(matter_id)) or public.has_role(auth.uid(),'admin')))
  with check (public.is_internal(auth.uid()) and (matter_id is null or public.can_access_matter(matter_id)));

-- activity log
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  matter_id uuid,
  action text not null,
  summary text,
  changes jsonb,
  user_id uuid,
  created_at timestamptz not null default now()
);
grant select on public.activity_log to authenticated;
grant all on public.activity_log to service_role;
alter table public.activity_log enable row level security;
create policy "activity read" on public.activity_log for select to authenticated
  using (public.has_role(auth.uid(),'admin') or (matter_id is not null and public.is_internal(auth.uid()) and public.can_access_matter(matter_id)));

create or replace function public.log_matter_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.activity_log(entity_type, entity_id, matter_id, action, summary, user_id)
    values ('matter', new.id, new.id, 'created', 'Matter opened', auth.uid());
    return new;
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      insert into public.activity_log(entity_type, entity_id, matter_id, action, summary, changes, user_id)
      values ('matter', new.id, new.id, 'status_changed', 'Status changed from ' || old.status || ' to ' || new.status,
        jsonb_build_object('from', old.status, 'to', new.status), auth.uid());
    else
      insert into public.activity_log(entity_type, entity_id, matter_id, action, summary, user_id)
      values ('matter', new.id, new.id, 'updated', 'Matter details updated', auth.uid());
    end if;
    return new;
  else
    insert into public.activity_log(entity_type, entity_id, matter_id, action, summary, user_id)
    values ('matter', old.id, null, 'deleted', 'Matter ' || old.matter_number || ' deleted', auth.uid());
    return old;
  end if;
end; $$;
create trigger matters_audit after insert or update or delete on public.matters for each row execute function public.log_matter_change();

-- conflict check (searches across all clients and parties, minimal fields)
create or replace function public.conflict_check(q text)
returns table(source text, name text, detail text, matter_number text)
language sql stable security definer set search_path = public as $$
  select * from (
    select 'client'::text, c.name, c.type::text, null::text from public.clients c
      where public.is_internal(auth.uid()) and c.name ilike '%' || q || '%'
    union all
    select 'opposing_party', m.opposing_party, m.title, m.matter_number from public.matters m
      where public.is_internal(auth.uid()) and m.opposing_party ilike '%' || q || '%'
    union all
    select rp.role::text, rp.name, m.title, m.matter_number from public.related_parties rp join public.matters m on m.id = rp.matter_id
      where public.is_internal(auth.uid()) and rp.name ilike '%' || q || '%'
  ) s limit 50
$$;
grant execute on function public.conflict_check(text) to authenticated;

