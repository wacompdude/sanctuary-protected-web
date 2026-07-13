-- =============================================================================
-- 009b_replace_profile_church_policies.sql
-- Run this after 009 failed on DROP COLUMN profiles.church_id.
-- Replaces legacy policies that reference profiles.church_id, then drops the
-- column. Safe to re-run.
-- =============================================================================

-- Ensure church status enum + column exist (may be missing after a partial 009)
DO $$ BEGIN
  CREATE TYPE public.church_status AS ENUM ('trial', 'active', 'suspended', 'closed');
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

ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS status public.church_status;

UPDATE public.churches
SET status = COALESCE(status, 'trial'::public.church_status)
WHERE status IS NULL;

ALTER TABLE public.churches
  ALTER COLUMN status SET DEFAULT 'trial'::public.church_status;

DO $$
BEGIN
  ALTER TABLE public.churches ALTER COLUMN status SET NOT NULL;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'churches.status NOT NULL skipped: %', SQLERRM;
END $$;

-- Ensure church_memberships has the columns helpers/policies expect
ALTER TABLE public.church_memberships ADD COLUMN IF NOT EXISTS church_id UUID;
ALTER TABLE public.church_memberships ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.church_memberships ADD COLUMN IF NOT EXISTS role public.membership_role;
ALTER TABLE public.church_memberships ADD COLUMN IF NOT EXISTS status public.membership_status;
ALTER TABLE public.church_memberships ADD COLUMN IF NOT EXISTS invited_by UUID;
ALTER TABLE public.church_memberships ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ;
ALTER TABLE public.church_memberships ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE public.church_memberships ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE public.church_memberships
SET
  status = COALESCE(status, 'active'::public.membership_status),
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, now()),
  joined_at = COALESCE(joined_at, created_at, now())
WHERE status IS NULL
   OR created_at IS NULL
   OR updated_at IS NULL
   OR joined_at IS NULL;

-- Ensure membership helpers exist (no-op if 009 already created them)
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
-- Replace policies that depend on profiles.church_id
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

-- Also align cert/team/event policies to membership helper (they used user_church_id())
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
-- Now safe to drop profiles.church_id / profiles.role
-- ---------------------------------------------------------------------------

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_church_id_fkey;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'church_id'
  ) THEN
    ALTER TABLE profiles DROP COLUMN church_id;
  END IF;
END $$;

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

-- Profile policies (identity only)
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

-- Verify
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
ORDER BY ordinal_position;
