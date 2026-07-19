-- =============================================================================
-- 031_equipment_media_15mb.sql
-- Raise equipment-media storage limit to 15 MB per file (photo uploads).
-- Safe to re-run.
--
-- Prefer this upsert (same pattern as 022). Do not COMMENT ON storage.buckets —
-- that requires ownership Supabase SQL Editor does not have.
--
-- If this still errors with "must be owner of relation buckets", set the limit
-- in the Dashboard instead:
--   Storage → equipment-media → Configuration → File size limit → 15 MB
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'equipment-media',
  'equipment-media',
  false,
  15728640,
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
