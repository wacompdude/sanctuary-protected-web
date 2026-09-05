-- =============================================================================
-- 094_text_sms_copy.sql
-- User-facing copy: SMS → Text/SMS.
-- Additive / idempotent. Does not rename keys, channels, or feature_key values.
-- Safe to re-run. Does not modify 090.
-- =============================================================================

-- Help categories
UPDATE public.help_categories
SET
  description = replace(description, 'email, SMS, and preferences.', 'email, Text/SMS, and preferences.'),
  updated_at = now()
WHERE description LIKE '%email, SMS, and preferences.%';

-- Help article working copies
UPDATE public.help_articles
SET
  body_content = replace(
    replace(
      replace(
        body_content,
        '- SMS is a separate capability',
        '- Text/SMS is a separate capability'
      ),
      '- SMS, email codes, and trusted-device checks are not required',
      '- Text/SMS, email codes, and trusted-device checks are not required'
    ),
    'you can request a text instead.',
    'you can request a Text/SMS instead.'
  ),
  updated_at = now()
WHERE
  body_content LIKE '%- SMS is a separate capability%'
  OR body_content LIKE '%- SMS, email codes, and trusted-device checks are not required%'
  OR body_content LIKE '%you can request a text instead.%';

-- Published and historical versions (Help Center reads published_version_id)
UPDATE public.help_article_versions
SET
  body_content = replace(
    replace(
      replace(
        body_content,
        '- SMS is a separate capability',
        '- Text/SMS is a separate capability'
      ),
      '- SMS, email codes, and trusted-device checks are not required',
      '- Text/SMS, email codes, and trusted-device checks are not required'
    ),
    'you can request a text instead.',
    'you can request a Text/SMS instead.'
  )
WHERE
  body_content LIKE '%- SMS is a separate capability%'
  OR body_content LIKE '%- SMS, email codes, and trusted-device checks are not required%'
  OR body_content LIKE '%you can request a text instead.%';

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT a.id
    FROM public.help_articles a
    WHERE a.slug IN (
      'send-a-group-email',
      'multi-factor-authentication-policies',
      'sign-in-verification'
    )
    OR a.body_content LIKE '%Text/SMS is a separate capability%'
    OR a.body_content LIKE '%Text/SMS, email codes, and trusted-device checks are not required%'
    OR a.body_content LIKE '%request a Text/SMS instead.%'
  LOOP
    PERFORM public.refresh_help_article_search(r.id);
  END LOOP;
END $$;

-- Plan catalog (customer-visible)
UPDATE public.subscription_plans
SET
  description = replace(description, 'and SMS messaging.', 'and Text/SMS messaging.'),
  updated_at = now()
WHERE plan_key = 'steward_pro'
  AND description LIKE '%and SMS messaging.%';

UPDATE public.subscription_plans
SET
  description = replace(description, 'and higher SMS allowance.', 'and higher Text/SMS allowance.'),
  updated_at = now()
WHERE plan_key = 'shepherd_plus'
  AND description LIKE '%and higher SMS allowance.%';

-- Feature labels (customer-visible; feature_key stays messaging.sms.*)
UPDATE public.features
SET
  display_name = 'Text/SMS messaging',
  description = 'Text/SMS delivery channel (provider required).',
  marketing_title = 'Text/SMS',
  updated_at = now()
WHERE feature_key = 'messaging.sms.enabled';

UPDATE public.features
SET
  display_name = 'Text/SMS monthly segments',
  description = 'Provider-billable Text/SMS segments per subscription billing period.',
  marketing_title = 'Text/SMS segments / period',
  updated_at = now()
WHERE feature_key = 'messaging.sms.monthly_segment_limit';

-- Platform permission labels (permission_key stays system.sms.test)
UPDATE public.platform_permissions
SET
  display_name = 'Send test Text/SMS',
  description = 'Send approved test Text/SMS messages.',
  updated_at = now()
WHERE permission_key = 'system.sms.test';

COMMENT ON COLUMN public.user_security_settings.last_login_mfa_at IS
  'Last successful login MFA (email or Text/SMS). Trusted-device skips and policy-skip cookies must not update this.';
