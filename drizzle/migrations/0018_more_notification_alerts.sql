-- More alert types (assigned tasks, upcoming court dates and hearings,
-- announcements) and a WhatsApp number per person. In-app stays on by default;
-- email and WhatsApp stay opt-in. Choices are stored only: nothing sends yet.
ALTER TABLE public.notification_preferences
  ADD COLUMN tasks_assigned boolean NOT NULL DEFAULT true,
  ADD COLUMN upcoming_hearings boolean NOT NULL DEFAULT true,
  ADD COLUMN announcements boolean NOT NULL DEFAULT true,
  ADD COLUMN email_tasks_assigned boolean NOT NULL DEFAULT false,
  ADD COLUMN email_upcoming_hearings boolean NOT NULL DEFAULT false,
  ADD COLUMN email_announcements boolean NOT NULL DEFAULT false,
  ADD COLUMN whatsapp_tasks_assigned boolean NOT NULL DEFAULT false,
  ADD COLUMN whatsapp_upcoming_hearings boolean NOT NULL DEFAULT false,
  ADD COLUMN whatsapp_announcements boolean NOT NULL DEFAULT false,
  ADD COLUMN whatsapp_number text
    CONSTRAINT notification_preferences_whatsapp_number_format
    CHECK (whatsapp_number IS NULL OR whatsapp_number ~ '^\+[1-9][0-9]{7,14}$');

COMMENT ON COLUMN public.notification_preferences.whatsapp_number IS
  'Where WhatsApp alerts go, in international format (+263…). Only the person themselves can read or change it.';
