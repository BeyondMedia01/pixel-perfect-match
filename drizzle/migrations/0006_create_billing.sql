CREATE TYPE public.invoice_status AS ENUM ('draft','sent','paid','void');

CREATE TABLE public.time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id uuid NOT NULL REFERENCES public.matters(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  entry_date date NOT NULL DEFAULT current_date,
  description text NOT NULL,
  hours numeric(6,2) NOT NULL CHECK (hours > 0 AND hours <= 24),
  hourly_rate numeric(10,2) NOT NULL DEFAULT 250 CHECK (hourly_rate >= 0),
  billable boolean NOT NULL DEFAULT true,
  invoice_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_entries TO authenticated;
GRANT ALL ON public.time_entries TO service_role;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE,
  matter_id uuid NOT NULL REFERENCES public.matters(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  status public.invoice_status NOT NULL DEFAULT 'draft',
  issue_date date NOT NULL DEFAULT current_date,
  due_date date NOT NULL DEFAULT (current_date + 30),
  notes text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric(8,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price numeric(10,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_items TO authenticated;
GRANT ALL ON public.invoice_items TO service_role;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.time_entries
  ADD CONSTRAINT time_entries_invoice_fk FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.next_invoice_number()
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT 'INV-' || to_char(current_date,'YYYY') || '-' || lpad((count(*)+1)::text, 4, '0') FROM public.invoices;
$$;

-- time entries: internal staff see entries on matters they can access; each person logs and edits their own; partner edits all
CREATE POLICY "read time entries on accessible matters" ON public.time_entries FOR SELECT TO authenticated
  USING (public.is_internal(auth.uid()) AND public.can_access_matter(matter_id));
CREATE POLICY "log own time" ON public.time_entries FOR INSERT TO authenticated
  WITH CHECK (public.is_internal(auth.uid()) AND user_id = auth.uid() AND public.can_access_matter(matter_id));
CREATE POLICY "edit own or partner edits" ON public.time_entries FOR UPDATE TO authenticated
  USING ((user_id = auth.uid() OR public.has_role(auth.uid(),'admin')) AND public.can_access_matter(matter_id))
  WITH CHECK ((user_id = auth.uid() OR public.has_role(auth.uid(),'admin')) AND public.can_access_matter(matter_id));
CREATE POLICY "delete own or partner deletes" ON public.time_entries FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- invoices: internal staff read; partner (admin) creates and manages
CREATE POLICY "internal read invoices" ON public.invoices FOR SELECT TO authenticated
  USING (public.is_internal(auth.uid()) AND public.can_access_matter(matter_id));
CREATE POLICY "partner manages invoices" ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "partner updates invoices" ON public.invoices FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "partner deletes invoices" ON public.invoices FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "internal read invoice items" ON public.invoice_items FOR SELECT TO authenticated
  USING (public.is_internal(auth.uid()) AND EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND public.can_access_matter(i.matter_id)));
CREATE POLICY "partner manages invoice items" ON public.invoice_items FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "partner updates invoice items" ON public.invoice_items FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "partner deletes invoice items" ON public.invoice_items FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- demo billing data on seeded matters
INSERT INTO public.time_entries (matter_id, user_id, entry_date, description, hours, hourly_rate)
SELECT m.id, p.id, current_date - 12, 'Initial consultation and case assessment', 1.5, 250
FROM public.matters m, public.profiles p WHERE m.matter_number = '2026-0001' AND p.email = 'bechanibk@gmail.com';
INSERT INTO public.time_entries (matter_id, user_id, entry_date, description, hours, hourly_rate)
SELECT m.id, p.id, current_date - 9, 'Draft letter of demand to Sable Mining', 2.0, 250
FROM public.matters m, public.profiles p WHERE m.matter_number = '2026-0001' AND p.email = 'bechanibk@gmail.com';
INSERT INTO public.time_entries (matter_id, user_id, entry_date, description, hours, hourly_rate)
SELECT m.id, p.id, current_date - 4, 'Review of supply contract and breach analysis', 3.5, 250
FROM public.matters m, public.profiles p WHERE m.matter_number = '2026-0001' AND p.email = 'bechanibk@gmail.com';
INSERT INTO public.time_entries (matter_id, user_id, entry_date, description, hours, hourly_rate, billable)
SELECT m.id, p.id, current_date - 2, 'Internal team briefing (non-billable)', 1.0, 0, false
FROM public.matters m, public.profiles p WHERE m.matter_number = '2026-0001' AND p.email = 'bechanibk@gmail.com';
INSERT INTO public.time_entries (matter_id, user_id, entry_date, description, hours, hourly_rate)
SELECT m.id, p.id, current_date - 6, 'Consultation on estate planning options', 2.0, 220
FROM public.matters m, public.profiles p WHERE m.matter_number = '2026-0003' AND p.email = 'bechanibk@gmail.com';
INSERT INTO public.time_entries (matter_id, user_id, entry_date, description, hours, hourly_rate)
SELECT m.id, p.id, current_date - 3, 'Draft will and testament', 2.5, 220
FROM public.matters m, public.profiles p WHERE m.matter_number = '2026-0003' AND p.email = 'bechanibk@gmail.com';

-- one paid invoice on 2026-0003 covering two earlier entries
INSERT INTO public.invoices (invoice_number, matter_id, client_id, status, issue_date, due_date, created_by)
SELECT 'INV-2026-0001', m.id, m.client_id, 'paid', current_date - 20, current_date - 20 + 30, p.id
FROM public.matters m, public.profiles p WHERE m.matter_number = '2026-0003' AND p.email = 'bechanibk@gmail.com';
INSERT INTO public.invoice_items (invoice_id, description, quantity, unit_price)
SELECT i.id, 'Estate planning consultation', 2.0, 220 FROM public.invoices i WHERE i.invoice_number = 'INV-2026-0001';
INSERT INTO public.invoice_items (invoice_id, description, quantity, unit_price)
SELECT i.id, 'Drafting of will', 1.0, 440 FROM public.invoices i WHERE i.invoice_number = 'INV-2026-0001';