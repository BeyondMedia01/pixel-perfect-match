-- Security fixes from the November 2026 audit (findings 1, 2, 3 and 6).

-- 1. New sign-ups wait for a partner's approval.
-- The very first account still becomes the partner; everyone after that gets a
-- profile but no role, so is_internal() is false and they see no firm data until
-- a partner assigns a role in Settings.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)), new.email);
  if not exists (select 1 from public.user_roles where role in ('admin','partner')) then
    insert into public.user_roles (user_id, role) values (new.id, 'partner');
  end if;
  return new;
end; $$;

-- 2. Ethical walls now cover documents and their files.
DROP POLICY IF EXISTS "internal read documents" ON public.documents;
DROP POLICY IF EXISTS "internal add documents" ON public.documents;
DROP POLICY IF EXISTS "internal update documents" ON public.documents;
DROP POLICY IF EXISTS "internal delete documents" ON public.documents;

CREATE POLICY "read documents on accessible matters" ON public.documents FOR SELECT TO authenticated
  USING (public.is_internal(auth.uid()) AND (matter_id IS NULL OR public.can_access_matter(matter_id)));
CREATE POLICY "add documents to accessible matters" ON public.documents FOR INSERT TO authenticated
  WITH CHECK (public.is_internal(auth.uid()) AND uploaded_by = auth.uid()
    AND (matter_id IS NULL OR public.can_access_matter(matter_id)));
CREATE POLICY "uploader or partner updates documents" ON public.documents FOR UPDATE TO authenticated
  USING (public.is_internal(auth.uid()) AND (uploaded_by = auth.uid() OR public.has_role(auth.uid(),'admin'))
    AND (matter_id IS NULL OR public.can_access_matter(matter_id)))
  WITH CHECK (public.is_internal(auth.uid()) AND (matter_id IS NULL OR public.can_access_matter(matter_id)));
CREATE POLICY "uploader or partner deletes documents" ON public.documents FOR DELETE TO authenticated
  USING (public.is_internal(auth.uid()) AND (uploaded_by = auth.uid() OR public.has_role(auth.uid(),'admin'))
    AND (matter_id IS NULL OR public.can_access_matter(matter_id)));

-- A stored file is readable when its documents row is readable. A file with no
-- row (an upload in progress, or a file whose row was just deleted) is readable
-- only by the person who uploaded it, or a partner cleaning it up.
CREATE OR REPLACE FUNCTION public.can_read_document_file(_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select public.is_internal(auth.uid()) and case
    when exists (select 1 from public.documents d where d.file_path = _path)
      then exists (select 1 from public.documents d where d.file_path = _path
                   and (d.matter_id is null or public.can_access_matter(d.matter_id)))
    else split_part(_path, '/', 1) = auth.uid()::text or public.has_role(auth.uid(), 'admin')
  end
$$;

DROP POLICY IF EXISTS "internal read document files" ON storage.objects;
DROP POLICY IF EXISTS "internal upload document files" ON storage.objects;
DROP POLICY IF EXISTS "internal update document files" ON storage.objects;
DROP POLICY IF EXISTS "internal delete document files" ON storage.objects;

CREATE POLICY "read permitted document files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'matter-documents' AND public.can_read_document_file(name));
CREATE POLICY "upload document files to own folder" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'matter-documents' AND public.is_internal(auth.uid())
    AND split_part(name, '/', 1) = auth.uid()::text);
CREATE POLICY "update own document files" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'matter-documents' AND public.is_internal(auth.uid())
    AND split_part(name, '/', 1) = auth.uid()::text);
CREATE POLICY "uploader or partner deletes document files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'matter-documents' AND public.is_internal(auth.uid())
    AND (split_part(name, '/', 1) = auth.uid()::text OR public.has_role(auth.uid(),'admin')));

-- Keep the documents bucket private.
INSERT INTO storage.buckets (id, name, public) VALUES ('matter-documents', 'matter-documents', false)
  ON CONFLICT (id) DO UPDATE SET public = false;

-- 3. Walls apply to a matter's creator too (0005 compared the wall's own id, not the matter's).
DROP POLICY IF EXISTS "read accessible matters" ON public.matters;
CREATE POLICY "read accessible matters" ON public.matters FOR SELECT TO authenticated USING (
  public.can_access_matter(matters.id)
  OR (matters.created_by = auth.uid() AND NOT EXISTS (
    SELECT 1 FROM public.matter_ethical_walls w
    WHERE w.matter_id = matters.id AND w.user_id = auth.uid()
  ))
);

-- 6. Conflict counts are for staff and front desk only.
CREATE OR REPLACE FUNCTION public.conflict_check_count(q text)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
begin
  if not (public.is_internal(auth.uid()) or public.is_frontdesk(auth.uid())) then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  return (select count(*)::int from public.clients c where c.name ilike '%' || q || '%')
       + (select count(*)::int from public.matters m where m.opposing_party ilike '%' || q || '%')
       + (select count(*)::int from public.related_parties rp where rp.name ilike '%' || q || '%')
       + (select count(*)::int from public.inquiries i where i.status <> 'accepted'
            and (i.name ilike '%' || q || '%' or (i.opposing_party <> '' and i.opposing_party ilike '%' || q || '%')));
end; $$;

-- Signed-out visitors can't call any of the app's helper functions.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_internal(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_frontdesk(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_lawyerish(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_matter(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_read_document_file(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.conflict_check(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.conflict_check_count(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_invoice_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_internal(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_frontdesk(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_lawyerish(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_matter(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_read_document_file(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conflict_check(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conflict_check_count(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_invoice_number() TO authenticated, service_role;
