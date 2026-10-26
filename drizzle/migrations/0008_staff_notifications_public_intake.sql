CREATE TABLE public.notification_dismissals (user_id uuid NOT NULL, notification_key text NOT NULL CHECK (length(notification_key) BETWEEN 1 AND 160), dismissed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,notification_key));
GRANT SELECT, INSERT ON public.notification_dismissals TO authenticated;
GRANT ALL ON public.notification_dismissals TO service_role;
ALTER TABLE public.notification_dismissals ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_notification_reads ON public.notification_dismissals FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY own_notification_dismissals ON public.notification_dismissals FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid() AND (public.is_internal(auth.uid()) OR public.is_frontdesk(auth.uid())));
CREATE TABLE public.client_intake_submissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), inquiry_id uuid NOT NULL REFERENCES public.inquiries(id) ON DELETE CASCADE, name text NOT NULL CHECK(length(name) BETWEEN 2 AND 100), email text NOT NULL CHECK(length(email) BETWEEN 3 AND 255), phone text CHECK(length(phone)<=40), created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.client_intake_submissions TO authenticated;
GRANT ALL ON public.client_intake_submissions TO service_role;
ALTER TABLE public.client_intake_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY staff_intake_reads ON public.client_intake_submissions FOR SELECT TO authenticated USING(public.is_internal(auth.uid()) OR public.is_frontdesk(auth.uid()));
CREATE TABLE public.intake_rate_limits (key text PRIMARY KEY, window_start timestamptz NOT NULL, requests integer NOT NULL DEFAULT 1);
GRANT ALL ON public.intake_rate_limits TO service_role;
ALTER TABLE public.intake_rate_limits ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.submit_client_intake(_name text,_email text,_phone text,_area public.practice_area,_opposing text,_related text,_summary text,_ip_hash text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE new_id uuid; rate_key text; requests_count integer; max_requests integer;
BEGIN
IF length(trim(_name)) NOT BETWEEN 2 AND 100 OR length(_email) NOT BETWEEN 3 AND 255 OR _email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR length(_phone)>40 OR length(_opposing)>200 OR length(_related)>500 OR length(trim(_summary)) NOT BETWEEN 10 AND 3000 THEN RAISE EXCEPTION 'Invalid intake details'; END IF;
FOREACH rate_key IN ARRAY ARRAY['global', 'email:' || md5(lower(trim(_email))), CASE WHEN _ip_hash IS NOT NULL THEN 'ip:' || _ip_hash ELSE 'email:' || md5(lower(trim(_email))) || ':fallback' END] LOOP
max_requests := CASE WHEN rate_key='global' THEN 100 WHEN rate_key LIKE 'ip:%' THEN 10 ELSE 3 END;
INSERT INTO public.intake_rate_limits AS r(key,window_start,requests) VALUES(rate_key,now(),1) ON CONFLICT(key) DO UPDATE SET requests=CASE WHEN r.window_start<now()-interval '1 hour' THEN 1 ELSE r.requests+1 END, window_start=CASE WHEN r.window_start<now()-interval '1 hour' THEN now() ELSE r.window_start END RETURNING requests INTO requests_count;
IF requests_count>max_requests THEN RAISE EXCEPTION 'INTAKE_RATE_LIMIT'; END IF;
END LOOP;
INSERT INTO public.inquiries(name,contact,practice_area,opposing_party,related_names,summary,status) VALUES(trim(_name),trim(_email) || CASE WHEN trim(coalesce(_phone,''))<>'' THEN ' · ' || trim(_phone) ELSE '' END,_area,trim(_opposing),nullif(trim(_related),''),trim(_summary),'new') RETURNING id INTO new_id;
INSERT INTO public.client_intake_submissions(inquiry_id,name,email,phone) VALUES(new_id,trim(_name),lower(trim(_email)),nullif(trim(_phone),''));
RETURN new_id;
END; $$;
REVOKE ALL ON FUNCTION public.submit_client_intake(text,text,text,public.practice_area,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_client_intake(text,text,text,public.practice_area,text,text,text,text) TO service_role;