-- Organization notification master switches default ON.
-- One-time update for existing rows, plus defaults for future rows.
-- Does not touch SMS consent, endpoints, suppression, or user preferences.

ALTER TABLE public.organization_notification_settings
  ALTER COLUMN email_notifications_enabled SET DEFAULT true,
  ALTER COLUMN push_notifications_enabled SET DEFAULT true,
  ALTER COLUMN sms_notifications_enabled SET DEFAULT true;

UPDATE public.organization_notification_settings
SET
  email_notifications_enabled = true,
  push_notifications_enabled = true,
  sms_notifications_enabled = true;

INSERT INTO public.organization_notification_settings (organization_id)
SELECT o.id
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1
  FROM public.organization_notification_settings s
  WHERE s.organization_id = o.id
)
ON CONFLICT (organization_id) DO NOTHING;

UPDATE public.organizations
SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object(
  'enable_email_notifications', true,
  'enable_push_notifications', true,
  'enable_sms_notifications', true
);
