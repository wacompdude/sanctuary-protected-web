-- =============================================================================
-- 018_church_logo_storage_and_suspended_recovery.sql
-- Church logo storage + owner recovery for suspended/closed churches.
-- Safe to re-run.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Placeholder billing / trial fields (display only for now)
-- ---------------------------------------------------------------------------

ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS plan_name text;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

COMMENT ON COLUMN public.churches.plan_name IS
  'Display-only plan label placeholder until billing is implemented.';
COMMENT ON COLUMN public.churches.trial_ends_at IS
  'Display-only trial expiration placeholder until billing is implemented.';

-- ---------------------------------------------------------------------------
-- Owner check that ignores church account status (recovery path)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_church_owner(requested_church_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.church_memberships m
    WHERE m.user_id = auth.uid()
      AND m.church_id = requested_church_id
      AND m.status = 'active'::public.membership_status
      AND m.role = 'owner'::public.membership_role
  );
$$;

REVOKE ALL ON FUNCTION public.is_church_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_church_owner(uuid) TO authenticated;

-- Owners retain settings/status access while suspended/closed; admins only when usable.
CREATE OR REPLACE FUNCTION public.can_manage_church_settings(requested_church_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_church_owner(requested_church_id)
    OR EXISTS (
      SELECT 1
      FROM public.church_memberships m
      JOIN public.churches c ON c.id = m.church_id
      WHERE m.user_id = auth.uid()
        AND m.church_id = requested_church_id
        AND m.status = 'active'::public.membership_status
        AND m.role = 'administrator'::public.membership_role
        AND c.status IN (
          'trial'::public.church_status,
          'active'::public.church_status
        )
    );
$$;

-- ---------------------------------------------------------------------------
-- Storage bucket: church-branding
-- Path: churches/{church_id}/branding/logo[.ext]
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'church-branding',
  'church-branding',
  true,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.church_id_from_branding_path(object_name text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  parts text[];
  church_id uuid;
BEGIN
  parts := string_to_array(object_name, '/');
  IF array_length(parts, 1) < 3 THEN
    RETURN NULL;
  END IF;
  IF parts[1] <> 'churches' OR parts[3] <> 'branding' THEN
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

REVOKE ALL ON FUNCTION public.church_id_from_branding_path(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.church_id_from_branding_path(text) TO authenticated;

DROP POLICY IF EXISTS "Church members can read branding objects" ON storage.objects;
DROP POLICY IF EXISTS "Managers can upload church branding" ON storage.objects;
DROP POLICY IF EXISTS "Managers can update church branding" ON storage.objects;
DROP POLICY IF EXISTS "Managers can delete church branding" ON storage.objects;

-- Public bucket URLs work for display; keep authenticated read scoped by membership/owner.
CREATE POLICY "Church members can read branding objects"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'church-branding'
    AND (
      public.is_active_church_member(public.church_id_from_branding_path(name))
      OR public.is_church_owner(public.church_id_from_branding_path(name))
    )
  );

CREATE POLICY "Managers can upload church branding"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'church-branding'
    AND public.can_manage_church_settings(public.church_id_from_branding_path(name))
  );

CREATE POLICY "Managers can update church branding"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'church-branding'
    AND public.can_manage_church_settings(public.church_id_from_branding_path(name))
  )
  WITH CHECK (
    bucket_id = 'church-branding'
    AND public.can_manage_church_settings(public.church_id_from_branding_path(name))
  );

CREATE POLICY "Managers can delete church branding"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'church-branding'
    AND public.can_manage_church_settings(public.church_id_from_branding_path(name))
  );
