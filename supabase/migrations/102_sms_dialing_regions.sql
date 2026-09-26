-- Platform-managed SMS dialing regions.
-- Enabling a row does not configure Bird. provider_ready is separate.
-- End users never read this table directly.

CREATE TABLE IF NOT EXISTS public.sms_dialing_regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_code text NOT NULL UNIQUE,
  display_name text NOT NULL,
  iso_country_code text NOT NULL,
  dialing_code text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  provider_ready boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sms_dialing_regions_code_check CHECK (region_code ~ '^[A-Z0-9_]{2,16}$'),
  CONSTRAINT sms_dialing_regions_iso_check CHECK (iso_country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT sms_dialing_regions_dialing_code_check CHECK (dialing_code ~ '^\+[1-9][0-9]{0,3}$')
);

INSERT INTO public.sms_dialing_regions (
  region_code,
  display_name,
  iso_country_code,
  dialing_code,
  enabled,
  provider_ready,
  sort_order,
  notes
)
VALUES
  (
    'US',
    'United States',
    'US',
    '+1',
    true,
    true,
    10,
    'Current production toll-free traffic. Shares the +1 national number field with Canada.'
  ),
  (
    'CA',
    'Canada',
    'CA',
    '+1',
    true,
    true,
    20,
    'Current production toll-free traffic. Not a separate user-facing country choice while +1 is the only dialing code.'
  ),
  (
    'PR',
    'Puerto Rico',
    'PR',
    '+1',
    true,
    true,
    30,
    'Already enrollable under the existing NANP policy. Still +1, so no country selector.'
  )
ON CONFLICT (region_code) DO NOTHING;

DROP TRIGGER IF EXISTS sms_dialing_regions_updated_at
  ON public.sms_dialing_regions;
CREATE TRIGGER sms_dialing_regions_updated_at
  BEFORE UPDATE ON public.sms_dialing_regions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.sms_dialing_regions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.sms_dialing_regions FROM PUBLIC;
REVOKE ALL ON public.sms_dialing_regions FROM anon;
REVOKE ALL ON public.sms_dialing_regions FROM authenticated;
GRANT ALL ON public.sms_dialing_regions TO service_role;

SELECT public.seed_platform_permission(
  'system.sms.manage_regions',
  'Manage SMS regions',
  'Manage globally supported SMS dialing regions and whether each region is offered and provider-ready. Does not send SMS, change consent, or configure Bird.',
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
