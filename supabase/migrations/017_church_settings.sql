-- =============================================================================
-- 017_church_settings.sql
-- Phase 12 — Church settings columns, validated preferences, owner-only status
-- Safe to re-run. Does not drop or rename existing columns.
-- Logo file storage is intentionally deferred; logo_path holds a URL or path.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Profile / contact / branding / emergency columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS denomination text;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS year_established integer;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS primary_language text;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS website_url text;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS country text;

ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS logo_path text;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS primary_brand_color text;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS secondary_brand_color text;

ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS emergency_contact_name text;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS emergency_contact_phone text;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS secondary_emergency_contact_name text;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS secondary_emergency_contact_phone text;

ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS default_emergency_phone text;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS police_non_emergency_phone text;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS fire_non_emergency_phone text;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS nearest_hospital_name text;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS nearest_hospital_phone text;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS nearest_hospital_address text;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS default_emergency_notification_sender text;

ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS incident_retention_days integer;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS certification_warning_days integer;

ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS require_incident_location boolean;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS require_incident_severity boolean;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS require_incident_follow_up boolean;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS allow_security_members_create_incidents boolean;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS allow_security_members_close_incidents boolean;

ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS settings jsonb;

-- Sensible defaults (only fill when currently null)
UPDATE public.churches SET primary_language = 'en' WHERE primary_language IS NULL;
UPDATE public.churches SET country = 'United States' WHERE country IS NULL;
UPDATE public.churches SET incident_retention_days = 2555 WHERE incident_retention_days IS NULL;
UPDATE public.churches SET certification_warning_days = 60 WHERE certification_warning_days IS NULL;
UPDATE public.churches SET require_incident_location = true WHERE require_incident_location IS NULL;
UPDATE public.churches SET require_incident_severity = true WHERE require_incident_severity IS NULL;
UPDATE public.churches SET require_incident_follow_up = false WHERE require_incident_follow_up IS NULL;
UPDATE public.churches SET allow_security_members_create_incidents = true WHERE allow_security_members_create_incidents IS NULL;
UPDATE public.churches SET allow_security_members_close_incidents = false WHERE allow_security_members_close_incidents IS NULL;
UPDATE public.churches SET settings = '{}'::jsonb WHERE settings IS NULL;
UPDATE public.churches SET timezone = 'America/Los_Angeles' WHERE timezone IS NULL OR trim(timezone) = '';

ALTER TABLE public.churches
  ALTER COLUMN primary_language SET DEFAULT 'en',
  ALTER COLUMN country SET DEFAULT 'United States',
  ALTER COLUMN incident_retention_days SET DEFAULT 2555,
  ALTER COLUMN certification_warning_days SET DEFAULT 60,
  ALTER COLUMN require_incident_location SET DEFAULT true,
  ALTER COLUMN require_incident_severity SET DEFAULT true,
  ALTER COLUMN require_incident_follow_up SET DEFAULT false,
  ALTER COLUMN allow_security_members_create_incidents SET DEFAULT true,
  ALTER COLUMN allow_security_members_close_incidents SET DEFAULT false,
  ALTER COLUMN settings SET DEFAULT '{}'::jsonb;

ALTER TABLE public.churches
  ALTER COLUMN settings SET NOT NULL;

-- ---------------------------------------------------------------------------
-- Validation constraints (drop/recreate so re-runs stay idempotent)
-- ---------------------------------------------------------------------------

ALTER TABLE public.churches DROP CONSTRAINT IF EXISTS churches_year_established_check;
ALTER TABLE public.churches ADD CONSTRAINT churches_year_established_check
  CHECK (
    year_established IS NULL
    OR (year_established >= 1600 AND year_established <= EXTRACT(YEAR FROM now())::integer + 1)
  );

ALTER TABLE public.churches DROP CONSTRAINT IF EXISTS churches_incident_retention_days_check;
ALTER TABLE public.churches ADD CONSTRAINT churches_incident_retention_days_check
  CHECK (
    incident_retention_days IS NULL
    OR (incident_retention_days >= 30 AND incident_retention_days <= 36500)
  );

ALTER TABLE public.churches DROP CONSTRAINT IF EXISTS churches_certification_warning_days_check;
ALTER TABLE public.churches ADD CONSTRAINT churches_certification_warning_days_check
  CHECK (
    certification_warning_days IS NULL
    OR (certification_warning_days >= 1 AND certification_warning_days <= 365)
  );

ALTER TABLE public.churches DROP CONSTRAINT IF EXISTS churches_primary_brand_color_check;
ALTER TABLE public.churches ADD CONSTRAINT churches_primary_brand_color_check
  CHECK (
    primary_brand_color IS NULL
    OR primary_brand_color ~ '^#[0-9A-Fa-f]{6}$'
  );

ALTER TABLE public.churches DROP CONSTRAINT IF EXISTS churches_secondary_brand_color_check;
ALTER TABLE public.churches ADD CONSTRAINT churches_secondary_brand_color_check
  CHECK (
    secondary_brand_color IS NULL
    OR secondary_brand_color ~ '^#[0-9A-Fa-f]{6}$'
  );

ALTER TABLE public.churches DROP CONSTRAINT IF EXISTS churches_description_length_check;
ALTER TABLE public.churches ADD CONSTRAINT churches_description_length_check
  CHECK (description IS NULL OR char_length(description) <= 4000);

ALTER TABLE public.churches DROP CONSTRAINT IF EXISTS churches_settings_is_object_check;
ALTER TABLE public.churches ADD CONSTRAINT churches_settings_is_object_check
  CHECK (jsonb_typeof(settings) = 'object');

-- ---------------------------------------------------------------------------
-- Only owners may change church.status (admins can still edit profile fields)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_church_status_owner_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NOT public.has_church_role(NEW.id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'FORBIDDEN: only church owners can change account status';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS churches_status_owner_only ON public.churches;
CREATE TRIGGER churches_status_owner_only
  BEFORE UPDATE ON public.churches
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_church_status_owner_only();

-- Keep updated_at healthy if the earlier trigger is missing
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS churches_updated_at ON public.churches;
CREATE TRIGGER churches_updated_at
  BEFORE UPDATE ON public.churches
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON COLUMN public.churches.logo_path IS
  'URL or future storage path (churches/{id}/branding/logo). File upload storage is not configured yet.';
COMMENT ON COLUMN public.churches.settings IS
  'Validated application preferences JSON object. Do not store secrets here.';
