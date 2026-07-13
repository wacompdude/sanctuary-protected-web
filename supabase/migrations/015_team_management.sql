-- =============================================================================
-- 015_team_management.sql
-- Phase 9 — List church memberships with emails for team management UI
-- Safe to re-run.
-- =============================================================================

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

  -- Caller must be an active member of the church (any role can view roster)
  IF NOT public.is_active_church_member(p_church_id) THEN
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
    COALESCE(m.joined_at, m.created_at) NULLS LAST,
    u.email;
END;
$$;

REVOKE ALL ON FUNCTION public.list_church_team_memberships(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_church_team_memberships(uuid) TO authenticated;
