-- =============================================================================
-- 077_storage_organizations_prefix_dual_read.sql
-- Accept both churches/{id}/… and organizations/{id}/… in Storage path helpers.
--
-- APPLY BEFORE (or with) the app deploy that writes organizations/ paths.
-- Existing objects under churches/ keep working until 078 rewrites them.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.organization_id_from_branding_path(object_name text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  parts text[];
  organization_id uuid;
BEGIN
  parts := string_to_array(object_name, '/');
  IF array_length(parts, 1) < 3 THEN
    RETURN NULL;
  END IF;
  IF parts[1] NOT IN ('churches', 'organizations') OR parts[3] <> 'branding' THEN
    RETURN NULL;
  END IF;
  BEGIN
    organization_id := parts[2]::uuid;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  RETURN organization_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.organization_id_from_incident_media_path(object_name text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  parts text[];
  organization_id uuid;
BEGIN
  parts := string_to_array(object_name, '/');
  IF array_length(parts, 1) < 5 THEN
    RETURN NULL;
  END IF;
  IF parts[1] NOT IN ('churches', 'organizations') OR parts[3] <> 'incidents' THEN
    RETURN NULL;
  END IF;
  BEGIN
    organization_id := parts[2]::uuid;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  RETURN organization_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.organization_id_from_equipment_media_path(object_name text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  parts text[];
  organization_id uuid;
BEGIN
  parts := string_to_array(object_name, '/');
  IF array_length(parts, 1) < 5 THEN
    RETURN NULL;
  END IF;
  IF parts[1] NOT IN ('churches', 'organizations') OR parts[3] <> 'equipment' THEN
    RETURN NULL;
  END IF;
  BEGIN
    organization_id := parts[2]::uuid;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  RETURN organization_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.organization_id_from_policy_media_path(object_name text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  parts text[];
  organization_id uuid;
BEGIN
  parts := string_to_array(object_name, '/');
  IF array_length(parts, 1) < 5 THEN
    RETURN NULL;
  END IF;
  IF parts[1] NOT IN ('churches', 'organizations') OR parts[3] <> 'policies' THEN
    RETURN NULL;
  END IF;
  BEGIN
    organization_id := parts[2]::uuid;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  RETURN organization_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.organization_id_from_safety_concern_photo_path(object_name text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  parts text[];
  organization_id uuid;
BEGIN
  parts := string_to_array(object_name, '/');
  IF array_length(parts, 1) < 5 THEN
    RETURN NULL;
  END IF;
  IF parts[1] NOT IN ('churches', 'organizations') OR parts[3] <> 'safety-concerns' THEN
    RETURN NULL;
  END IF;
  BEGIN
    organization_id := parts[2]::uuid;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  RETURN organization_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.profile_id_from_safety_concern_photo_path(object_name text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  parts text[];
  profile_id uuid;
BEGIN
  parts := string_to_array(object_name, '/');
  IF array_length(parts, 1) < 5 THEN
    RETURN NULL;
  END IF;
  IF parts[1] NOT IN ('churches', 'organizations') OR parts[3] <> 'safety-concerns' THEN
    RETURN NULL;
  END IF;
  BEGIN
    profile_id := parts[4]::uuid;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  RETURN profile_id;
END;
$$;

DO $$
BEGIN
  IF public.organization_id_from_branding_path(
    'organizations/11111111-1111-4111-8111-111111111111/branding/logo.png'
  ) IS NULL THEN
    RAISE EXCEPTION '077 post-check failed — organizations/ branding path not accepted';
  END IF;
  IF public.organization_id_from_branding_path(
    'churches/11111111-1111-4111-8111-111111111111/branding/logo.png'
  ) IS NULL THEN
    RAISE EXCEPTION '077 post-check failed — churches/ branding path not accepted';
  END IF;
END $$;

COMMIT;
