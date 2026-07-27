-- =============================================================================
-- 060_user_permissions.sql
-- Direct user permissions: grant/deny permissions to individuals with scope.
-- Additive / non-destructive. Safe to re-run.
--
-- Architecture:
--   user_permissions links users → permissions with scoping and temporal dates
--   Provides exceptions to role/group-based access
--
-- Permission effect:
--   'grant' — allows access
--   'deny' — explicitly blocks access (overrides group/role grants)
--
-- Status:
--   'active' — currently valid
--   'scheduled' — future-dated (not yet active)
--   'expired' — past expiration
--   'revoked' — manually revoked
--
-- Scope types (same as security_group_permissions):
--   'all_current_future_campuses', 'all_current_campuses', 'selected_campuses',
--   'primary_campus', 'no_restriction'
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enums (already defined in 059, but restated for clarity)
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.user_permission_status AS ENUM (
    'active',
    'scheduled',
    'expired',
    'revoked'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- user_permissions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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
  
  -- Status tracking
  status public.user_permission_status NOT NULL DEFAULT 'active',
  
  -- Audit
  assigned_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  assigned_at timestamp with time zone NOT NULL DEFAULT now(),
  revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at timestamp with time zone,
  reason text,
  notes text,
  
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

-- Unique constraint: only one active grant per user per permission per scope
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_permissions_active_grant
  ON public.user_permissions(user_id, permission_definition_id, scope_type, campus_id, resource_type, resource_id)
  WHERE permission_effect = 'grant'::public.permission_effect AND status != 'revoked'::public.user_permission_status;

CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id 
  ON public.user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_church_id 
  ON public.user_permissions(church_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_status 
  ON public.user_permissions(status);
CREATE INDEX IF NOT EXISTS idx_user_permissions_permission_id 
  ON public.user_permissions(permission_definition_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_expires_at 
  ON public.user_permissions(expires_at) WHERE expires_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Trigger to sync expiration status
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.user_permissions_sync_expiry_status()
RETURNS TRIGGER AS $$
BEGIN
  -- If expires_at is being set and is in the past, mark as expired
  IF NEW.expires_at IS NOT NULL AND NEW.expires_at <= now() THEN
    NEW.status := 'expired'::public.user_permission_status;
  -- If effective_at is in the future, mark as scheduled
  ELSIF NEW.effective_at IS NOT NULL AND NEW.effective_at > now() THEN
    NEW.status := 'scheduled'::public.user_permission_status;
  -- Otherwise active (unless already revoked)
  ELSIF NEW.status IS NULL OR NEW.status = 'active'::public.user_permission_status THEN
    NEW.status := 'active'::public.user_permission_status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_permissions_sync_expiry_status ON public.user_permissions;
CREATE TRIGGER user_permissions_sync_expiry_status
  BEFORE INSERT OR UPDATE ON public.user_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.user_permissions_sync_expiry_status();

-- ---------------------------------------------------------------------------
-- RLS Policies
-- ---------------------------------------------------------------------------

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_permissions_authenticated" ON public.user_permissions
  FOR SELECT
  USING (auth.role() = 'authenticated'::text);

CREATE POLICY "user_permissions_admin_insert" ON public.user_permissions
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated'::text);

CREATE POLICY "user_permissions_admin_update" ON public.user_permissions
  FOR UPDATE
  USING (auth.role() = 'authenticated'::text)
  WITH CHECK (auth.role() = 'authenticated'::text);

CREATE POLICY "user_permissions_admin_delete" ON public.user_permissions
  FOR DELETE
  USING (auth.role() = 'authenticated'::text);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_permissions TO authenticated;
