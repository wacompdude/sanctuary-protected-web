-- =============================================================================
-- 088_trusted_devices.sql
-- Per-browser trusted devices for skipping repeated login MFA.
-- Additive / non-destructive. Safe to re-run.
--
-- Account verification and device trust are separate:
--   - MFA/session cookie proves this login completed a challenge
--   - trusted_devices + cookie prove this browser may skip the next challenge
-- Token plaintext is never stored. Users cannot read another user's rows.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.trusted_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  device_id uuid NOT NULL,
  token_hash text NOT NULL,
  device_name text,
  device_type text,
  browser text,
  operating_system text,
  first_trusted_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trusted_devices_token_hash_nonempty CHECK (length(trim(token_hash)) >= 32),
  CONSTRAINT trusted_devices_expires_after_trust CHECK (expires_at > first_trusted_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS trusted_devices_user_device_uidx
  ON public.trusted_devices (user_id, device_id);

CREATE UNIQUE INDEX IF NOT EXISTS trusted_devices_token_hash_uidx
  ON public.trusted_devices (token_hash);

CREATE INDEX IF NOT EXISTS trusted_devices_user_active_idx
  ON public.trusted_devices (user_id, expires_at)
  WHERE revoked_at IS NULL;

DROP TRIGGER IF EXISTS trusted_devices_updated_at ON public.trusted_devices;
CREATE TRIGGER trusted_devices_updated_at
  BEFORE UPDATE ON public.trusted_devices
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.trusted_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trusted_devices_select_own ON public.trusted_devices;
CREATE POLICY trusted_devices_select_own
  ON public.trusted_devices
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON public.trusted_devices FROM PUBLIC;
REVOKE ALL ON public.trusted_devices FROM anon;
REVOKE ALL ON public.trusted_devices FROM authenticated;

-- Users may read their own display metadata (RLS). Token hashes stay
-- inaccessible to the authenticated role.
GRANT SELECT (
  id,
  user_id,
  device_id,
  device_name,
  device_type,
  browser,
  operating_system,
  first_trusted_at,
  last_used_at,
  expires_at,
  revoked_at,
  created_at,
  updated_at
) ON public.trusted_devices TO authenticated;

SELECT public.seed_platform_permission(
  'users.revoke_trusted_devices',
  'Revoke trusted devices',
  'Force a user to verify again by revoking their trusted browsers.',
  'users'
);
SELECT public.seed_platform_role_permission('platform_admin', 'users.revoke_trusted_devices');

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT permission_key FROM public.platform_permissions WHERE status = 'active'
  LOOP
    PERFORM public.seed_platform_role_permission('super_admin', r.permission_key);
  END LOOP;
END $$;
