-- =============================================================================
-- 090_mfa_policy_settings.sql
-- Platform + organization MFA policy. Additive / non-destructive.
-- Disabling MFA is a policy bypass, not unenrollment.
-- Existing organizations default to MFA required (true).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.platform_security_settings (
  id smallint PRIMARY KEY DEFAULT 1,
  mfa_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT platform_security_settings_singleton CHECK (id = 1)
);

INSERT INTO public.platform_security_settings (id, mfa_enabled)
VALUES (1, true)
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS platform_security_settings_updated_at
  ON public.platform_security_settings;
CREATE TRIGGER platform_security_settings_updated_at
  BEFORE UPDATE ON public.platform_security_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.organization_security_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  mfa_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.organization_security_settings (organization_id, mfa_enabled)
SELECT o.id, true
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1
  FROM public.organization_security_settings s
  WHERE s.organization_id = o.id
);

DROP TRIGGER IF EXISTS organization_security_settings_updated_at
  ON public.organization_security_settings;
CREATE TRIGGER organization_security_settings_updated_at
  BEFORE UPDATE ON public.organization_security_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_organization_security_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.organization_security_settings (organization_id, mfa_enabled)
  VALUES (NEW.id, true)
  ON CONFLICT (organization_id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_organization_security_settings failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_organization_created_security_settings ON public.organizations;
CREATE TRIGGER on_organization_created_security_settings
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_organization_security_settings();

ALTER TABLE public.platform_security_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_security_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_security_settings_no_direct ON public.platform_security_settings;
DROP POLICY IF EXISTS organization_security_settings_no_direct ON public.organization_security_settings;

REVOKE ALL ON public.platform_security_settings FROM PUBLIC;
REVOKE ALL ON public.platform_security_settings FROM anon;
REVOKE ALL ON public.platform_security_settings FROM authenticated;
REVOKE ALL ON public.organization_security_settings FROM PUBLIC;
REVOKE ALL ON public.organization_security_settings FROM anon;
REVOKE ALL ON public.organization_security_settings FROM authenticated;

SELECT public.seed_platform_permission(
  'security.mfa_policy.manage',
  'Manage MFA policy',
  'Enable or disable login MFA for the platform and for individual organizations.',
  'system'
);

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
