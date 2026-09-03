-- =============================================================================
-- 087_user_mfa_security.sql
-- Login MFA policy storage: verified backup phone + hashed one-time codes.
-- Additive / non-destructive. Safe to re-run.
--
-- Product rules this table enforces:
--   - Email is the primary login second factor (account email, never typed-in)
--   - SMS is backup only, and only to a previously verified E.164 number
--   - Login must never accept a new phone number
--   - verified_phone is written only by the server after a successful SMS code
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.user_security_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email_mfa_enabled boolean NOT NULL DEFAULT true,
  sms_backup_enabled boolean NOT NULL DEFAULT false,
  verified_phone text,
  phone_verified_at timestamptz,
  trusted_device_enabled boolean NOT NULL DEFAULT false,
  mfa_required boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_security_settings_verified_phone_e164 CHECK (
    verified_phone IS NULL OR verified_phone ~ '^\+[1-9][0-9]{7,14}$'
  ),
  CONSTRAINT user_security_settings_phone_verified_pair CHECK (
    (verified_phone IS NULL AND phone_verified_at IS NULL)
    OR (verified_phone IS NOT NULL AND phone_verified_at IS NOT NULL)
  ),
  CONSTRAINT user_security_settings_sms_requires_phone CHECK (
    sms_backup_enabled = false OR verified_phone IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS public.user_mfa_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  purpose text NOT NULL,
  channel text NOT NULL,
  destination text NOT NULL,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_mfa_challenges_purpose_check CHECK (
    purpose IN ('login', 'phone_enroll')
  ),
  CONSTRAINT user_mfa_challenges_channel_check CHECK (
    channel IN ('email', 'sms')
  ),
  CONSTRAINT user_mfa_challenges_destination_nonempty CHECK (
    length(trim(destination)) > 0
  ),
  CONSTRAINT user_mfa_challenges_attempts_check CHECK (
    attempts >= 0 AND max_attempts > 0
  )
);

CREATE INDEX IF NOT EXISTS user_mfa_challenges_user_purpose_idx
  ON public.user_mfa_challenges (user_id, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS user_mfa_challenges_active_idx
  ON public.user_mfa_challenges (user_id, purpose, channel)
  WHERE consumed_at IS NULL;

DROP TRIGGER IF EXISTS user_security_settings_updated_at ON public.user_security_settings;
CREATE TRIGGER user_security_settings_updated_at
  BEFORE UPDATE ON public.user_security_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Auto-create settings for new and existing users
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user_security_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_security_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user_security_settings failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_security_settings ON auth.users;
CREATE TRIGGER on_auth_user_created_security_settings
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_security_settings();

INSERT INTO public.user_security_settings (user_id)
SELECT u.id
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1
  FROM public.user_security_settings s
  WHERE s.user_id = u.id
)
ON CONFLICT (user_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- RLS: users may read their own settings. All writes go through the
-- service role after the app verifies a one-time code.
-- Challenges are never exposed to the authenticated client.
-- ---------------------------------------------------------------------------

ALTER TABLE public.user_security_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_mfa_challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_security_settings_select_own ON public.user_security_settings;
CREATE POLICY user_security_settings_select_own
  ON public.user_security_settings
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON public.user_security_settings FROM PUBLIC;
REVOKE ALL ON public.user_mfa_challenges FROM PUBLIC;
REVOKE ALL ON public.user_security_settings FROM anon;
REVOKE ALL ON public.user_mfa_challenges FROM anon;
REVOKE ALL ON public.user_mfa_challenges FROM authenticated;

GRANT SELECT ON public.user_security_settings TO authenticated;
