ALTER TABLE public.notification_preferences
  ADD COLUMN email_new_inquiries boolean NOT NULL DEFAULT false,
  ADD COLUMN email_tasks_due_today boolean NOT NULL DEFAULT false,
  ADD COLUMN email_unconfirmed_deadlines boolean NOT NULL DEFAULT false,
  ADD COLUMN whatsapp_new_inquiries boolean NOT NULL DEFAULT false,
  ADD COLUMN whatsapp_tasks_due_today boolean NOT NULL DEFAULT false,
  ADD COLUMN whatsapp_unconfirmed_deadlines boolean NOT NULL DEFAULT false;
COMMENT ON TABLE public.notification_preferences IS 'Per-user staff alert choices. Existing category columns control in-app alerts; email and WhatsApp choices do not imply channel delivery is configured.';