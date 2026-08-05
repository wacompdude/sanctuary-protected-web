-- =============================================================================
-- 066_hide_platform_accounts_from_church_team.sql
-- Hide platform operator accounts from church-facing team member lists.
-- Platform accounts remain fully functional via church_memberships / support
-- sessions; they are simply omitted from list_church_team_memberships.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_hidden_platform_church_member(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_accounts pa
    WHERE pa.user_id = p_user_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_hidden_platform_church_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_hidden_platform_church_member(uuid)
  TO authenticated, service_role;

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
    AND m.status = 'active'::public.membership_status
    AND NOT public.is_hidden_platform_church_member(m.user_id);

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
    AND NOT public.is_hidden_platform_church_member(m.user_id)
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
