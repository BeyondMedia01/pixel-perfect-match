-- Firm profile (name, logo, contact details, invoice details) and VAT on invoices.

CREATE TABLE public.firm_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  firm_name text CHECK (firm_name IS NULL OR length(firm_name) <= 120),
  address text,
  phone text,
  email text,
  website text,
  registration_no text,
  vat_number text,
  vat_rate numeric(5,2) NOT NULL DEFAULT 0 CHECK (vat_rate >= 0 AND vat_rate <= 100),
  bank_details text,
  invoice_footer text,
  logo_path text,
  updated_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.firm_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
REVOKE ALL ON public.firm_settings FROM PUBLIC, anon;
GRANT SELECT, UPDATE ON public.firm_settings TO authenticated;
GRANT ALL ON public.firm_settings TO service_role;
ALTER TABLE public.firm_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read firm profile" ON public.firm_settings FOR SELECT TO authenticated
  USING (public.is_internal(auth.uid()) OR public.is_frontdesk(auth.uid()));
CREATE POLICY "partners edit firm profile" ON public.firm_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- The name and logo are public: the client intake form and sign-in page show them.
CREATE OR REPLACE FUNCTION public.public_firm_profile()
RETURNS TABLE(firm_name text, logo_path text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select f.firm_name, f.logo_path from public.firm_settings f where f.id = 1
$$;
REVOKE EXECUTE ON FUNCTION public.public_firm_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_firm_profile() TO anon, authenticated, service_role;

-- Logos live in a public bucket; only partners can change them.
INSERT INTO storage.buckets (id, name, public) VALUES ('firm-assets', 'firm-assets', true)
  ON CONFLICT (id) DO UPDATE SET public = true;
CREATE POLICY "partners upload firm assets" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'firm-assets' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "partners update firm assets" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'firm-assets' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "partners delete firm assets" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'firm-assets' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "anyone reads firm assets" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'firm-assets');

-- VAT: each invoice keeps the rate it was issued at, so changing the firm's
-- rate later never changes old invoices.
ALTER TABLE public.invoices ADD COLUMN tax_rate numeric(5,2);
UPDATE public.invoices SET tax_rate = 0 WHERE tax_rate IS NULL;
CREATE OR REPLACE FUNCTION public.set_invoice_tax_rate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  if new.tax_rate is null then
    new.tax_rate := coalesce((select vat_rate from public.firm_settings where id = 1), 0);
  end if;
  return new;
end; $$;
CREATE TRIGGER invoices_tax_rate BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_invoice_tax_rate();

-- Demo: give the demo firm a name, letterhead and VAT, once. Called by the
-- server after refresh_demo_data(); never overwrites details a partner set.
CREATE OR REPLACE FUNCTION public.seed_demo_firm_profile()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  update public.firm_settings set
    firm_name = coalesce(firm_name, 'Makoni & Partners'),
    address = coalesce(address, '7th Floor, Pearl House' || E'\n' || '48 Samora Machel Avenue, Harare'),
    phone = coalesce(phone, '+263 242 703 990'),
    email = coalesce(email, 'accounts@makonipartners.co.zw'),
    website = coalesce(website, 'makonipartners.co.zw'),
    registration_no = coalesce(registration_no, 'Law Society of Zimbabwe reg. 2014/117'),
    vat_number = coalesce(vat_number, '10023377'),
    vat_rate = case when vat_rate = 0 then 15 else vat_rate end,
    bank_details = coalesce(bank_details, 'CBZ Bank, Kwame Nkrumah Branch' || E'\n' || 'Account: Makoni & Partners Trust · 01234567890123' || E'\n' || 'Branch code 6101'),
    invoice_footer = coalesce(invoice_footer, 'Payment is due within 30 days. Please quote the invoice number with your payment.'),
    updated_at = now()
  where id = 1;
  update public.invoices set tax_rate = 15 where id = 'dddddddd-0005-0000-0000-000000000001' and tax_rate = 0;
$$;
REVOKE EXECUTE ON FUNCTION public.seed_demo_firm_profile() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_demo_firm_profile() TO service_role;
