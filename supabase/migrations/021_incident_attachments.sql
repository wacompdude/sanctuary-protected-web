-- =============================================================================
-- 021_incident_attachments.sql
-- Multiple photos per incident (private storage + metadata table).
-- Safe to re-run.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.incident_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  incident_id uuid NOT NULL REFERENCES public.incidents (id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES auth.users (id),
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  byte_size integer NOT NULL CHECK (byte_size > 0),
  original_filename text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT incident_attachments_storage_path_key UNIQUE (storage_path),
  CONSTRAINT incident_attachments_mime_type_check CHECK (
    mime_type IN ('image/png', 'image/jpeg', 'image/webp', 'image/gif')
  )
);

CREATE INDEX IF NOT EXISTS incident_attachments_incident_id_idx
  ON public.incident_attachments (incident_id, created_at ASC);

CREATE INDEX IF NOT EXISTS incident_attachments_church_id_idx
  ON public.incident_attachments (church_id);

ALTER TABLE public.incident_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view incident attachments" ON public.incident_attachments;
DROP POLICY IF EXISTS "Members can upload incident attachments" ON public.incident_attachments;
DROP POLICY IF EXISTS "Members can delete incident attachments" ON public.incident_attachments;

CREATE POLICY "Members can view incident attachments"
  ON public.incident_attachments
  FOR SELECT
  TO authenticated
  USING (public.is_active_church_member(church_id));

CREATE POLICY "Members can upload incident attachments"
  ON public.incident_attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_church_member(church_id)
    AND uploaded_by = auth.uid()
  );

CREATE POLICY "Members can delete incident attachments"
  ON public.incident_attachments
  FOR DELETE
  TO authenticated
  USING (
    public.is_active_church_member(church_id)
    AND (
      uploaded_by = auth.uid()
      OR public.has_church_role(
        church_id,
        ARRAY['owner', 'administrator', 'security_leader']
      )
    )
  );

GRANT SELECT, INSERT, DELETE ON public.incident_attachments TO authenticated;

-- ---------------------------------------------------------------------------
-- Storage bucket: incident-media (private)
-- Path: churches/{church_id}/incidents/{incident_id}/{uuid}.{ext}
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'incident-media',
  'incident-media',
  false,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.church_id_from_incident_media_path(object_name text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  parts text[];
  church_id uuid;
BEGIN
  parts := string_to_array(object_name, '/');
  -- churches / {church_id} / incidents / {incident_id} / file
  IF array_length(parts, 1) < 5 THEN
    RETURN NULL;
  END IF;
  IF parts[1] <> 'churches' OR parts[3] <> 'incidents' THEN
    RETURN NULL;
  END IF;
  BEGIN
    church_id := parts[2]::uuid;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  RETURN church_id;
END;
$$;

REVOKE ALL ON FUNCTION public.church_id_from_incident_media_path(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.church_id_from_incident_media_path(text) TO authenticated;

DROP POLICY IF EXISTS "Members can read incident media" ON storage.objects;
DROP POLICY IF EXISTS "Members can upload incident media" ON storage.objects;
DROP POLICY IF EXISTS "Members can delete incident media" ON storage.objects;

CREATE POLICY "Members can read incident media"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'incident-media'
    AND public.is_active_church_member(
      public.church_id_from_incident_media_path(name)
    )
  );

CREATE POLICY "Members can upload incident media"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'incident-media'
    AND public.is_active_church_member(
      public.church_id_from_incident_media_path(name)
    )
  );

-- App enforces uploader/leader rules via incident_attachments RLS before delete.
CREATE POLICY "Members can delete incident media"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'incident-media'
    AND public.is_active_church_member(
      public.church_id_from_incident_media_path(name)
    )
  );
