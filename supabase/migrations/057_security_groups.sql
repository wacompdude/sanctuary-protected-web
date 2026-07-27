-- =============================================================================
-- 057_security_groups.sql
-- Security groups and group membership tables for group-based access control.
-- Additive / non-destructive. Safe to re-run.
-- 
-- Architecture:
--   security_groups — group definitions with name, description, status
--   security_group_members — user ↔ group membership with temporal scope
--
-- Temporal scope:
--   effective_at / expires_at allow time-based group assignments
--   Groups and members have independent temporal scopes (can overlap)
--
-- Uniqueness:
--   Group names must be unique per church (only for active groups)
--   User ↔ group is unique (only one active membership per user per group)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.security_group_status AS ENUM (
    'active',
    'inactive'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.security_group_member_status AS ENUM (
    'active',
    'expired',
    'revoked'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- security_groups
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.security_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status public.security_group_status NOT NULL DEFAULT 'active',
  
  -- Temporal scope (optional; applies to all members/permissions in the group)
  effective_at timestamp with time zone,
  expires_at timestamp with time zone,
  
  -- System template flag
  system_template boolean NOT NULL DEFAULT false,
  
  -- Audit
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  
  -- Metadata
  notes text,
  
  -- Temporal validity check
  CHECK (effective_at IS NULL OR expires_at IS NULL OR effective_at <= expires_at)
);

-- Unique constraint on active group names per church (use unique index with WHERE)
CREATE UNIQUE INDEX IF NOT EXISTS idx_security_groups_church_name_active
  ON public.security_groups(church_id, name)
  WHERE status = 'active'::public.security_group_status;

CREATE INDEX IF NOT EXISTS idx_security_groups_church_id ON public.security_groups(church_id);
CREATE INDEX IF NOT EXISTS idx_security_groups_status ON public.security_groups(status);
CREATE INDEX IF NOT EXISTS idx_security_groups_system_template ON public.security_groups(system_template) WHERE system_template = true;

-- ---------------------------------------------------------------------------
-- security_group_members
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.security_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  security_group_id uuid NOT NULL REFERENCES public.security_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Temporal scope (optional; specific to this membership)
  effective_at timestamp with time zone,
  expires_at timestamp with time zone,
  
  -- Status tracking
  status public.security_group_member_status NOT NULL DEFAULT 'active',
  
  -- Audit
  assigned_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  assigned_at timestamp with time zone NOT NULL DEFAULT now(),
  removed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  removed_at timestamp with time zone,
  
  -- Temporal validity check
  CHECK (effective_at IS NULL OR expires_at IS NULL OR effective_at <= expires_at)
);

-- One active membership per user per group (unique index with WHERE)
CREATE UNIQUE INDEX IF NOT EXISTS idx_security_group_members_active
  ON public.security_group_members(security_group_id, user_id)
  WHERE status = 'active'::public.security_group_member_status;

CREATE INDEX IF NOT EXISTS idx_security_group_members_user_id ON public.security_group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_security_group_members_group_id ON public.security_group_members(security_group_id);
CREATE INDEX IF NOT EXISTS idx_security_group_members_status ON public.security_group_members(status);

-- ---------------------------------------------------------------------------
-- Triggers for audit updates
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.security_groups_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS security_groups_updated_at ON public.security_groups;
CREATE TRIGGER security_groups_updated_at
  BEFORE UPDATE ON public.security_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.security_groups_updated_at();

-- ---------------------------------------------------------------------------
-- RLS Policies
-- ---------------------------------------------------------------------------

-- Only authenticated users can access security tables
-- Access control is enforced via church membership (via RLS in other contexts)

ALTER TABLE public.security_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_group_members ENABLE ROW LEVEL SECURITY;

-- security_groups: users can read/write their church's groups (via app-layer auth check)
-- For now, no RLS-level user granularity; app layer enforces role (admin+)
CREATE POLICY "security_groups_authenticated" ON public.security_groups
  FOR SELECT
  USING (auth.role() = 'authenticated'::text);

CREATE POLICY "security_groups_admin_insert" ON public.security_groups
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated'::text);

CREATE POLICY "security_groups_admin_update" ON public.security_groups
  FOR UPDATE
  USING (auth.role() = 'authenticated'::text)
  WITH CHECK (auth.role() = 'authenticated'::text);

CREATE POLICY "security_groups_admin_delete" ON public.security_groups
  FOR DELETE
  USING (auth.role() = 'authenticated'::text);

-- security_group_members: similar RLS (app layer controls access)
CREATE POLICY "security_group_members_authenticated" ON public.security_group_members
  FOR SELECT
  USING (auth.role() = 'authenticated'::text);

CREATE POLICY "security_group_members_admin_insert" ON public.security_group_members
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated'::text);

CREATE POLICY "security_group_members_admin_update" ON public.security_group_members
  FOR UPDATE
  USING (auth.role() = 'authenticated'::text)
  WITH CHECK (auth.role() = 'authenticated'::text);

CREATE POLICY "security_group_members_admin_delete" ON public.security_group_members
  FOR DELETE
  USING (auth.role() = 'authenticated'::text);

-- =============================================================================
-- Grants
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_group_members TO authenticated;
