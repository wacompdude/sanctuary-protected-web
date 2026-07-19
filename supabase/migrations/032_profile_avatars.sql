-- =============================================================================
-- 032_profile_avatars.sql
-- Public bucket for member profile photos + team roster avatar_url.
-- Safe to re-run.
-- Path: users/{user_id}/avatar.{ext}
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-avatars',
  'profile-avatars',
  true,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.user_id_from_avatar_path(object_name text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  parts text[];
  user_id uuid;
BEGIN
  parts := string_to_array(object_name, '/');
  IF array_length(parts, 1) < 2 THEN
    RETURN NULL;
  END IF;
  IF parts[1] <> 'users' THEN
    RETURN NULL;
  END IF;
  BEGIN
    user_id := parts[2]::uuid;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  RETURN user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.user_id_from_avatar_path(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_id_from_avatar_path(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_manage_profile_avatar(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    target_user_id IS NOT NULL
    AND (
      target_user_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.church_memberships actor
        JOIN public.church_memberships target
          ON target.church_id = actor.church_id
         AND target.user_id = target_user_id
         AND target.status = 'active'::public.membership_status
        WHERE actor.user_id = auth.uid()
          AND actor.status = 'active'::public.membership_status
          AND actor.role::text IN (
            'owner',
            'co_owner',
            'administrator',
            'security_leader'
          )
      )
    );
$$;

REVOKE ALL ON FUNCTION public.can_manage_profile_avatar(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_profile_avatar(uuid)
  TO authenticated, service_role;

-- Allows self or team managers to persist avatar_url despite own-row profile RLS.
CREATE OR REPLACE FUNCTION public.set_profile_avatar_url(
  p_user_id uuid,
  p_avatar_url text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  IF NOT public.can_manage_profile_avatar(p_user_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: cannot update this profile photo';
  END IF;

  IF p_avatar_url IS NOT NULL
     AND p_avatar_url <> ''
     AND public.user_id_from_avatar_path(p_avatar_url) IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'VALIDATION: avatar path must belong to the target user';
  END IF;

  UPDATE public.profiles
  SET
    avatar_url = NULLIF(trim(p_avatar_url), ''),
    updated_at = now()
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: profile does not exist';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_profile_avatar_url(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_profile_avatar_url(uuid, text)
  TO authenticated, service_role;

DROP POLICY IF EXISTS "Users can read profile avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own or managed avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own or managed avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own or managed avatars" ON storage.objects;

-- Public bucket serves URLs; keep authenticated policies for API uploads.
CREATE POLICY "Users can read profile avatars"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'profile-avatars');

CREATE POLICY "Users can upload own or managed avatars"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'profile-avatars'
    AND public.can_manage_profile_avatar(
      public.user_id_from_avatar_path(name)
    )
  );

CREATE POLICY "Users can update own or managed avatars"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'profile-avatars'
    AND public.can_manage_profile_avatar(
      public.user_id_from_avatar_path(name)
    )
  )
  WITH CHECK (
    bucket_id = 'profile-avatars'
    AND public.can_manage_profile_avatar(
      public.user_id_from_avatar_path(name)
    )
  );

CREATE POLICY "Users can delete own or managed avatars"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'profile-avatars'
    AND public.can_manage_profile_avatar(
      public.user_id_from_avatar_path(name)
    )
  );

-- Team roster includes avatar path for display
DROP FUNCTION IF EXISTS public.list_church_team_memberships(uuid);

CREATE OR REPLACE FUNCTION public.list_church_team_memberships(p_church_id uuid)
RETURNS TABLE (
  membership_id uuid,
  user_id uuid,
  email text,
  role text,
  status text,
  joined_at timestamptz,
  updated_at timestamptz,
  first_name text,
  last_name text,
  full_name text,
  avatar_url text,
  is_last_active_owner boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active_owners integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  IF NOT public.is_active_church_member(p_church_id)
     AND NOT public.is_church_owner(p_church_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: not an active member of this church';
  END IF;

  SELECT COUNT(*)::integer
  INTO v_active_owners
  FROM public.church_memberships m
  WHERE m.church_id = p_church_id
    AND m.role = 'owner'::public.membership_role
    AND m.status = 'active'::public.membership_status;

  RETURN QUERY
  SELECT
    m.id AS membership_id,
    m.user_id,
    u.email::text,
    m.role::text,
    m.status::text,
    m.joined_at,
    m.updated_at,
    p.first_name,
    p.last_name,
    p.full_name,
    p.avatar_url,
    (
      m.role = 'owner'::public.membership_role
      AND m.status = 'active'::public.membership_status
      AND v_active_owners <= 1
    ) AS is_last_active_owner
  FROM public.church_memberships m
  JOIN auth.users u ON u.id = m.user_id
  LEFT JOIN public.profiles p ON p.id = m.user_id
  WHERE m.church_id = p_church_id
    AND m.status IN (
      'active'::public.membership_status,
      'suspended'::public.membership_status,
      'removed'::public.membership_status
    )
  ORDER BY
    CASE m.status::text
      WHEN 'active' THEN 0
      WHEN 'suspended' THEN 1
      WHEN 'removed' THEN 2
      ELSE 3
    END,
    CASE m.role::text
      WHEN 'owner' THEN 0
      WHEN 'co_owner' THEN 1
      WHEN 'administrator' THEN 2
      WHEN 'security_leader' THEN 3
      WHEN 'security_member' THEN 4
      ELSE 5
    END,
    COALESCE(m.joined_at, m.created_at) NULLS LAST,
    u.email;
END;
$$;

REVOKE ALL ON FUNCTION public.list_church_team_memberships(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_church_team_memberships(uuid) TO authenticated;
