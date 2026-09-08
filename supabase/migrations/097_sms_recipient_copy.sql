-- Customer-facing SMS usage wording. Feature key and usage math stay the same.

UPDATE public.features
SET
  display_name = 'Monthly SMS Recipients',
  description = 'Each recipient counts as one SMS. A message sent to 3 people uses 3 SMS.',
  marketing_title = 'SMS Recipients / Month',
  updated_at = now()
WHERE feature_key = 'messaging.sms.monthly_segment_limit';
