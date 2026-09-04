-- =============================================================================
-- 093_last_login_mfa_at.sql
-- Additive. Does not modify 090.
-- Records the last successful login MFA (email/SMS), not trusted-device skip.
-- Used so "Require MFA Immediately" cannot be satisfied by minting a new
-- sp_mfa cookie from an existing trusted device.
-- =============================================================================

ALTER TABLE public.user_security_settings
  ADD COLUMN IF NOT EXISTS last_login_mfa_at timestamptz;

COMMENT ON COLUMN public.user_security_settings.last_login_mfa_at IS
  'Last successful login MFA (email or SMS). Trusted-device skips and policy-skip cookies must not update this.';
