-- =============================================================================
-- 096_update_member_profile.sql
-- Owners, co-owners, and administrators can correct another member's
-- profile name/phone. Profiles RLS remains self-update only; this RPC
-- is the cross-user write path. Additive / idempotent.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.can_edit_member_profile(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    target_user_id IS NOT NULL
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.organization_memberships actor
      JOIN public.organization_memberships target
        ON target.organization_id = actor.organization_id
       AND target.user_id = target_user_id
      WHERE actor.user_id = auth.uid()
        AND actor.status = 'active'::public.membership_status
        AND actor.role::text IN (
          'owner',
          'co_owner',
          'administrator'
        )
    );
$$;

COMMENT ON FUNCTION public.can_edit_member_profile(uuid) IS
  'True when the current user is an active owner, co-owner, or administrator in a church shared with the target user.';

REVOKE ALL ON FUNCTION public.can_edit_member_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_edit_member_profile(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_member_profile(
  p_user_id uuid,
  p_first_name text,
  p_last_name text,
  p_phone text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first text;
  v_last text;
  v_phone text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'VALIDATION: missing user';
  END IF;

  IF NOT public.can_edit_member_profile(p_user_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: cannot update this member profile';
  END IF;

  v_first := NULLIF(btrim(COALESCE(p_first_name, '')), '');
  v_last := NULLIF(btrim(COALESCE(p_last_name, '')), '');
  v_phone := NULLIF(btrim(COALESCE(p_phone, '')), '');

  IF v_first IS NOT NULL AND char_length(v_first) > 100 THEN
    RAISE EXCEPTION 'VALIDATION: first name is too long';
  END IF;
  IF v_last IS NOT NULL AND char_length(v_last) > 100 THEN
    RAISE EXCEPTION 'VALIDATION: last name is too long';
  END IF;
  IF v_phone IS NOT NULL AND char_length(v_phone) > 40 THEN
    RAISE EXCEPTION 'VALIDATION: phone is too long';
  END IF;

  UPDATE public.profiles
  SET
    first_name = v_first,
    last_name = v_last,
    phone = v_phone,
    full_name = NULLIF(btrim(concat_ws(' ', v_first, v_last)), ''),
    updated_at = now()
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: profile does not exist';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.update_member_profile(uuid, text, text, text) IS
  'Updates first name, last name, and phone for a church member. Restricted to owners, co-owners, and administrators.';

REVOKE ALL ON FUNCTION public.update_member_profile(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_member_profile(uuid, text, text, text)
  TO authenticated, service_role;
