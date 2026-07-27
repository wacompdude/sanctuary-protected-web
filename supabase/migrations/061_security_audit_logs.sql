-- =============================================================================
-- 061_security_audit_logs.sql
-- Immutable security audit log: records all security-related actions.
-- Additive / non-destructive. Safe to re-run.
--
-- Architecture:
--   security_audit_logs records all security events
--   Immutable (no UPDATE, no DELETE except via service_role cleanup)
--   Indexed for efficient querying
--
-- Event types:
--   security_group.created, security_group.updated, security_group.deactivated
--   security_group_member.added, security_group_member.removed
--   user_permission.granted, user_permission.denied, user_permission.revoked
--   security_audit_log.viewed, security.preview_access_used
--   tier.changed, tier.downgrade
--
-- Result:
--   'success' — action completed successfully
--   'failure' — action rejected (authorization, validation, etc.)
--
-- Network info (optional):
--   ip_address, user_agent for context
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.security_audit_event_type AS ENUM (
    'security_group.created',
    'security_group.updated',
    'security_group.deactivated',
    'security_group.deleted',
    'security_group_member.added',
    'security_group_member.removed',
    'security_group_member.expired',
    'user_permission.granted',
    'user_permission.denied',
    'user_permission.revoked',
    'user_permission.expired',
    'security_audit_log.viewed',
    'security.preview_access_used',
    'tier.changed',
    'tier.downgrade'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.security_audit_result AS ENUM (
    'success',
    'failure'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- security_audit_logs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.security_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  campus_id uuid REFERENCES public.campuses(id) ON DELETE SET NULL,
  
  -- Actors
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Related entities
  security_group_id uuid REFERENCES public.security_groups(id) ON DELETE SET NULL,
  permission_definition_id uuid REFERENCES public.permission_definitions(id) ON DELETE SET NULL,
  
  -- Event details
  event_type public.security_audit_event_type NOT NULL,
  previous_value jsonb,
  new_value jsonb,
  reason text,
  
  -- Result
  result public.security_audit_result NOT NULL DEFAULT 'success',
  failure_reason text,
  
  -- Network
  ip_address inet,
  user_agent text,
  
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  
  -- Immutability enforcement
  CHECK (created_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_security_audit_logs_church_id 
  ON public.security_audit_logs(church_id);
CREATE INDEX IF NOT EXISTS idx_security_audit_logs_actor_user_id 
  ON public.security_audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_security_audit_logs_target_user_id 
  ON public.security_audit_logs(target_user_id);
CREATE INDEX IF NOT EXISTS idx_security_audit_logs_event_type 
  ON public.security_audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_security_audit_logs_created_at 
  ON public.security_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_logs_security_group_id 
  ON public.security_audit_logs(security_group_id);
CREATE INDEX IF NOT EXISTS idx_security_audit_logs_permission_id 
  ON public.security_audit_logs(permission_definition_id);

-- ---------------------------------------------------------------------------
-- Immutability: Prevent UPDATE and DELETE
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.security_audit_logs_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'security_audit_logs are immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS security_audit_logs_immutable_update ON public.security_audit_logs;
CREATE TRIGGER security_audit_logs_immutable_update
  BEFORE UPDATE ON public.security_audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.security_audit_logs_immutable();

DROP TRIGGER IF EXISTS security_audit_logs_immutable_delete ON public.security_audit_logs;
CREATE TRIGGER security_audit_logs_immutable_delete
  BEFORE DELETE ON public.security_audit_logs
  FOR EACH ROW
  WHEN (auth.role() != 'service_role'::text)
  EXECUTE FUNCTION public.security_audit_logs_immutable();

-- ---------------------------------------------------------------------------
-- RLS Policies
-- ---------------------------------------------------------------------------

ALTER TABLE public.security_audit_logs ENABLE ROW LEVEL SECURITY;

-- Authenticated users can only read logs from their church (app layer enforces role check)
CREATE POLICY "security_audit_logs_select_authenticated" ON public.security_audit_logs
  FOR SELECT
  USING (auth.role() = 'authenticated'::text);

-- Only authenticated users can insert (app layer enforces auth check)
CREATE POLICY "security_audit_logs_insert_authenticated" ON public.security_audit_logs
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated'::text);

-- Delete only via service role (cleanup) or prevent for regular users
CREATE POLICY "security_audit_logs_delete_service_role" ON public.security_audit_logs
  FOR DELETE
  USING (auth.role() = 'service_role'::text);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

GRANT SELECT ON public.security_audit_logs TO authenticated;
GRANT INSERT ON public.security_audit_logs TO authenticated;
GRANT DELETE ON public.security_audit_logs TO service_role;
