CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id uuid REFERENCES public.matters(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  file_path text NOT NULL UNIQUE,
  size_bytes bigint,
  content_type text,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "internal read documents" ON public.documents FOR SELECT TO authenticated USING (public.is_internal(auth.uid()));
CREATE POLICY "internal add documents" ON public.documents FOR INSERT TO authenticated WITH CHECK (public.is_internal(auth.uid()));
CREATE POLICY "internal update documents" ON public.documents FOR UPDATE TO authenticated USING (public.is_internal(auth.uid())) WITH CHECK (public.is_internal(auth.uid()));
CREATE POLICY "internal delete documents" ON public.documents FOR DELETE TO authenticated USING (public.is_internal(auth.uid()));
CREATE POLICY "internal read document files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'matter-documents' AND public.is_internal(auth.uid()));
CREATE POLICY "internal upload document files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'matter-documents' AND public.is_internal(auth.uid()));
CREATE POLICY "internal update document files" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'matter-documents' AND public.is_internal(auth.uid()));
CREATE POLICY "internal delete document files" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'matter-documents' AND public.is_internal(auth.uid()));