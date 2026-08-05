-- =============================================================================
-- 078_storage_rewrite_churches_prefix.sql
-- Rewrite Storage object names and DB path columns from churches/ → organizations/.
--
-- APPLY AFTER:
--   1. 077 (dual-read path helpers)
--   2. App deploy that writes organizations/ paths (and dual-accepts churches/)
--
-- Dual-read helpers from 077 remain in place afterward (harmless).
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF public.organization_id_from_branding_path(
    'organizations/11111111-1111-4111-8111-111111111111/branding/logo.png'
  ) IS NULL THEN
    RAISE EXCEPTION '078 preflight failed — apply 077 first (dual-read helpers)';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. storage.objects name rewrite
-- ---------------------------------------------------------------------------

UPDATE storage.objects
SET name = 'organizations/' || substr(name, length('churches/') + 1)
WHERE name LIKE 'churches/%'
  AND bucket_id IN (
    'church-branding',
    'incident-media',
    'equipment-media',
    'policy-media',
    'safety-concern-photos'
  );

-- ---------------------------------------------------------------------------
-- 2. DB columns that store object paths
-- ---------------------------------------------------------------------------

UPDATE public.organizations
SET logo_path = 'organizations/' || substr(logo_path, length('churches/') + 1)
WHERE logo_path LIKE 'churches/%';

UPDATE public.incident_attachments
SET storage_path = 'organizations/' || substr(storage_path, length('churches/') + 1)
WHERE storage_path LIKE 'churches/%';

UPDATE public.equipment_attachments
SET storage_path = 'organizations/' || substr(storage_path, length('churches/') + 1)
WHERE storage_path LIKE 'churches/%';

UPDATE public.policy_attachments
SET storage_path = 'organizations/' || substr(storage_path, length('churches/') + 1)
WHERE storage_path LIKE 'churches/%';

UPDATE public.safety_concern_photos
SET storage_path = 'organizations/' || substr(storage_path, length('churches/') + 1)
WHERE storage_path LIKE 'churches/%';

-- Legacy equipment path columns (if populated)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'equipment' AND column_name = 'photo_path'
  ) THEN
    EXECUTE $sql$
      UPDATE public.equipment
      SET photo_path = 'organizations/' || substr(photo_path, length('churches/') + 1)
      WHERE photo_path LIKE 'churches/%'
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'equipment' AND column_name = 'manual_path'
  ) THEN
    EXECUTE $sql$
      UPDATE public.equipment
      SET manual_path = 'organizations/' || substr(manual_path, length('churches/') + 1)
      WHERE manual_path LIKE 'churches/%'
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'equipment_maintenance'
      AND column_name = 'attachment_path'
  ) THEN
    EXECUTE $sql$
      UPDATE public.equipment_maintenance
      SET attachment_path = 'organizations/' || substr(attachment_path, length('churches/') + 1)
      WHERE attachment_path LIKE 'churches/%'
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'campuses' AND column_name = 'logo_path'
  ) THEN
    EXECUTE $sql$
      UPDATE public.campuses
      SET logo_path = 'organizations/' || substr(logo_path, length('churches/') + 1)
      WHERE logo_path LIKE 'churches/%'
    $sql$;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Post-checks
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  leftover_objects bigint;
  leftover_logos bigint;
BEGIN
  SELECT count(*) INTO leftover_objects
  FROM storage.objects
  WHERE name LIKE 'churches/%'
    AND bucket_id IN (
      'church-branding',
      'incident-media',
      'equipment-media',
      'policy-media',
      'safety-concern-photos'
    );

  IF leftover_objects > 0 THEN
    RAISE EXCEPTION
      '078 post-check failed — % storage.objects still under churches/',
      leftover_objects;
  END IF;

  SELECT count(*) INTO leftover_logos
  FROM public.organizations
  WHERE logo_path LIKE 'churches/%';

  IF leftover_logos > 0 THEN
    RAISE EXCEPTION
      '078 post-check failed — % organizations.logo_path still under churches/',
      leftover_logos;
  END IF;
END $$;

COMMIT;
