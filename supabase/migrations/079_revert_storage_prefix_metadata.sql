-- =============================================================================
-- 079_revert_storage_prefix_metadata.sql
-- Repair after 078: UPDATE storage.objects.name does NOT rename the S3 object.
-- 078 left DB paths on organizations/ while blobs remained at churches/, so
-- public URLs 404'd. Revert metadata to churches/ so paths match the files.
--
-- App dual-read (077) still accepts both prefixes. New uploads may use
-- organizations/ (S3 key matches DB). A future move must use Storage move/copy
-- APIs, not SQL UPDATE on storage.objects.name.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Revert storage.objects metadata
-- ---------------------------------------------------------------------------

UPDATE storage.objects
SET name = 'churches/' || substr(name, length('organizations/') + 1)
WHERE name LIKE 'organizations/%'
  AND bucket_id IN (
    'church-branding',
    'incident-media',
    'equipment-media',
    'policy-media',
    'safety-concern-photos'
  );

-- ---------------------------------------------------------------------------
-- 2. Revert DB path columns
-- ---------------------------------------------------------------------------

UPDATE public.organizations
SET logo_path = 'churches/' || substr(logo_path, length('organizations/') + 1)
WHERE logo_path LIKE 'organizations/%';

UPDATE public.incident_attachments
SET storage_path = 'churches/' || substr(storage_path, length('organizations/') + 1)
WHERE storage_path LIKE 'organizations/%';

UPDATE public.equipment_attachments
SET storage_path = 'churches/' || substr(storage_path, length('organizations/') + 1)
WHERE storage_path LIKE 'organizations/%';

UPDATE public.policy_attachments
SET storage_path = 'churches/' || substr(storage_path, length('organizations/') + 1)
WHERE storage_path LIKE 'organizations/%';

UPDATE public.safety_concern_photos
SET storage_path = 'churches/' || substr(storage_path, length('organizations/') + 1)
WHERE storage_path LIKE 'organizations/%';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'equipment' AND column_name = 'photo_path'
  ) THEN
    EXECUTE $sql$
      UPDATE public.equipment
      SET photo_path = 'churches/' || substr(photo_path, length('organizations/') + 1)
      WHERE photo_path LIKE 'organizations/%'
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'equipment' AND column_name = 'manual_path'
  ) THEN
    EXECUTE $sql$
      UPDATE public.equipment
      SET manual_path = 'churches/' || substr(manual_path, length('organizations/') + 1)
      WHERE manual_path LIKE 'organizations/%'
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
      SET attachment_path = 'churches/' || substr(attachment_path, length('organizations/') + 1)
      WHERE attachment_path LIKE 'organizations/%'
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'campuses' AND column_name = 'logo_path'
  ) THEN
    EXECUTE $sql$
      UPDATE public.campuses
      SET logo_path = 'churches/' || substr(logo_path, length('organizations/') + 1)
      WHERE logo_path LIKE 'organizations/%'
    $sql$;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Post-check: branding objects should be back under churches/
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  branding_org_paths bigint;
BEGIN
  SELECT count(*) INTO branding_org_paths
  FROM storage.objects
  WHERE bucket_id = 'church-branding'
    AND name LIKE 'organizations/%';

  IF branding_org_paths > 0 THEN
    RAISE NOTICE
      '079 notice — % church-branding objects still under organizations/ (may be post-078 uploads)',
      branding_org_paths;
  END IF;
END $$;

COMMIT;
