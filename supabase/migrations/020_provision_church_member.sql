-- Manual church member provisioning support.
-- Auth users are created via the service-role Admin API in the app.
-- This RPC attaches (or reactivates) an active membership with role checks
-- equivalent to the invite/manage path.

CREATE OR REPLACE FUNCTION public.get_auth_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT u.id
  INTO v_id
  FROM auth.users u
  WHERE lower(u.email) = lower(trim(p_email))
  LIMIT 1;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_auth_user_id_by_email(text) FROM PUBLIC;
-- Service role only — do not expose email→user lookup to authenticated clients.
GRANT EXECUTE ON FUNCTION public.get_auth_user_id_by_email(text) TO service_role;

CREATE OR REPLACE FUNCTION public.attach_church_membership(
  p_church_id uuid,
  p_user_id uuid,
  p_role public.membership_role
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_membership_id uuid;
  v_now timestamptz := now();
  v_created boolean := false;
  v_previous_status text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sign in to provision members';
  END IF;

  IF p_church_id IS NULL OR p_user_id IS NULL OR p_role IS NULL THEN
    RAISE EXCEPTION 'VALIDATION: church, user, and role are required';
  END IF;

  IF p_role = 'owner'::public.membership_role THEN
    RAISE EXCEPTION 'FORBIDDEN: cannot provision an owner via this path';
  END IF;

  IF p_user_id = v_actor THEN
    RAISE EXCEPTION 'FORBIDDEN: cannot provision your own membership';
  END IF;

  IF NOT public.can_manage_memberships(p_church_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: cannot manage memberships for this church';
  END IF;

  SELECT m.role::text
  INTO v_actor_role
  FROM public.church_memberships m
  WHERE m.user_id = v_actor
    AND m.church_id = p_church_id
    AND m.status = 'active'::public.membership_status
  LIMIT 1;

  IF v_actor_role IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: active membership required';
  END IF;

  IF v_actor_role = 'security_leader'
     AND public.membership_role_rank(p_role::text)
       >= public.membership_role_rank('security_leader') THEN
    RAISE EXCEPTION 'FORBIDDEN: security leaders may only assign security_member or viewer';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'NOT_FOUND: auth user does not exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.church_memberships m
    WHERE m.church_id = p_church_id
      AND m.user_id = p_user_id
      AND m.status = 'active'::public.membership_status
  ) THEN
    RAISE EXCEPTION 'CONFLICT: user already has an active membership at this church';
  END IF;

  PERFORM set_config('app.bypass_membership_guards', 'on', true);

  SELECT m.id, m.status::text
  INTO v_membership_id, v_previous_status
  FROM public.church_memberships m
  WHERE m.church_id = p_church_id
    AND m.user_id = p_user_id
  LIMIT 1;

  IF v_membership_id IS NULL THEN
    INSERT INTO public.church_memberships (
      church_id,
      user_id,
      role,
      status,
      invited_by,
      joined_at,
      created_at,
      updated_at
    ) VALUES (
      p_church_id,
      p_user_id,
      p_role,
      'active'::public.membership_status,
      v_actor,
      v_now,
      v_now,
      v_now
    )
    RETURNING id INTO v_membership_id;
    v_created := true;
  ELSE
    UPDATE public.church_memberships
    SET
      role = p_role,
      status = 'active'::public.membership_status,
      invited_by = COALESCE(invited_by, v_actor),
      joined_at = COALESCE(joined_at, v_now),
      updated_at = v_now
    WHERE id = v_membership_id;
  END IF;

  -- Clear any pending invitations for this email at the church
  UPDATE public.church_invitations ci
  SET revoked_at = v_now
  WHERE ci.church_id = p_church_id
    AND ci.accepted_at IS NULL
    AND ci.revoked_at IS NULL
    AND lower(ci.email) = (
      SELECT lower(u.email)
      FROM auth.users u
      WHERE u.id = p_user_id
    );

  RETURN jsonb_build_object(
    'membership_id', v_membership_id,
    'created', v_created,
    'previous_status', v_previous_status,
    'role', p_role::text,
    'user_id', p_user_id,
    'church_id', p_church_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.attach_church_membership(uuid, uuid, public.membership_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attach_church_membership(uuid, uuid, public.membership_role) TO authenticated;
