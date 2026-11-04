-- Invite-only access and first-time onboarding.
--
-- Nobody gets in by signing up. A firm's managing partner is invited by the
-- platform (Revixions), everyone else by a partner. On their first visit they
-- set a password, enter their own details and, for a partner, the firm's
-- details that appear on invoices. Until then the app sends them to /welcome.

ALTER TABLE public.profiles
  ADD COLUMN phone text CONSTRAINT profiles_phone_length CHECK (phone IS NULL OR length(phone) <= 40),
  ADD COLUMN onboarded_at timestamptz;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_title_length CHECK (title IS NULL OR length(title) <= 80);

-- Everyone already using Acta has, in effect, been onboarded.
UPDATE public.profiles SET onboarded_at = created_at WHERE onboarded_at IS NULL;

-- Roles come only from an invitation. The old "first sign-up becomes partner"
-- rule is gone: on a new workspace the first partner is invited by the platform.
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

  if inv.id is not null then
    insert into public.user_roles (user_id, role) values (new.id, inv.role);
    update public.team_invitations set accepted_at = now(), accepted_user_id = new.id where id = inv.id;
  end if;
  return new;
end; $$;

-- Finish onboarding: the person's own details, and for a partner the firm's
-- details too (the firm name is required, because invoices need it).
CREATE OR REPLACE FUNCTION public.complete_onboarding(
  _full_name text,
  _title text,
  _phone text,
  _firm jsonb DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
declare
  me uuid := auth.uid();
  partner boolean := public.has_role(me, 'admin');
  rate numeric;
begin
  if me is null then
    raise exception 'Please sign in again' using errcode = '42501';
  end if;
  if not exists (select 1 from public.user_roles where user_id = me) then
    raise exception 'Your account is waiting for a partner to give you access' using errcode = '42501';
  end if;
  if length(trim(coalesce(_full_name, ''))) not between 2 and 100 then
    raise exception 'Enter your full name';
  end if;

  if _firm is not null then
    if not partner then
      raise exception 'Only a partner can set the firm''s details' using errcode = '42501';
    end if;
    rate := coalesce(nullif(_firm->>'vat_rate', '')::numeric, 0);
    update public.firm_settings set
      firm_name = nullif(trim(_firm->>'firm_name'), ''),
      address = nullif(trim(_firm->>'address'), ''),
      phone = nullif(trim(_firm->>'phone'), ''),
      email = nullif(lower(trim(_firm->>'email')), ''),
      registration_no = nullif(trim(_firm->>'registration_no'), ''),
      vat_number = nullif(trim(_firm->>'vat_number'), ''),
      vat_rate = rate,
      updated_by = me,
      updated_at = now()
    where id = 1;
  end if;
  if partner and (select nullif(trim(firm_name), '') from public.firm_settings where id = 1) is null then
    raise exception 'Enter your firm''s name. It appears on your invoices.';
  end if;

  update public.profiles set
    full_name = trim(_full_name),
    title = nullif(trim(coalesce(_title, '')), ''),
    phone = nullif(trim(coalesce(_phone, '')), ''),
    onboarded_at = coalesce(onboarded_at, now())
  where id = me;
end; $$;
REVOKE EXECUTE ON FUNCTION public.complete_onboarding(text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_onboarding(text, text, text, jsonb) TO authenticated, service_role;

-- The platform invites a firm's managing partner (server only, service role).
-- Records a partner invitation and, if the firm has no name yet, a suggested one
-- the partner can change during onboarding. Returns 'invited' or 'assigned'.
CREATE OR REPLACE FUNCTION public.platform_invite_owner(_email text, _full_name text, _firm_name text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare
  e text := lower(trim(_email));
  existing uuid;
begin
  if e !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email address';
  end if;
  if nullif(trim(coalesce(_firm_name, '')), '') is not null then
    update public.firm_settings set firm_name = left(trim(_firm_name), 120), updated_at = now()
      where id = 1 and nullif(trim(coalesce(firm_name, '')), '') is null;
  end if;

  select p.id into existing from public.profiles p where lower(p.email) = e;
  if existing is not null then
    delete from public.user_roles where user_id = existing and role <> 'partner';
    insert into public.user_roles (user_id, role) values (existing, 'partner') on conflict do nothing;
    return 'assigned';
  end if;

  update public.team_invitations
    set role = 'partner', full_name = coalesce(nullif(trim(_full_name), ''), full_name),
        invited_by = null, created_at = now()
    where lower(email) = e and accepted_at is null and revoked_at is null;
  if not found then
    insert into public.team_invitations (email, full_name, role, invited_by)
      values (e, nullif(trim(_full_name), ''), 'partner', null);
  end if;
  return 'invited';
end; $$;
REVOKE EXECUTE ON FUNCTION public.platform_invite_owner(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_invite_owner(text, text, text) TO service_role;
