-- =============================================================================
-- 012_create_church_with_owner.sql
-- Atomic church onboarding: church + campus + owner membership + audit log.
-- Safe to re-run.
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE public.church_status AS ENUM ('trial', 'active', 'suspended', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.campus_status AS ENUM ('active', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.membership_role AS ENUM (
    'owner', 'administrator', 'security_leader', 'security_member', 'viewer'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.membership_status AS ENUM (
    'invited', 'active', 'suspended', 'removed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Ensure dependent tables/columns exist (partial Phase 3 installs)
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS primary_email TEXT;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS address_line_1 TEXT;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS address_line_2 TEXT;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS timezone TEXT;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS status public.church_status;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE public.churches
SET
  timezone = COALESCE(timezone, 'America/Los_Angeles'),
  status = COALESCE(status, 'trial'::public.church_status),
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, now())
WHERE timezone IS NULL OR status IS NULL OR created_at IS NULL OR updated_at IS NULL;

ALTER TABLE public.churches
  ALTER COLUMN timezone SET DEFAULT 'America/Los_Angeles',
  ALTER COLUMN status SET DEFAULT 'trial'::public.church_status,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'churches_slug_key'
  ) THEN
    -- Backfill any null slugs before unique constraint
    UPDATE public.churches
    SET slug = 'church-' || SUBSTRING(REPLACE(id::text, '-', '') FROM 1 FOR 8)
    WHERE slug IS NULL OR trim(slug) = '';

    ALTER TABLE public.churches ALTER COLUMN slug SET NOT NULL;
    ALTER TABLE public.churches ADD CONSTRAINT churches_slug_key UNIQUE (slug);
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'churches slug unique setup skipped: %', SQLERRM;
END $$;

CREATE TABLE IF NOT EXISTS public.campuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address_line_1 TEXT,
  address_line_2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  timezone TEXT,
  status public.campus_status NOT NULL DEFAULT 'active'::public.campus_status,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID REFERENCES public.churches (id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.create_church_with_owner(
  p_name text,
  p_primary_email text,
  p_phone text,
  p_address_line_1 text,
  p_city text,
  p_state text,
  p_postal_code text,
  p_timezone text,
  p_campus_name text,
  p_address_line_2 text DEFAULT NULL
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
  v_base_slug text;
  v_slug text;
  v_church_id uuid;
  v_campus_id uuid;
  v_membership_id uuid;
  v_i int := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: You must be signed in to create a church.';
  END IF;

  IF v_name = '' THEN
    RAISE EXCEPTION 'VALIDATION: Church name is required.';
  END IF;

  IF length(v_name) > 200 THEN
    RAISE EXCEPTION 'VALIDATION: Church name is too long.';
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

  -- Profile must exist (trigger normally creates it)
  INSERT INTO public.profiles (id, created_at, updated_at)
  VALUES (v_user_id, now(), now())
  ON CONFLICT (id) DO NOTHING;

  v_base_slug := lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_base_slug := trim(both '-' from v_base_slug);
  IF v_base_slug IS NULL OR v_base_slug = '' THEN
    v_base_slug := 'church';
  END IF;

  v_slug := v_base_slug;
  WHILE EXISTS (SELECT 1 FROM public.churches c WHERE c.slug = v_slug) LOOP
    v_i := v_i + 1;
    v_slug := v_base_slug || '-' || v_i::text;
    IF v_i > 1000 THEN
      v_slug := v_base_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
      EXIT;
    END IF;
  END LOOP;

  INSERT INTO public.churches (
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
  ) VALUES (
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
    'trial'::public.church_status,
    now(),
    now()
  )
  RETURNING id INTO v_church_id;

  IF v_church_id IS NULL THEN
    RAISE EXCEPTION 'Failed to create church.';
  END IF;

  INSERT INTO public.campuses (
    church_id,
    name,
    address_line_1,
    address_line_2,
    city,
    state,
    postal_code,
    timezone,
    status,
    created_at,
    updated_at
  ) VALUES (
    v_church_id,
    v_campus_name,
    v_address_1,
    v_address_2,
    v_city,
    v_state,
    v_postal,
    v_timezone,
    'active'::public.campus_status,
    now(),
    now()
  )
  RETURNING id INTO v_campus_id;

  IF v_campus_id IS NULL THEN
    RAISE EXCEPTION 'Failed to create primary campus.';
  END IF;

  -- Exactly one owner membership for this user+church (unique constraint)
  INSERT INTO public.church_memberships (
    church_id,
    user_id,
    role,
    status,
    joined_at,
    created_at,
    updated_at
  ) VALUES (
    v_church_id,
    v_user_id,
    'owner'::public.membership_role,
    'active'::public.membership_status,
    now(),
    now(),
    now()
  )
  RETURNING id INTO v_membership_id;

  IF v_membership_id IS NULL THEN
    RAISE EXCEPTION 'Failed to create owner membership.';
  END IF;

  -- Church must not exist without an owner membership (same transaction)
  IF NOT EXISTS (
    SELECT 1
    FROM public.church_memberships m
    WHERE m.id = v_membership_id
      AND m.church_id = v_church_id
      AND m.user_id = v_user_id
      AND m.role = 'owner'::public.membership_role
      AND m.status = 'active'::public.membership_status
  ) THEN
    RAISE EXCEPTION 'Church creation aborted: owner membership missing.';
  END IF;

  INSERT INTO public.audit_logs (
    church_id,
    user_id,
    action,
    entity_type,
    entity_id,
    metadata,
    created_at
  ) VALUES (
    v_church_id,
    v_user_id,
    'church.created',
    'church',
    v_church_id,
    jsonb_build_object(
      'slug', v_slug,
      'campus_id', v_campus_id,
      'membership_id', v_membership_id,
      'role', 'owner',
      'campus_name', v_campus_name
    ),
    now()
  );

  RETURN jsonb_build_object(
    'church_id', v_church_id,
    'campus_id', v_campus_id,
    'membership_id', v_membership_id,
    'slug', v_slug
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_church_with_owner(
  text, text, text, text, text, text, text, text, text, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_church_with_owner(
  text, text, text, text, text, text, text, text, text, text
) TO authenticated;

-- Campuses/audit grants for later reads (writes go through this function)
GRANT SELECT ON public.campuses TO authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;
