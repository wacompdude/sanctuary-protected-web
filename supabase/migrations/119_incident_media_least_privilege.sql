-- =============================================================================
-- 119_incident_media_least_privilege.sql
-- Stage 3H-1: Tighten incident UPDATE/INSERT and incident-media Storage DELETE
-- so JWT clients cannot bypass app role checks via PostgREST/Storage API.
--
-- SELECT (view) for active organization members is PRESERVED (including viewers).
-- Do not rewrite 072/117/118. Forward-only. Not applied to Production in 3H-1.
--
-- Authorization matrix (mutating):
--   viewer                          → no create/update/delete media (unless own upload N/A)
--   security_member                 → create if allow_security_members_create_incidents
--                                     update fields; close/resolve only if allow_close
--   security_leader / administrator /
--   co_owner / owner                → create/update; delete media (or uploader)
--   other non-viewer roles          → create/update (matches historical app actions)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER, fixed search_path, restricted EXECUTE)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_organization_membership_role(
  requested_organization_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT m.role::text
  FROM public.organization_memberships m
  WHERE m.organization_id = requested_organization_id
    AND m.user_id = auth.uid()
    AND m.status = 'active'::public.membership_status
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.current_organization_membership_role(uuid) IS
  'Active membership role for auth.uid() in the organization, or null.';

REVOKE ALL ON FUNCTION public.current_organization_membership_role(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_organization_membership_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_organization_membership_role(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.can_create_organization_incident(
  requested_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    public.is_active_organization_member(requested_organization_id)
    AND COALESCE(public.current_organization_membership_role(requested_organization_id), 'viewer')
      <> 'viewer'
    AND (
      public.current_organization_membership_role(requested_organization_id) <> 'security_member'
      OR COALESCE(
        (
          SELECT o.allow_security_members_create_incidents
          FROM public.organizations o
          WHERE o.id = requested_organization_id
        ),
        true
      )
    );
$$;

COMMENT ON FUNCTION public.can_create_organization_incident(uuid) IS
  'True when caller may INSERT incidents (non-viewer; security_member respects org create flag).';

REVOKE ALL ON FUNCTION public.can_create_organization_incident(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_create_organization_incident(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_create_organization_incident(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.can_update_organization_incident(
  requested_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    public.is_active_organization_member(requested_organization_id)
    AND COALESCE(public.current_organization_membership_role(requested_organization_id), 'viewer')
      <> 'viewer';
$$;

COMMENT ON FUNCTION public.can_update_organization_incident(uuid) IS
  'True when caller may UPDATE incident rows (non-viewer active member). Close rules use trigger.';

REVOKE ALL ON FUNCTION public.can_update_organization_incident(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_update_organization_incident(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_update_organization_incident(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.can_manage_incident_media_as_leader(
  requested_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_organization_role(
    requested_organization_id,
    ARRAY['owner', 'co_owner', 'administrator', 'security_leader']::text[]
  );
$$;

COMMENT ON FUNCTION public.can_manage_incident_media_as_leader(uuid) IS
  'True when caller may delete others'' incident media (leader+).';

REVOKE ALL ON FUNCTION public.can_manage_incident_media_as_leader(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_incident_media_as_leader(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_incident_media_as_leader(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.can_delete_incident_media_object(object_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  org_id uuid;
  uploader uuid;
BEGIN
  org_id := public.organization_id_from_incident_media_path(object_name);
  IF org_id IS NULL THEN
    RETURN false;
  END IF;
  IF NOT public.is_active_organization_member(org_id) THEN
    RETURN false;
  END IF;
  IF public.can_manage_incident_media_as_leader(org_id) THEN
    RETURN true;
  END IF;
  SELECT a.uploaded_by INTO uploader
  FROM public.incident_attachments a
  WHERE a.storage_path = object_name
  LIMIT 1;
  RETURN uploader IS NOT NULL AND uploader = auth.uid();
END;
$$;

COMMENT ON FUNCTION public.can_delete_incident_media_object(text) IS
  'Storage DELETE gate: leader+ or attachment uploader; denies malformed paths.';

REVOKE ALL ON FUNCTION public.can_delete_incident_media_object(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_delete_incident_media_object(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_delete_incident_media_object(text) TO service_role;

-- ---------------------------------------------------------------------------
-- Close/resolve guard (security_member flag + viewers)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_incident_status_change_authorization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  role_text text;
  allow_close boolean;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  role_text := public.current_organization_membership_role(NEW.organization_id);
  IF role_text IS NULL OR role_text = 'viewer' THEN
    RAISE EXCEPTION 'incident status change denied for this membership role'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IN ('closed', 'resolved') THEN
    IF role_text = 'security_member' THEN
      SELECT COALESCE(o.allow_security_members_close_incidents, false)
      INTO allow_close
      FROM public.organizations o
      WHERE o.id = NEW.organization_id;
      IF NOT allow_close THEN
        RAISE EXCEPTION 'security members cannot close or resolve incidents for this organization'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS incidents_enforce_status_auth ON public.incidents;
CREATE TRIGGER incidents_enforce_status_auth
  BEFORE UPDATE OF status ON public.incidents
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_incident_status_change_authorization();

REVOKE ALL ON FUNCTION public.enforce_incident_status_change_authorization() FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- incidents RLS (exact existing policy names)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can view church incidents" ON public.incidents;
CREATE POLICY "Users can view church incidents"
  ON public.incidents
  FOR SELECT
  TO authenticated
  USING (public.is_active_organization_member(organization_id));

DROP POLICY IF EXISTS "Users can create church incidents" ON public.incidents;
CREATE POLICY "Users can create church incidents"
  ON public.incidents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_create_organization_incident(organization_id)
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "Users can update church incidents" ON public.incidents;
CREATE POLICY "Users can update church incidents"
  ON public.incidents
  FOR UPDATE
  TO authenticated
  USING (public.can_update_organization_incident(organization_id))
  WITH CHECK (public.can_update_organization_incident(organization_id));

-- ---------------------------------------------------------------------------
-- incident_updates: keep SELECT for members; INSERT requires update capability
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can view church incident updates" ON public.incident_updates;
CREATE POLICY "Users can view church incident updates"
  ON public.incident_updates
  FOR SELECT
  TO authenticated
  USING (public.is_active_organization_member(organization_id));

DROP POLICY IF EXISTS "Users can create church incident updates" ON public.incident_updates;
CREATE POLICY "Users can create church incident updates"
  ON public.incident_updates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_update_organization_incident(organization_id)
    AND created_by = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- incident_attachments: tighten INSERT; align DELETE with co_owner
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Members can view incident attachments" ON public.incident_attachments;
CREATE POLICY "Members can view incident attachments"
  ON public.incident_attachments
  FOR SELECT
  TO authenticated
  USING (public.is_active_organization_member(organization_id));

DROP POLICY IF EXISTS "Members can upload incident attachments" ON public.incident_attachments;
CREATE POLICY "Members can upload incident attachments"
  ON public.incident_attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_create_organization_incident(organization_id)
    AND uploaded_by = auth.uid()
  );

DROP POLICY IF EXISTS "Members can delete incident attachments" ON public.incident_attachments;
CREATE POLICY "Members can delete incident attachments"
  ON public.incident_attachments
  FOR DELETE
  TO authenticated
  USING (
    public.is_active_organization_member(organization_id)
    AND (
      uploaded_by = auth.uid()
      OR public.can_manage_incident_media_as_leader(organization_id)
    )
  );

-- ---------------------------------------------------------------------------
-- storage.objects incident-media
-- SELECT preserved for active members (viewing).
-- INSERT requires create capability.
-- DELETE requires uploader or leader+ (via helper).
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Members can read incident media" ON storage.objects;
CREATE POLICY "Members can read incident media"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'incident-media'
    AND public.is_active_organization_member(
      public.organization_id_from_incident_media_path(name)
    )
  );

DROP POLICY IF EXISTS "Members can upload incident media" ON storage.objects;
CREATE POLICY "Members can upload incident media"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'incident-media'
    AND public.can_create_organization_incident(
      public.organization_id_from_incident_media_path(name)
    )
  );

DROP POLICY IF EXISTS "Members can delete incident media" ON storage.objects;
CREATE POLICY "Members can delete incident media"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'incident-media'
    AND public.can_delete_incident_media_object(name)
  );

-- ---------------------------------------------------------------------------
-- Rollback notes (manual; do not auto-run):
--   DROP TRIGGER IF EXISTS incidents_enforce_status_auth ON public.incidents;
--   DROP FUNCTION IF EXISTS public.enforce_incident_status_change_authorization();
--   DROP FUNCTION IF EXISTS public.can_delete_incident_media_object(text);
--   DROP FUNCTION IF EXISTS public.can_manage_incident_media_as_leader(uuid);
--   DROP FUNCTION IF EXISTS public.can_update_organization_incident(uuid);
--   DROP FUNCTION IF EXISTS public.can_create_organization_incident(uuid);
--   DROP FUNCTION IF EXISTS public.current_organization_membership_role(uuid);
--   Recreate prior membership-only incident/storage policies from 021 / post-072 state.
-- =============================================================================
