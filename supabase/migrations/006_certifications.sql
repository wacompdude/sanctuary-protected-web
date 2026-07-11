-- Certification tracking + team members + app roles
-- Safe to re-run: repairs an existing certifications table that lacks team_member_id.

-- App roles on profiles
DO $$ BEGIN
  CREATE TYPE app_role AS ENUM ('member', 'administrator', 'security_leader');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS role app_role NOT NULL DEFAULT 'member';

-- Team members
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL REFERENCES churches (id) ON DELETE RESTRICT,
  full_name TEXT NOT NULL,
  email TEXT,
  title TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE team_members ADD COLUMN IF NOT EXISTS church_id UUID;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS team_members_church_id_idx ON team_members (church_id);

-- Certifications (create if missing)
CREATE TABLE IF NOT EXISTS certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID REFERENCES churches (id) ON DELETE RESTRICT,
  team_member_id UUID REFERENCES team_members (id) ON DELETE RESTRICT,
  certification_type TEXT,
  issuer TEXT,
  issue_date DATE,
  expiration_date DATE,
  certificate_number TEXT,
  created_by UUID REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Repair existing certifications table columns
ALTER TABLE certifications ADD COLUMN IF NOT EXISTS church_id UUID;
ALTER TABLE certifications ADD COLUMN IF NOT EXISTS team_member_id UUID;
ALTER TABLE certifications ADD COLUMN IF NOT EXISTS certification_type TEXT;
ALTER TABLE certifications ADD COLUMN IF NOT EXISTS issuer TEXT;
ALTER TABLE certifications ADD COLUMN IF NOT EXISTS issue_date DATE;
ALTER TABLE certifications ADD COLUMN IF NOT EXISTS expiration_date DATE;
ALTER TABLE certifications ADD COLUMN IF NOT EXISTS certificate_number TEXT;
ALTER TABLE certifications ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE certifications ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE certifications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Map common legacy column names if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'certifications' AND column_name = 'name'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'certifications' AND column_name = 'certification_type'
  ) THEN
    EXECUTE 'UPDATE certifications SET certification_type = name WHERE certification_type IS NULL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'certifications' AND column_name = 'issued_at'
  ) THEN
    EXECUTE 'UPDATE certifications SET issue_date = issued_at::date WHERE issue_date IS NULL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'certifications' AND column_name = 'expires_at'
  ) THEN
    EXECUTE 'UPDATE certifications SET expiration_date = expires_at::date WHERE expiration_date IS NULL';
  END IF;
END $$;

-- Foreign keys (add only if missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'certifications_church_id_fkey'
  ) THEN
    ALTER TABLE certifications
    ADD CONSTRAINT certifications_church_id_fkey
    FOREIGN KEY (church_id) REFERENCES churches (id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'certifications_team_member_id_fkey'
  ) THEN
    ALTER TABLE certifications
    ADD CONSTRAINT certifications_team_member_id_fkey
    FOREIGN KEY (team_member_id) REFERENCES team_members (id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'certifications_dates_check'
  ) THEN
    ALTER TABLE certifications
    ADD CONSTRAINT certifications_dates_check
    CHECK (
      expiration_date IS NULL
      OR issue_date IS NULL
      OR expiration_date >= issue_date
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS certifications_church_id_idx ON certifications (church_id);
CREATE INDEX IF NOT EXISTS certifications_team_member_id_idx ON certifications (team_member_id);
CREATE INDEX IF NOT EXISTS certifications_expiration_date_idx ON certifications (expiration_date);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS team_members_updated_at ON team_members;
CREATE TRIGGER team_members_updated_at
  BEFORE UPDATE ON team_members
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS certifications_updated_at ON certifications;
CREATE TRIGGER certifications_updated_at
  BEFORE UPDATE ON certifications
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION public.user_app_role()
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.user_church_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT church_id FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.can_manage_certifications()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('administrator', 'security_leader')
  );
$$;

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE certifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view church team members" ON team_members;
CREATE POLICY "Users can view church team members"
  ON team_members FOR SELECT
  USING (church_id = public.user_church_id());

DROP POLICY IF EXISTS "Leaders can create team members" ON team_members;
CREATE POLICY "Leaders can create team members"
  ON team_members FOR INSERT
  WITH CHECK (
    church_id = public.user_church_id()
    AND public.can_manage_certifications()
  );

DROP POLICY IF EXISTS "Leaders can update team members" ON team_members;
CREATE POLICY "Leaders can update team members"
  ON team_members FOR UPDATE
  USING (
    church_id = public.user_church_id()
    AND public.can_manage_certifications()
  );

DROP POLICY IF EXISTS "Users can view church certifications" ON certifications;
CREATE POLICY "Users can view church certifications"
  ON certifications FOR SELECT
  USING (church_id = public.user_church_id());

DROP POLICY IF EXISTS "Leaders can create certifications" ON certifications;
CREATE POLICY "Leaders can create certifications"
  ON certifications FOR INSERT
  WITH CHECK (
    church_id = public.user_church_id()
    AND public.can_manage_certifications()
    AND created_by = auth.uid()
    AND team_member_id IN (
      SELECT id FROM team_members WHERE church_id = public.user_church_id()
    )
  );

DROP POLICY IF EXISTS "Leaders can update certifications" ON certifications;
CREATE POLICY "Leaders can update certifications"
  ON certifications FOR UPDATE
  USING (
    church_id = public.user_church_id()
    AND public.can_manage_certifications()
  );

GRANT USAGE ON TYPE app_role TO anon, authenticated;
GRANT SELECT ON team_members TO authenticated;
GRANT INSERT, UPDATE ON team_members TO authenticated;
GRANT SELECT ON certifications TO authenticated;
GRANT INSERT, UPDATE ON certifications TO authenticated;
