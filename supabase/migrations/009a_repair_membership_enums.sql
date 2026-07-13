-- =============================================================================
-- 009a_repair_membership_enums.sql
-- Run this FIRST in the SQL Editor if enums are missing after a partial 009 apply.
-- Safe to re-run.
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE public.church_status AS ENUM ('trial', 'active', 'suspended', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.membership_role AS ENUM (
    'owner',
    'administrator',
    'security_leader',
    'security_member',
    'viewer'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.membership_status AS ENUM (
    'invited',
    'active',
    'suspended',
    'removed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.campus_status AS ENUM ('active', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Ensure church_memberships exists with required columns
CREATE TABLE IF NOT EXISTS public.church_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role public.membership_role NOT NULL DEFAULT 'viewer'::public.membership_role,
  status public.membership_status NOT NULL DEFAULT 'invited'::public.membership_status,
  invited_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  joined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
DECLARE
  role_typ text;
  status_typ text;
BEGIN
  -- Drop leftover temp columns from failed earlier swaps
  ALTER TABLE public.church_memberships DROP COLUMN IF EXISTS role_tmp;
  ALTER TABLE public.church_memberships DROP COLUMN IF EXISTS status_tmp;

  -- Current type of role (null if column missing)
  SELECT t.typname
  INTO role_typ
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_type t ON t.oid = a.atttypid
  WHERE n.nspname = 'public'
    AND c.relname = 'church_memberships'
    AND a.attname = 'role'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  SELECT t.typname
  INTO status_typ
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_type t ON t.oid = a.atttypid
  WHERE n.nspname = 'public'
    AND c.relname = 'church_memberships'
    AND a.attname = 'status'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  -- ---- role ----
  IF role_typ IS NULL THEN
    -- Column missing: add correct enum column
    ALTER TABLE public.church_memberships
      ADD COLUMN role public.membership_role;

    UPDATE public.church_memberships
    SET role = 'viewer'::public.membership_role
    WHERE role IS NULL;

    ALTER TABLE public.church_memberships
      ALTER COLUMN role SET DEFAULT 'viewer'::public.membership_role,
      ALTER COLUMN role SET NOT NULL;

  ELSIF role_typ IS DISTINCT FROM 'membership_role' THEN
    -- Wrong type: rebuild via temp column
    ALTER TABLE public.church_memberships
      ADD COLUMN role_tmp public.membership_role;

    EXECUTE $sql$
      UPDATE public.church_memberships
      SET role_tmp = CASE lower(btrim(role::text))
        WHEN 'owner' THEN 'owner'::public.membership_role
        WHEN 'administrator' THEN 'administrator'::public.membership_role
        WHEN 'admin' THEN 'administrator'::public.membership_role
        WHEN 'security_leader' THEN 'security_leader'::public.membership_role
        WHEN 'security_member' THEN 'security_member'::public.membership_role
        WHEN 'viewer' THEN 'viewer'::public.membership_role
        WHEN 'member' THEN 'security_member'::public.membership_role
        ELSE 'viewer'::public.membership_role
      END
      WHERE role_tmp IS NULL
    $sql$;

    ALTER TABLE public.church_memberships DROP COLUMN role;
    ALTER TABLE public.church_memberships RENAME COLUMN role_tmp TO role;
    ALTER TABLE public.church_memberships
      ALTER COLUMN role SET DEFAULT 'viewer'::public.membership_role,
      ALTER COLUMN role SET NOT NULL;
  END IF;

  -- ---- status ----
  IF status_typ IS NULL THEN
    -- Column missing: add correct enum column
    ALTER TABLE public.church_memberships
      ADD COLUMN status public.membership_status;

    UPDATE public.church_memberships
    SET status = 'active'::public.membership_status
    WHERE status IS NULL;

    ALTER TABLE public.church_memberships
      ALTER COLUMN status SET DEFAULT 'invited'::public.membership_status,
      ALTER COLUMN status SET NOT NULL;

  ELSIF status_typ IS DISTINCT FROM 'membership_status' THEN
    ALTER TABLE public.church_memberships
      ADD COLUMN status_tmp public.membership_status;

    EXECUTE $sql$
      UPDATE public.church_memberships
      SET status_tmp = CASE lower(btrim(status::text))
        WHEN 'invited' THEN 'invited'::public.membership_status
        WHEN 'active' THEN 'active'::public.membership_status
        WHEN 'suspended' THEN 'suspended'::public.membership_status
        WHEN 'removed' THEN 'removed'::public.membership_status
        ELSE 'invited'::public.membership_status
      END
      WHERE status_tmp IS NULL
    $sql$;

    ALTER TABLE public.church_memberships DROP COLUMN status;
    ALTER TABLE public.church_memberships RENAME COLUMN status_tmp TO status;
    ALTER TABLE public.church_memberships
      ALTER COLUMN status SET DEFAULT 'invited'::public.membership_status,
      ALTER COLUMN status SET NOT NULL;
  END IF;
END $$;

-- Unique membership per church/user (ignore if already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'church_memberships_church_user_key'
  ) THEN
    ALTER TABLE public.church_memberships
      ADD CONSTRAINT church_memberships_church_user_key UNIQUE (church_id, user_id);
  END IF;
EXCEPTION
  WHEN unique_violation THEN
    RAISE NOTICE 'church_memberships has duplicate (church_id, user_id) rows; unique constraint skipped';
END $$;

DROP FUNCTION IF EXISTS public.user_membership_role(UUID);

CREATE OR REPLACE FUNCTION public.user_membership_role(p_church_id UUID)
RETURNS public.membership_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.role
  FROM church_memberships m
  WHERE m.user_id = auth.uid()
    AND m.church_id = p_church_id
    AND m.status = 'active'::public.membership_status
  LIMIT 1;
$$;

-- Verification
SELECT
  a.attname AS column_name,
  t.typname AS type_name
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_type t ON t.oid = a.atttypid
WHERE n.nspname = 'public'
  AND c.relname = 'church_memberships'
  AND a.attname IN ('role', 'status')
  AND a.attnum > 0
  AND NOT a.attisdropped
ORDER BY a.attname;

SELECT typname
FROM pg_type t
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
  AND t.typname IN (
    'church_status',
    'membership_role',
    'membership_status',
    'campus_status'
  )
ORDER BY typname;
