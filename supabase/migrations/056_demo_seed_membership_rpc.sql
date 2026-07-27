-- Service-role helpers for demo seed membership upsert/delete.
-- church_memberships mutations require auth.uid() unless
-- app.bypass_membership_guards is set (session-local).

CREATE OR REPLACE FUNCTION public.demo_seed_upsert_membership(
  p_church_id uuid,
  p_user_id uuid,
  p_role public.membership_role,
  p_seed_source text DEFAULT 'first-church-demo'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_membership_id uuid;
  v_created boolean := false;
  v_church_seed text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'FORBIDDEN: demo_seed_upsert_membership is service_role only';
  END IF;

  IF p_seed_source IS NULL
     OR p_seed_source !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'VALIDATION: invalid seed_source';
  END IF;

  SELECT c.seed_source
  INTO v_church_seed
  FROM public.churches c
  WHERE c.id = p_church_id;

  IF v_church_seed IS NULL THEN
    RAISE EXCEPTION 'VALIDATION: church not found';
  END IF;

  IF v_church_seed IS DISTINCT FROM p_seed_source THEN
    RAISE EXCEPTION
      'FORBIDDEN: church is not marked with seed_source %',
      p_seed_source;
  END IF;

  PERFORM set_config('app.bypass_membership_guards', 'on', true);

  SELECT m.id
  INTO v_membership_id
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
      joined_at
    )
    VALUES (
      p_church_id,
      p_user_id,
      p_role,
      'active'::public.membership_status,
      now()
    )
    RETURNING id INTO v_membership_id;
    v_created := true;
  ELSE
    UPDATE public.church_memberships
    SET
      role = p_role,
      status = 'active'::public.membership_status,
      updated_at = now()
    WHERE id = v_membership_id;
  END IF;

  RETURN jsonb_build_object(
    'membership_id', v_membership_id,
    'created', v_created,
    'role', p_role::text
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.demo_seed_delete_membership(
  p_membership_id uuid,
  p_seed_source text DEFAULT 'first-church-demo'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_church_seed text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'FORBIDDEN: demo_seed_delete_membership is service_role only';
  END IF;

  SELECT c.seed_source
  INTO v_church_seed
  FROM public.church_memberships m
  JOIN public.churches c ON c.id = m.church_id
  WHERE m.id = p_membership_id;

  IF v_church_seed IS NULL THEN
    RETURN false;
  END IF;

  IF v_church_seed IS DISTINCT FROM p_seed_source THEN
    RAISE EXCEPTION
      'FORBIDDEN: membership does not belong to seed_source %',
      p_seed_source;
  END IF;

  PERFORM set_config('app.bypass_membership_guards', 'on', true);

  DELETE FROM public.church_memberships
  WHERE id = p_membership_id;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.demo_seed_delete_church(
  p_seed_source text DEFAULT 'first-church-demo'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_church_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'FORBIDDEN: demo_seed_delete_church is service_role only';
  END IF;

  IF p_seed_source IS NULL
     OR p_seed_source !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'VALIDATION: invalid seed_source';
  END IF;

  SELECT c.id
  INTO v_church_id
  FROM public.churches c
  WHERE c.seed_source = p_seed_source
  LIMIT 1;

  IF v_church_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- CASCADE deletes memberships; bypass avoids UNAUTHENTICATED on that path.
  PERFORM set_config('app.bypass_membership_guards', 'on', true);

  DELETE FROM public.churches
  WHERE id = v_church_id
    AND seed_source = p_seed_source;

  RETURN v_church_id;
END;
$$;

REVOKE ALL ON FUNCTION public.demo_seed_upsert_membership(uuid, uuid, public.membership_role, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.demo_seed_delete_membership(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.demo_seed_delete_church(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.demo_seed_upsert_membership(uuid, uuid, public.membership_role, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.demo_seed_delete_membership(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.demo_seed_delete_church(text) TO service_role;

COMMENT ON FUNCTION public.demo_seed_upsert_membership(uuid, uuid, public.membership_role, text) IS
  'Service-role only: upsert church membership for a seed_source-marked demo church.';
COMMENT ON FUNCTION public.demo_seed_delete_membership(uuid, text) IS
  'Service-role only: delete a membership belonging to a demo seed church.';
COMMENT ON FUNCTION public.demo_seed_delete_church(text) IS
  'Service-role only: delete a demo church by seed_source with membership-guard bypass.';
