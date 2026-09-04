-- =============================================================================
-- 092_mfa_reauth_after.sql
-- Additive. Does not modify 090 table definitions beyond new columns.
-- "Require MFA Immediately" stamps a reauthentication cutoff.
-- Does not unenroll MFA or delete trusted devices.
-- =============================================================================

ALTER TABLE public.platform_security_settings
  ADD COLUMN IF NOT EXISTS mfa_reauth_after timestamptz;

ALTER TABLE public.organization_security_settings
  ADD COLUMN IF NOT EXISTS mfa_reauth_after timestamptz;

COMMENT ON COLUMN public.platform_security_settings.mfa_reauth_after IS
  'When set, MFA cookies issued before this timestamp must be refreshed. Trusted devices are not deleted.';

COMMENT ON COLUMN public.organization_security_settings.mfa_reauth_after IS
  'When set, MFA cookies for this organization issued before this timestamp must be refreshed. Does not affect other organizations.';
