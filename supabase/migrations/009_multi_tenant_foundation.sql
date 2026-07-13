-- =============================================================================
-- 009_multi_tenant_foundation.sql
-- Sanctuary Protected — multi-tenant identity, memberships, campuses, audit
--
-- DO NOT APPLY until reviewed.
-- Safe patterns: IF NOT EXISTS / exception handlers where re-run risk exists.
--
-- Effects:
--   1. Extends churches + profiles to the Phase 3 shape
--   2. Adds church_memberships, church_invitations, campuses, audit_logs
--   3. Migrates profiles.church_id + profiles.role → church_memberships
--   4. Rewrites RLS helpers to use ACTIVE memberships (multi-church safe)
--   5. Drops permanent profiles.church_id and profiles.role
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enums / constrained status + role types (schema-qualified)
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Shared updated_at trigger function
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- churches — extend existing table (one column at a time for safer applies)
-- ---------------------------------------------------------------------------

ALTER TABLE churches ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE churches ADD COLUMN IF NOT EXISTS primary_email TEXT;
ALTER TABLE churches ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE churches ADD COLUMN IF NOT EXISTS address_line_1 TEXT;
ALTER TABLE churches ADD COLUMN IF NOT EXISTS address_line_2 TEXT;
ALTER TABLE churches ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE churches ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE churches ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE churches ADD COLUMN IF NOT EXISTS timezone TEXT;
ALTER TABLE churches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE churches ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

-- status must use the enum type with an explicit cast (avoids 42703 / ambiguous default issues)
ALTER TABLE churches ADD COLUMN IF NOT EXISTS status public.church_status;

UPDATE churches
SET timezone = COALESCE(timezone, 'America/Los_Angeles')
WHERE timezone IS NULL;

UPDATE churches
SET updated_at = COALESCE(updated_at, now())
WHERE updated_at IS NULL;

UPDATE churches
SET created_at = COALESCE(created_at, now())
WHERE created_at IS NULL;

UPDATE churches
SET status = COALESCE(status, 'trial'::public.church_status)
WHERE status IS NULL;

ALTER TABLE churches
  ALTER COLUMN timezone SET DEFAULT 'America/Los_Angeles',
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN status SET DEFAULT 'trial'::public.church_status;

ALTER TABLE churches
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN status SET NOT NULL;

-- Backfill slugs for existing rows
UPDATE churches
SET slug = COALESCE(
  NULLIF(slug, ''),
  LOWER(REGEXP_REPLACE(TRIM(name), '[^a-zA-Z0-9]+', '-', 'g'))
) || '-' || SUBSTRING(REPLACE(id::text, '-', '') FROM 1 FOR 8)
WHERE slug IS NULL OR slug = '';

ALTER TABLE churches
  ALTER COLUMN slug SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'churches_slug_key'
  ) THEN
    ALTER TABLE churches ADD CONSTRAINT churches_slug_key UNIQUE (slug);
  END IF;
END $$;

DROP TRIGGER IF EXISTS churches_updated_at ON churches;
CREATE TRIGGER churches_updated_at
  BEFORE UPDATE ON churches
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS churches_status_idx ON churches (status);
CREATE INDEX IF NOT EXISTS churches_slug_idx ON churches (slug);

-- ---------------------------------------------------------------------------
-- profiles — identity only (no permanent church_id)
-- ---------------------------------------------------------------------------

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Best-effort split of legacy full_name into first/last
UPDATE profiles
SET
  first_name = COALESCE(
    first_name,
    NULLIF(split_part(TRIM(full_name), ' ', 1), '')
  ),
  last_name = COALESCE(
    last_name,
    NULLIF(
      TRIM(substring(TRIM(full_name) FROM length(split_part(TRIM(full_name), ' ', 1)) + 1)),
      ''
    )
  )
WHERE full_name IS NOT NULL
  AND (first_name IS NULL OR last_name IS NULL);

DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS profiles_created_at_idx ON profiles (created_at);

-- ---------------------------------------------------------------------------
-- church_memberships
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS church_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL REFERENCES churches (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role public.membership_role NOT NULL,
  status public.membership_status NOT NULL DEFAULT 'invited'::public.membership_status,
  invited_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  joined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_memberships_church_user_key UNIQUE (church_id, user_id)
);

-- Repair memberships created by a partial earlier run
ALTER TABLE church_memberships ADD COLUMN IF NOT EXISTS church_id UUID;
ALTER TABLE church_memberships ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE church_memberships ADD COLUMN IF NOT EXISTS role public.membership_role;
ALTER TABLE church_memberships ADD COLUMN IF NOT EXISTS status public.membership_status;
ALTER TABLE church_memberships ADD COLUMN IF NOT EXISTS invited_by UUID;
ALTER TABLE church_memberships ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ;
ALTER TABLE church_memberships ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE church_memberships ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE church_memberships
SET status = COALESCE(status, 'invited'::public.membership_status)
WHERE status IS NULL;

UPDATE church_memberships
SET created_at = COALESCE(created_at, now())
WHERE created_at IS NULL;

UPDATE church_memberships
SET updated_at = COALESCE(updated_at, now())
WHERE updated_at IS NULL;

-- If a partial earlier run created role/status as non-enum types, normalize
-- via column swap (avoids ALTER TYPE default / operator cast failures).
DO $$
DECLARE
  role_typ text;
  status_typ text;
BEGIN
  IF to_regclass('public.church_memberships') IS NULL THEN
    RETURN;
  END IF;

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

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'membership_role'
  ) THEN
    CREATE TYPE public.membership_role AS ENUM (
      'owner',
      'administrator',
      'security_leader',
      'security_member',
      'viewer'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'membership_status'
  ) THEN
    CREATE TYPE public.membership_status AS ENUM (
      'invited',
      'active',
      'suspended',
      'removed'
    );
  END IF;

  IF role_typ IS DISTINCT FROM 'membership_role' THEN
    ALTER TABLE church_memberships
      ADD COLUMN IF NOT EXISTS role_tmp public.membership_role;

    UPDATE church_memberships
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
    WHERE role_tmp IS NULL;

    ALTER TABLE church_memberships DROP COLUMN role;
    ALTER TABLE church_memberships RENAME COLUMN role_tmp TO role;
    ALTER TABLE church_memberships ALTER COLUMN role SET NOT NULL;
  END IF;

  IF status_typ IS DISTINCT FROM 'membership_status' THEN
    ALTER TABLE church_memberships
      ADD COLUMN IF NOT EXISTS status_tmp public.membership_status;

    UPDATE church_memberships
    SET status_tmp = CASE lower(btrim(status::text))
      WHEN 'invited' THEN 'invited'::public.membership_status
      WHEN 'active' THEN 'active'::public.membership_status
      WHEN 'suspended' THEN 'suspended'::public.membership_status
      WHEN 'removed' THEN 'removed'::public.membership_status
      ELSE 'invited'::public.membership_status
    END
    WHERE status_tmp IS NULL;

    ALTER TABLE church_memberships DROP COLUMN status;
    ALTER TABLE church_memberships RENAME COLUMN status_tmp TO status;
    ALTER TABLE church_memberships
      ALTER COLUMN status SET DEFAULT 'invited'::public.membership_status;
    ALTER TABLE church_memberships ALTER COLUMN status SET NOT NULL;
  END IF;
END $$;

ALTER TABLE church_memberships
  ALTER COLUMN status SET DEFAULT 'invited'::public.membership_status,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

CREATE INDEX IF NOT EXISTS church_memberships_user_id_idx
  ON church_memberships (user_id);

CREATE INDEX IF NOT EXISTS church_memberships_church_id_idx
  ON church_memberships (church_id);

CREATE INDEX IF NOT EXISTS church_memberships_status_idx
  ON church_memberships (status);

CREATE INDEX IF NOT EXISTS church_memberships_active_user_church_idx
  ON church_memberships (user_id, church_id)
  WHERE status = 'active'::public.membership_status;

DROP TRIGGER IF EXISTS church_memberships_updated_at ON church_memberships;
CREATE TRIGGER church_memberships_updated_at
  BEFORE UPDATE ON church_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Migrate legacy profiles.church_id + profiles.role → memberships
-- Role map: administrator→administrator, security_leader→security_leader,
--           member (or missing)→security_member
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'church_id'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND column_name = 'role'
    ) THEN
      INSERT INTO church_memberships (
        church_id, user_id, role, status, joined_at, created_at, updated_at
      )
      SELECT
        p.church_id,
        p.id,
        CASE
          WHEN p.role::text = 'administrator' THEN 'administrator'::membership_role
          WHEN p.role::text = 'security_leader' THEN 'security_leader'::membership_role
          ELSE 'security_member'::membership_role
        END,
        'active'::membership_status,
        COALESCE(p.created_at, now()),
        COALESCE(p.created_at, now()),
        now()
      FROM profiles p
      WHERE p.church_id IS NOT NULL
      ON CONFLICT (church_id, user_id) DO NOTHING;
    ELSE
      INSERT INTO church_memberships (
        church_id, user_id, role, status, joined_at, created_at, updated_at
      )
      SELECT
        p.church_id,
        p.id,
        'security_member'::membership_role,
        'active'::membership_status,
        COALESCE(p.created_at, now()),
        COALESCE(p.created_at, now()),
        now()
      FROM profiles p
      WHERE p.church_id IS NOT NULL
      ON CONFLICT (church_id, user_id) DO NOTHING;
    END IF;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- church_invitations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS church_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL REFERENCES churches (id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role membership_role NOT NULL,
  token_hash TEXT NOT NULL,
  invited_by UUID NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_invitations_token_hash_key UNIQUE (token_hash),
  -- Owners are never invited through the standard invitation flow
  CONSTRAINT church_invitations_role_not_owner_check CHECK (role <> 'owner'),
  -- Single-use: cannot be both accepted and revoked
  CONSTRAINT church_invitations_terminal_state_check CHECK (
    NOT (accepted_at IS NOT NULL AND revoked_at IS NOT NULL)
  ),
  -- Must expire in the future at insert time is enforced by app;
  -- ensure expires_at is always set (NOT NULL above)
  CONSTRAINT church_invitations_email_nonempty_check CHECK (length(trim(email)) > 0)
);

-- Only one pending invitation per church + email
CREATE UNIQUE INDEX IF NOT EXISTS church_invitations_pending_church_email_idx
  ON church_invitations (church_id, lower(email))
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS church_invitations_church_id_idx
  ON church_invitations (church_id);

CREATE INDEX IF NOT EXISTS church_invitations_email_idx
  ON church_invitations (lower(email));

CREATE INDEX IF NOT EXISTS church_invitations_expires_at_idx
  ON church_invitations (expires_at);

-- ---------------------------------------------------------------------------
-- campuses
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS campuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL REFERENCES churches (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address_line_1 TEXT,
  address_line_2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  timezone TEXT,
  status public.campus_status,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Repair campuses created by a partial earlier run
ALTER TABLE campuses ADD COLUMN IF NOT EXISTS church_id UUID;
ALTER TABLE campuses ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE campuses ADD COLUMN IF NOT EXISTS address_line_1 TEXT;
ALTER TABLE campuses ADD COLUMN IF NOT EXISTS address_line_2 TEXT;
ALTER TABLE campuses ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE campuses ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE campuses ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE campuses ADD COLUMN IF NOT EXISTS timezone TEXT;
ALTER TABLE campuses ADD COLUMN IF NOT EXISTS status public.campus_status;
ALTER TABLE campuses ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE campuses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE campuses
SET status = COALESCE(status, 'active'::public.campus_status)
WHERE status IS NULL;

UPDATE campuses
SET created_at = COALESCE(created_at, now())
WHERE created_at IS NULL;

UPDATE campuses
SET updated_at = COALESCE(updated_at, now())
WHERE updated_at IS NULL;

ALTER TABLE campuses
  ALTER COLUMN status SET DEFAULT 'active'::public.campus_status,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE campuses
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS campuses_church_id_idx ON campuses (church_id);
CREATE INDEX IF NOT EXISTS campuses_status_idx ON campuses (status);
CREATE INDEX IF NOT EXISTS campuses_church_name_idx ON campuses (church_id, name);

DROP TRIGGER IF EXISTS campuses_updated_at ON campuses;
CREATE TRIGGER campuses_updated_at
  BEFORE UPDATE ON campuses
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- audit_logs (append-only from the app / RLS perspective)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID REFERENCES churches (id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT audit_logs_action_nonempty_check CHECK (length(trim(action)) > 0)
);

CREATE INDEX IF NOT EXISTS audit_logs_church_id_idx ON audit_logs (church_id);
CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs (action);

-- Block UPDATE/DELETE even for table owners via trigger (defense in depth)
CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs are append-only';
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_no_update ON audit_logs;
CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_log_mutation();

DROP TRIGGER IF EXISTS audit_logs_no_delete ON audit_logs;
CREATE TRIGGER audit_logs_no_delete
  BEFORE DELETE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_log_mutation();

-- ---------------------------------------------------------------------------
-- RLS helper functions — membership based (multi-church)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.has_active_church_membership(p_church_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM church_memberships m
    JOIN churches c ON c.id = m.church_id
    WHERE m.user_id = auth.uid()
      AND m.church_id = p_church_id
      AND m.status = 'active'::public.membership_status
      AND c.status IN (
        'trial'::public.church_status,
        'active'::public.church_status
      )
  );
$$;

DROP FUNCTION IF EXISTS public.user_membership_role(UUID);

CREATE OR REPLACE FUNCTION public.user_membership_role(p_church_id UUID)
RETURNS public.membership_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.role::public.membership_role
  FROM church_memberships m
  WHERE m.user_id = auth.uid()
    AND m.church_id = p_church_id
    AND m.status = 'active'::public.membership_status
  LIMIT 1;
$$;

-- Backward-compatible single-church helper used by older policies.
-- Prefers the oldest active membership when a user has more than one.
CREATE OR REPLACE FUNCTION public.user_church_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.church_id
  FROM church_memberships m
  WHERE m.user_id = auth.uid()
    AND m.status = 'active'::public.membership_status
  ORDER BY COALESCE(m.joined_at, m.created_at) NULLS LAST, m.created_at
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_certifications()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM church_memberships m
    WHERE m.user_id = auth.uid()
      AND m.status = 'active'::public.membership_status
      AND m.role IN (
        'owner'::public.membership_role,
        'administrator'::public.membership_role,
        'security_leader'::public.membership_role
      )
      AND (
        public.user_church_id() IS NULL
        OR m.church_id = public.user_church_id()
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_certifications_for_church(p_church_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM church_memberships m
    WHERE m.user_id = auth.uid()
      AND m.church_id = p_church_id
      AND m.status = 'active'::public.membership_status
      AND m.role IN (
        'owner'::public.membership_role,
        'administrator'::public.membership_role,
        'security_leader'::public.membership_role
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Replace legacy policies that depend on profiles.church_id BEFORE dropping it
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can read their church" ON churches;
DROP POLICY IF EXISTS "Users can read own church" ON churches;
CREATE POLICY "Users can read their church"
  ON churches FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM church_memberships m
      WHERE m.church_id = churches.id
        AND m.user_id = auth.uid()
        AND m.status IN (
          'invited'::public.membership_status,
          'active'::public.membership_status
        )
    )
  );

DROP POLICY IF EXISTS "Users can view church incidents" ON incidents;
CREATE POLICY "Users can view church incidents"
  ON incidents FOR SELECT
  TO authenticated
  USING (public.has_active_church_membership(church_id));

DROP POLICY IF EXISTS "Users can create church incidents" ON incidents;
CREATE POLICY "Users can create church incidents"
  ON incidents FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_active_church_membership(church_id)
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "Users can update church incidents" ON incidents;
CREATE POLICY "Users can update church incidents"
  ON incidents FOR UPDATE
  TO authenticated
  USING (public.has_active_church_membership(church_id))
  WITH CHECK (public.has_active_church_membership(church_id));

DROP POLICY IF EXISTS "Users can view church incident updates" ON incident_updates;
CREATE POLICY "Users can view church incident updates"
  ON incident_updates FOR SELECT
  TO authenticated
  USING (public.has_active_church_membership(church_id));

DROP POLICY IF EXISTS "Users can create church incident updates" ON incident_updates;
CREATE POLICY "Users can create church incident updates"
  ON incident_updates FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_active_church_membership(church_id)
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "Users can view church team members" ON team_members;
CREATE POLICY "Users can view church team members"
  ON team_members FOR SELECT
  TO authenticated
  USING (public.has_active_church_membership(church_id));

DROP POLICY IF EXISTS "Leaders can create team members" ON team_members;
CREATE POLICY "Leaders can create team members"
  ON team_members FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_active_church_membership(church_id)
    AND public.can_manage_certifications_for_church(church_id)
  );

DROP POLICY IF EXISTS "Leaders can update team members" ON team_members;
CREATE POLICY "Leaders can update team members"
  ON team_members FOR UPDATE
  TO authenticated
  USING (public.can_manage_certifications_for_church(church_id))
  WITH CHECK (public.can_manage_certifications_for_church(church_id));

DROP POLICY IF EXISTS "Users can view church certifications" ON certifications;
CREATE POLICY "Users can view church certifications"
  ON certifications FOR SELECT
  TO authenticated
  USING (public.has_active_church_membership(church_id));

DROP POLICY IF EXISTS "Leaders can create certifications" ON certifications;
CREATE POLICY "Leaders can create certifications"
  ON certifications FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_active_church_membership(church_id)
    AND public.can_manage_certifications_for_church(church_id)
  );

DROP POLICY IF EXISTS "Leaders can update certifications" ON certifications;
CREATE POLICY "Leaders can update certifications"
  ON certifications FOR UPDATE
  TO authenticated
  USING (public.can_manage_certifications_for_church(church_id))
  WITH CHECK (public.can_manage_certifications_for_church(church_id));

DROP POLICY IF EXISTS "Users can view church events" ON events;
CREATE POLICY "Users can view church events"
  ON events FOR SELECT
  TO authenticated
  USING (public.has_active_church_membership(church_id));

DROP POLICY IF EXISTS "Users can acknowledge church events" ON events;
CREATE POLICY "Users can acknowledge church events"
  ON events FOR UPDATE
  TO authenticated
  USING (public.has_active_church_membership(church_id))
  WITH CHECK (public.has_active_church_membership(church_id));

DROP POLICY IF EXISTS "Leaders can create events" ON events;
CREATE POLICY "Leaders can create events"
  ON events FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_active_church_membership(church_id)
    AND public.can_manage_certifications_for_church(church_id)
  );

-- ---------------------------------------------------------------------------
-- Drop permanent church linkage from profiles (after memberships + policies)
-- ---------------------------------------------------------------------------

-- Make church_id nullable first (for environments mid-migration)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'church_id'
  ) THEN
    ALTER TABLE profiles ALTER COLUMN church_id DROP NOT NULL;
  END IF;
END $$;

-- Drop FK + column when present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'church_id'
  ) THEN
    ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_church_id_fkey;
    ALTER TABLE profiles DROP COLUMN church_id;
  END IF;
END $$;

-- Drop legacy profile role column + helper that read it
DROP FUNCTION IF EXISTS public.user_app_role();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'role'
  ) THEN
    ALTER TABLE profiles DROP COLUMN role;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Row Level Security — new tables
-- ---------------------------------------------------------------------------

ALTER TABLE church_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE church_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE campuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Memberships: users see their own rows; church managers see church roster
DROP POLICY IF EXISTS "Users can read own memberships" ON church_memberships;
CREATE POLICY "Users can read own memberships"
  ON church_memberships FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_active_church_membership(church_id)
  );

DROP POLICY IF EXISTS "Managers can insert memberships" ON church_memberships;
CREATE POLICY "Managers can insert memberships"
  ON church_memberships FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_manage_certifications_for_church(church_id)
  );

DROP POLICY IF EXISTS "Managers can update memberships" ON church_memberships;
CREATE POLICY "Managers can update memberships"
  ON church_memberships FOR UPDATE
  TO authenticated
  USING (public.can_manage_certifications_for_church(church_id))
  WITH CHECK (public.can_manage_certifications_for_church(church_id));

-- Invitations: managers only; never expose to anon
DROP POLICY IF EXISTS "Managers can read invitations" ON church_invitations;
CREATE POLICY "Managers can read invitations"
  ON church_invitations FOR SELECT
  TO authenticated
  USING (public.can_manage_certifications_for_church(church_id));

DROP POLICY IF EXISTS "Managers can create invitations" ON church_invitations;
CREATE POLICY "Managers can create invitations"
  ON church_invitations FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_manage_certifications_for_church(church_id)
    AND role <> 'owner'
    AND invited_by = auth.uid()
  );

DROP POLICY IF EXISTS "Managers can update invitations" ON church_invitations;
CREATE POLICY "Managers can update invitations"
  ON church_invitations FOR UPDATE
  TO authenticated
  USING (public.can_manage_certifications_for_church(church_id))
  WITH CHECK (public.can_manage_certifications_for_church(church_id));

-- Campuses
DROP POLICY IF EXISTS "Members can read campuses" ON campuses;
CREATE POLICY "Members can read campuses"
  ON campuses FOR SELECT
  TO authenticated
  USING (public.has_active_church_membership(church_id));

DROP POLICY IF EXISTS "Managers can insert campuses" ON campuses;
CREATE POLICY "Managers can insert campuses"
  ON campuses FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_certifications_for_church(church_id));

DROP POLICY IF EXISTS "Managers can update campuses" ON campuses;
CREATE POLICY "Managers can update campuses"
  ON campuses FOR UPDATE
  TO authenticated
  USING (public.can_manage_certifications_for_church(church_id))
  WITH CHECK (public.can_manage_certifications_for_church(church_id));

-- Audit logs: members can read their church; authenticated can insert for
-- churches they belong to; no UPDATE/DELETE policies (append-only)
DROP POLICY IF EXISTS "Members can read audit logs" ON audit_logs;
CREATE POLICY "Members can read audit logs"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (
    church_id IS NOT NULL
    AND public.has_active_church_membership(church_id)
  );

DROP POLICY IF EXISTS "Members can insert audit logs" ON audit_logs;
CREATE POLICY "Members can insert audit logs"
  ON audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      church_id IS NULL
      OR public.has_active_church_membership(church_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Tighten existing operational policies to membership checks where helpful
-- (keeps church_id scoping; prefers has_active_church_membership)
-- ---------------------------------------------------------------------------

-- churches: readable if user has any membership (including invited for name)
DROP POLICY IF EXISTS "Users can read own church" ON churches;
CREATE POLICY "Users can read own church"
  ON churches FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM church_memberships m
      WHERE m.church_id = churches.id
        AND m.user_id = auth.uid()
        AND m.status IN ('invited', 'active')
    )
  );

-- profiles: users read/update own profile only
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

GRANT SELECT, UPDATE ON profiles TO authenticated;
GRANT INSERT ON profiles TO authenticated;

GRANT SELECT ON churches TO authenticated;

GRANT SELECT, INSERT, UPDATE ON church_memberships TO authenticated;
GRANT SELECT, INSERT, UPDATE ON church_invitations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON campuses TO authenticated;
GRANT SELECT, INSERT ON audit_logs TO authenticated;

-- Explicitly no DELETE grant on audit_logs for authenticated
REVOKE DELETE ON audit_logs FROM authenticated;
REVOKE UPDATE ON audit_logs FROM authenticated;

-- ---------------------------------------------------------------------------
-- Notes for operators
-- ---------------------------------------------------------------------------
-- 1. Invitation tokens: generate a high-entropy token in the app, store only
--    digest(token, 'sha256') (or equivalent) in token_hash. Never persist the
--    raw token.
-- 2. Reject invitations where expires_at < now(), accepted_at IS NOT NULL,
--    or revoked_at IS NOT NULL.
-- 3. After applying, update application code to resolve church context from
--    church_memberships (not profiles.church_id).
-- 4. Seed / bootstrap an owner membership manually if needed:
--
-- INSERT INTO church_memberships (church_id, user_id, role, status, joined_at)
-- VALUES (
--   '00000000-0000-4000-8000-000000000001',
--   'YOUR_USER_ID',
--   'owner',
--   'active',
--   now()
-- );
