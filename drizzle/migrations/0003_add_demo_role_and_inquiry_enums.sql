ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'partner';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'paralegal';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'frontdesk';
CREATE TYPE public.inquiry_status AS ENUM ('new', 'consult', 'accepted', 'declined');