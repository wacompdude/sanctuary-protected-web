-- =============================================================================
-- 098_organization_unique_slug_allocation.sql
-- Church onboarding no longer accepts a client-chosen slug. The RPC always
-- generates a slug from the church name and allocates a unique suffix on
-- UNIQUE constraint collisions: name, name-2, name-3, ...
-- Existing organization slugs are not rewritten.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.organizations'::regclass
      AND conname IN ('churches_slug_key', 'organizations_slug_key')
  ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT churches_slug_key UNIQUE (slug);
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.create_organization_with_owner(
  text, text, text, text, text, text, text, text, text, text
);

DROP FUNCTION IF EXISTS public.create_organization_with_owner(
  text, text, text, text, text, text, text, text, text, text, text
);

CREATE FUNCTION public.create_organization_with_owner(
  p_name text,
  p_primary_email text,
  p_phone text,
  p_address_line_1 text,
  p_city text,
  p_state text,
  p_postal_code text,
  p_timezone text,
  p_campus_name text,
  p_address_line_2 text DEFAULT NULL,
  p_slug text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_name text := trim(both from coalesce(p_name, ''));
  v_campus_name text := trim(both from coalesce(p_campus_name, ''));
  v_email text := nullif(trim(both from coalesce(p_primary_email, '')), '');
  v_phone text := nullif(trim(both from coalesce(p_phone, '')), '');
  v_address_1 text := nullif(trim(both from coalesce(p_address_line_1, '')), '');
  v_address_2 text := nullif(trim(both from coalesce(p_address_line_2, '')), '');
  v_city text := nullif(trim(both from coalesce(p_city, '')), '');
  v_state text := nullif(trim(both from coalesce(p_state, '')), '');
  v_postal text := nullif(trim(both from coalesce(p_postal_code, '')), '');
  v_timezone text := coalesce(
    nullif(trim(both from coalesce(p_timezone, '')), ''),
    'America/Los_Angeles'
  );
  v_slug text;
  v_base_slug text;
  v_suffix text;
  v_constraint text;
  v_attempt int := 1;
  v_organization_id uuid;
  v_campus_id uuid;
  v_membership_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: You must be signed in to create a church.';
  END IF;

  IF v_name = '' THEN
    RAISE EXCEPTION 'VALIDATION: Church name is required.';
  END IF;

  IF v_campus_name = '' THEN
    RAISE EXCEPTION 'VALIDATION: Primary campus name is required.';
  END IF;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'VALIDATION: Primary email is required.';
  END IF;

  IF v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'VALIDATION: Primary email is invalid.';
  END IF;

  -- Always derive the slug from the church name. Ignore client-supplied p_slug
  -- so users cannot inject or guess identifiers during onboarding.
  v_base_slug := lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_base_slug := trim(both '-' from v_base_slug);
  v_base_slug := left(v_base_slug, 80);
  v_base_slug := trim(trailing '-' from v_base_slug);
  IF v_base_slug = '' THEN
    v_base_slug := 'church';
  END IF;

  v_slug := v_base_slug;

  LOOP
    BEGIN
      INSERT INTO public.organizations (
        name,
        slug,
        primary_email,
        phone,
        address_line_1,
        address_line_2,
        city,
        state,
        postal_code,
        timezone,
        status,
        created_at,
        updated_at
      )
      VALUES (
        v_name,
        v_slug,
        v_email,
        v_phone,
        v_address_1,
        v_address_2,
        v_city,
        v_state,
        v_postal,
        v_timezone,
        'trial'::public.organization_status,
        now(),
        now()
      )
      RETURNING id INTO v_organization_id;
      EXIT;
    EXCEPTION
      WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
        IF coalesce(v_constraint, '') NOT IN (
             'churches_slug_key',
             'organizations_slug_key'
           )
           AND coalesce(v_constraint, '') NOT ILIKE '%slug%'
           AND SQLERRM NOT ILIKE '%slug%' THEN
          RAISE;
        END IF;

        v_attempt := v_attempt + 1;
        IF v_attempt > 1000 THEN
          RAISE EXCEPTION 'Unable to allocate a unique church identifier.';
        END IF;

        v_suffix := '-' || v_attempt::text;
        v_slug := trim(trailing '-' from left(v_base_slug, 80 - length(v_suffix)))
          || v_suffix;
    END;
  END LOOP;

  INSERT INTO public.campuses (
    organization_id,
    name,
    short_name,
    slug,
    campus_type,
    is_primary,
    address_line_1,
    address_line_2,
    city,
    state,
    postal_code,
    timezone,
    status,
    created_by,
    updated_by,
    created_at,
    updated_at
  )
  VALUES (
    v_organization_id,
    v_campus_name,
    left(v_campus_name, 64),
    'main',
    'main'::public.campus_type,
    true,
    v_address_1,
    v_address_2,
    v_city,
    v_state,
    v_postal,
    v_timezone,
    'active'::public.campus_status,
    v_user_id,
    v_user_id,
    now(),
    now()
  )
  RETURNING id INTO v_campus_id;

  IF v_campus_id IS NULL THEN
    RAISE EXCEPTION 'Failed to create primary campus.';
  END IF;

  INSERT INTO public.organization_memberships (
    organization_id,
    user_id,
    role,
    status,
    invited_by,
    joined_at,
    created_at,
    updated_at
  )
  VALUES (
    v_organization_id,
    v_user_id,
    'owner'::public.membership_role,
    'active'::public.membership_status,
    v_user_id,
    now(),
    now(),
    now()
  )
  RETURNING id INTO v_membership_id;

  INSERT INTO public.audit_logs (
    organization_id,
    user_id,
    action,
    entity_type,
    entity_id,
    metadata,
    created_at
  )
  VALUES (
    v_organization_id,
    v_user_id,
    'church.created',
    'church',
    v_organization_id,
    jsonb_build_object(
      'campus_id', v_campus_id,
      'membership_id', v_membership_id,
      'role', 'owner',
      'campus_name', v_campus_name
    ),
    now()
  );

  INSERT INTO public.audit_logs (
    organization_id,
    user_id,
    action,
    entity_type,
    entity_id,
    metadata,
    created_at
  )
  VALUES (
    v_organization_id,
    v_user_id,
    'campus.created',
    'campus',
    v_campus_id,
    jsonb_build_object(
      'name', v_campus_name,
      'is_primary', true,
      'campus_type', 'main'
    ),
    now()
  );

  RETURN jsonb_build_object(
    'organization_id', v_organization_id,
    'campus_id', v_campus_id,
    'membership_id', v_membership_id,
    'slug', v_slug
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_organization_with_owner(
  text, text, text, text, text, text, text, text, text, text, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_organization_with_owner(
  text, text, text, text, text, text, text, text, text, text, text
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_organization_with_owner(
  text, text, text, text, text, text, text, text, text, text, text
) TO service_role;
