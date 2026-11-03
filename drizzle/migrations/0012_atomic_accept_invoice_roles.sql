-- Audit follow-ups, batch 3: multi-step saves happen in one transaction, invoice
-- numbers come from a per-year counter, and role changes are a single step.
-- The functions below run with the caller's own permissions (SECURITY INVOKER),
-- so every row-level rule still applies inside them.

-- Fix from batch 2: a non-partner creating a client couldn't read it back in the
-- same statement (insert ... returning), because can_access_client() looks the
-- row up and the new row isn't visible to that lookup yet. Check the row's own
-- created_by column instead, plus a wall check that sees every matter.
CREATE OR REPLACE FUNCTION public.walled_from_client(_client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select exists (
    select 1 from public.matters m join public.matter_ethical_walls w on w.matter_id = m.id
    where m.client_id = _client_id and w.user_id = auth.uid())
$$;
DROP POLICY IF EXISTS "read accessible clients" ON public.clients;
CREATE POLICY "read accessible clients" ON public.clients FOR SELECT TO authenticated
  USING (public.can_access_client(id)
    OR (created_by = auth.uid() AND public.is_internal(auth.uid()) AND NOT public.walled_from_client(id)));

-- Invoice numbers: INV-<year>-<0001…>, one counter per year, safe when two
-- partners invoice at once and never reused after a delete.
CREATE TABLE public.invoice_counters (
  year integer PRIMARY KEY,
  last_number integer NOT NULL CHECK (last_number >= 0)
);
GRANT ALL ON public.invoice_counters TO service_role;
ALTER TABLE public.invoice_counters ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.next_invoice_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare
  y int := extract(year from current_date)::int;
  highest int;
  n int;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Only a partner can issue invoice numbers' using errcode = '42501';
  end if;
  -- Never fall behind numbers already issued (older invoices, imported data).
  select coalesce(max(split_part(invoice_number, '-', 3)::int), 0) into highest
    from public.invoices where invoice_number ~ ('^INV-' || y || '-[0-9]+$');
  insert into public.invoice_counters as c (year, last_number) values (y, highest + 1)
    on conflict (year) do update set last_number = greatest(c.last_number, highest) + 1
    returning last_number into n;
  return 'INV-' || y || '-' || lpad(n::text, 4, '0');
end; $$;

-- Create an invoice from unbilled time entries in one step.
CREATE OR REPLACE FUNCTION public.create_invoice(_matter_id uuid, _entry_ids uuid[], _due_date date, _notes text DEFAULT NULL)
RETURNS TABLE(id uuid, invoice_number text)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
declare
  _client_id uuid;
  _number text;
  _invoice_id uuid;
  _found int;
begin
  select m.client_id into _client_id from public.matters m where m.id = _matter_id;
  if _client_id is null then raise exception 'Matter not found'; end if;

  select count(*) into _found from public.time_entries t
    where t.id = any(_entry_ids) and t.matter_id = _matter_id and t.invoice_id is null and t.billable;
  if _found = 0 or _found <> coalesce(array_length(_entry_ids, 1), 0) then
    raise exception 'Some selected time entries are already invoiced, non-billable or on another matter';
  end if;

  _number := public.next_invoice_number();
  insert into public.invoices (invoice_number, matter_id, client_id, status, due_date, notes, created_by)
    values (_number, _matter_id, _client_id, 'draft', _due_date, nullif(trim(coalesce(_notes, '')), ''), auth.uid())
    returning invoices.id into _invoice_id;

  insert into public.invoice_items (invoice_id, description, quantity, unit_price)
    select _invoice_id, t.description || ' (' || to_char(t.entry_date, 'FMDD Mon YYYY') || ')', t.hours, t.hourly_rate
    from public.time_entries t where t.id = any(_entry_ids)
    order by t.entry_date;

  update public.time_entries t set invoice_id = _invoice_id where t.id = any(_entry_ids);

  return query select _invoice_id, _number;
end; $$;

-- Accept an inquiry: create (or reuse) the client, open the matter, mark the
-- inquiry accepted and log it, all or nothing.
CREATE OR REPLACE FUNCTION public.accept_inquiry(_inquiry_id uuid, _title text, _existing_client_id uuid DEFAULT NULL)
RETURNS TABLE(client_id uuid, matter_id uuid)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
declare
  i public.inquiries%rowtype;
  _client uuid := _existing_client_id;
  _matter uuid;
  _email text;
  _phone text;
begin
  if not public.is_internal(auth.uid()) then
    raise exception 'Only firm staff can accept inquiries' using errcode = '42501';
  end if;
  select * into i from public.inquiries q where q.id = _inquiry_id for update;
  if not found then raise exception 'Inquiry not found'; end if;
  if i.status not in ('new', 'consult') then raise exception 'This inquiry has already been %', i.status; end if;

  if _client is not null then
    -- Reuse an existing client, as long as the caller isn't walled from it.
    if not exists (select 1 from public.client_directory() d where d.id = _client) then
      raise exception 'Client not found';
    end if;
  else
    if position('@' in coalesce(i.contact, '')) > 0 then
      _email := trim(split_part(i.contact, ' · ', 1));
      _phone := nullif(trim(split_part(i.contact, ' · ', 2)), '');
    else
      _phone := nullif(trim(coalesce(i.contact, '')), '');
    end if;
    insert into public.clients (name, type, email, phone, notes, created_by)
      values (i.name, 'individual', _email, _phone,
              'Created from inquiry received ' || to_char(i.received_at, 'FMDD Mon YYYY') || '.', auth.uid())
      returning clients.id into _client;
  end if;

  insert into public.matters (title, client_id, practice_area, status, opposing_party, responsible_lawyer_id, description, created_by)
    values (_title, _client, i.practice_area, 'intake', nullif(i.opposing_party, ''),
            coalesce(i.consult_with, auth.uid()), i.summary, auth.uid())
    returning matters.id into _matter;

  update public.inquiries q set status = 'accepted', matter_id = _matter where q.id = _inquiry_id;

  insert into public.activity_log (entity_type, entity_id, action, summary)
    values ('inquiry', _inquiry_id, 'accepted',
            case when _existing_client_id is null then 'Client and matter created.' else 'Matter opened for an existing client.' end);

  return query select _client, _matter;
end; $$;

-- Change someone's role in one step. Partners only, and not their own role.
CREATE OR REPLACE FUNCTION public.set_user_role(_user_id uuid, _role public.app_role)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Only a partner can change roles' using errcode = '42501';
  end if;
  if _user_id = auth.uid() then
    raise exception 'You can''t change your own role';
  end if;
  delete from public.user_roles where user_id = _user_id;
  insert into public.user_roles (user_id, role) values (_user_id, _role);
end; $$;

REVOKE EXECUTE ON FUNCTION public.walled_from_client(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_invoice(uuid, uuid[], date, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.accept_inquiry(uuid, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_user_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_invoice_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.walled_from_client(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_invoice(uuid, uuid[], date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.accept_inquiry(uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_invoice_number() TO authenticated, service_role;
