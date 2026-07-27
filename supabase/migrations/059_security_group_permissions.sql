-- =============================================================================
-- 059_security_group_permissions.sql
-- Security group permissions: grant/deny permissions to groups with scope.
-- Additive / non-destructive. Safe to re-run.
--
-- Architecture:
--   security_group_permissions links groups → permissions with scoping
--   Scope includes: campus, resource type/id, temporal (effective/expires)
--
-- Permission effect:
--   'grant' — allows access
--   'deny' — explicitly blocks access (overrides group/role grants)
--
-- Scope types:
--   'all_current_future_campuses' — all now and future campuses
--   'all_current_campuses' — all existing campuses only
--   'selected_campuses' — specific campuses (campus_id must be set)
--   'primary_campus' — user's primary campus
--   'no_restriction' — organization-wide (campuses not applicable)
--
-- Temporal scope:
--   effective_at / expires_at make the permission active only during that period
--   NULL means unbounded (always active or never expires)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.permission_effect AS ENUM (
    'grant',
    'deny'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.permission_scope_type AS ENUM (
    'all_current_future_campuses',
    'all_current_campuses',
    'selected_campuses',
    'primary_campus',
    'no_restriction'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- security_group_permissions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.security_group_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  security_group_id uuid NOT NULL REFERENCES public.security_groups(id) ON DELETE CASCADE,
  permission_definition_id uuid NOT NULL REFERENCES public.permission_definitions(id) ON DELETE RESTRICT,
  
  -- Permission state
  permission_effect public.permission_effect NOT NULL DEFAULT 'grant',
  
  -- Scope
  scope_type public.permission_scope_type NOT NULL DEFAULT 'all_current_future_campuses',
  campus_id uuid REFERENCES public.campuses(id) ON DELETE SET NULL,
  resource_type text,
  resource_id text,
  
  -- Temporal scope (optional)
  effective_at timestamp with time zone,
  expires_at timestamp with time zone,
  
  -- Audit
  assigned_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  assigned_at timestamp with time zone NOT NULL DEFAULT now(),
  reason text,
  
  -- Uniqueness (only one grant/deny per permission per group per scope)
  UNIQUE (security_group_id, permission_definition_id, scope_type, campus_id, resource_type, resource_id),
  
  -- Temporal validity check
  CHECK (effective_at IS NULL OR expires_at IS NULL OR effective_at <= expires_at),
  
  -- Campus only meaningful for campus-scoped types
  CHECK (
    CASE
      WHEN scope_type = 'selected_campuses'::public.permission_scope_type THEN campus_id IS NOT NULL
      WHEN scope_type IN ('primary_campus'::public.permission_scope_type, 
                          'all_current_campuses'::public.permission_scope_type,
                          'all_current_future_campuses'::public.permission_scope_type,
                          'no_restriction'::public.permission_scope_type) THEN campus_id IS NULL
      ELSE true
    END
  )
);

CREATE INDEX IF NOT EXISTS idx_security_group_permissions_group_id 
  ON public.security_group_permissions(security_group_id);
CREATE INDEX IF NOT EXISTS idx_security_group_permissions_permission_id 
  ON public.security_group_permissions(permission_definition_id);
CREATE INDEX IF NOT EXISTS idx_security_group_permissions_campus_id 
  ON public.security_group_permissions(campus_id);

-- ---------------------------------------------------------------------------
-- RLS Policies
-- ---------------------------------------------------------------------------

ALTER TABLE public.security_group_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "security_group_permissions_authenticated" ON public.security_group_permissions
  FOR SELECT
  USING (auth.role() = 'authenticated'::text);

CREATE POLICY "security_group_permissions_admin_insert" ON public.security_group_permissions
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated'::text);

CREATE POLICY "security_group_permissions_admin_update" ON public.security_group_permissions
  FOR UPDATE
  USING (auth.role() = 'authenticated'::text)
  WITH CHECK (auth.role() = 'authenticated'::text);

CREATE POLICY "security_group_permissions_admin_delete" ON public.security_group_permissions
  FOR DELETE
  USING (auth.role() = 'authenticated'::text);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_group_permissions TO authenticated;
