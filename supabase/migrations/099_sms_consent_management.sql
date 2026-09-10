-- =============================================================================
-- 099_sms_consent_management.sql
-- Auditable SMS consent history, phone verification challenges, and extra
-- endpoint fields. Does not grant SMS consent from a stored phone number.
-- Existing organization slugs and MFA backup phones are unchanged.
-- =============================================================================

ALTER TABLE public.notification_endpoints
  ADD COLUMN IF NOT EXISTS privacy_policy_version text,
  ADD COLUMN IF NOT EXISTS terms_version text,
  ADD COLUMN IF NOT EXISTS destination_region text,
  ADD COLUMN IF NOT EXISTS suppressed_at timestamptz,
  ADD COLUMN IF NOT EXISTS suppression_source text;

CREATE TABLE IF NOT EXISTS public.sms_consent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  endpoint_id uuid REFERENCES public.notification_endpoints (id) ON DELETE SET NULL,
  phone_e164 text,
  event_type text NOT NULL,
  source text,
  consent_text_version text,
  privacy_policy_version text,
  terms_version text,
  ip_address text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sms_consent_events_type_check
    CHECK (
      event_type IN (
        'CONSENT_PRESENTED',
        'CONSENT_ACCEPTED',
        'CONSENT_REJECTED',
        'VERIFICATION_SENT',
        'PHONE_VERIFIED',
        'SMS_ENABLED',
        'SMS_OPTED_OUT',
        'SMS_REOPTED_IN',
        'PHONE_CHANGED',
        'SMS_SUSPENDED',
        'SMS_SUPPRESSED',
        'HELP_REQUESTED'
      )
    )
);

CREATE INDEX IF NOT EXISTS sms_consent_events_user_org_idx
  ON public.sms_consent_events (organization_id, user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sms_consent_events_phone_idx
  ON public.sms_consent_events (phone_e164, created_at DESC)
  WHERE phone_e164 IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.sms_phone_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  phone_e164 text NOT NULL,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sms_phone_verifications_active_idx
  ON public.sms_phone_verifications (user_id, organization_id, created_at DESC)
  WHERE consumed_at IS NULL;

ALTER TABLE public.sms_consent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_phone_verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "SMS consent events readable by owner"
  ON public.sms_consent_events;
CREATE POLICY "SMS consent events readable by owner"
  ON public.sms_consent_events
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "SMS consent events insertable by owner"
  ON public.sms_consent_events;
CREATE POLICY "SMS consent events insertable by owner"
  ON public.sms_consent_events
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Verification codes are never readable by authenticated clients.
DROP POLICY IF EXISTS "SMS phone verifications no client access"
  ON public.sms_phone_verifications;

REVOKE ALL ON public.sms_phone_verifications FROM authenticated;
REVOKE UPDATE, DELETE ON public.sms_consent_events FROM authenticated;
GRANT SELECT, INSERT ON public.sms_consent_events TO authenticated;
GRANT ALL ON public.sms_consent_events TO service_role;
GRANT ALL ON public.sms_phone_verifications TO service_role;

COMMENT ON TABLE public.sms_consent_events IS
  'Append-only SMS consent history. IP and user-agent are owner/service-role only.';
COMMENT ON TABLE public.sms_phone_verifications IS
  'Hashed SMS enrollment verification codes. Service-role access only.';
