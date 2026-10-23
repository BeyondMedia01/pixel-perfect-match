CREATE TABLE public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id UUID REFERENCES public.matters(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read all, clients read firm-wide or own matters"
ON public.announcements FOR SELECT TO authenticated
USING (
  public.is_internal(auth.uid())
  OR public.is_frontdesk(auth.uid())
  OR matter_id IS NULL
  OR public.can_access_matter(matter_id)
);

CREATE POLICY "Internal staff post announcements"
ON public.announcements FOR INSERT TO authenticated
WITH CHECK (public.is_internal(auth.uid()) AND created_by = auth.uid());

CREATE POLICY "Authors and partners update announcements"
ON public.announcements FOR UPDATE TO authenticated
USING (public.is_internal(auth.uid()) AND (created_by = auth.uid() OR public.has_role(auth.uid(), 'partner')));

CREATE POLICY "Authors and partners delete announcements"
ON public.announcements FOR DELETE TO authenticated
USING (public.is_internal(auth.uid()) AND (created_by = auth.uid() OR public.has_role(auth.uid(), 'partner')));