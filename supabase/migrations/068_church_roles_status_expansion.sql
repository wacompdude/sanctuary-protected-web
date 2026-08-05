-- =============================================================================
-- 068_church_roles_status_expansion.sql
-- Phase 2: expand church roles + membership status; secondary roles junction.
-- Additive / backward compatible. Safe to re-run where guarded.
--
-- Decisions (see DESIGN_ROLES_PHASE_2.md):
--   * Campus Admin / Campus Security Leader stay on campus_memberships.campus_role
--   * church_memberships.role remains synced primary for RLS compatibility
--   * Secondary roles live in church_membership_roles
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extend membership_role
-- ---------------------------------------------------------------------------

ALTER TYPE public.membership_role ADD VALUE IF NOT EXISTS 'training_coordinator';
ALTER TYPE public.membership_role ADD VALUE IF NOT EXISTS 'medical_coordinator';
ALTER TYPE public.membership_role ADD VALUE IF NOT EXISTS 'hardware_manager';
ALTER TYPE public.membership_role ADD VALUE IF NOT EXISTS 'event_coordinator';
ALTER TYPE public.membership_role ADD VALUE IF NOT EXISTS 'pastor';

-- ---------------------------------------------------------------------------
-- 2. Extend membership_status
-- ---------------------------------------------------------------------------

ALTER TYPE public.membership_status ADD VALUE IF NOT EXISTS 'inactive';
ALTER TYPE public.membership_status ADD VALUE IF NOT EXISTS 'pending_approval';
ALTER TYPE public.membership_status ADD VALUE IF NOT EXISTS 'on_leave';
ALTER TYPE public.membership_status ADD VALUE IF NOT EXISTS 'archived';

-- ---------------------------------------------------------------------------
-- 3. Rank helper (specialists below security_member)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.membership_role_rank(p_role text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_role
    WHEN 'viewer' THEN 10
    WHEN 'pastor' THEN 10
    WHEN 'event_coordinator' THEN 15
    WHEN 'training_coordinator' THEN 16
    WHEN 'medical_coordinator' THEN 16
    WHEN 'hardware_manager' THEN 16
    WHEN 'security_member' THEN 20
    WHEN 'security_leader' THEN 30
    WHEN 'administrator' THEN 40
    WHEN 'co_owner' THEN 50
    WHEN 'owner' THEN 50
    ELSE 0
  END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Status eligibility helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.membership_status_allows_login(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_status = 'active';
$$;

CREATE OR REPLACE FUNCTION public.membership_status_allows_assignment(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_status IN ('active', 'on_leave');
$$;

REVOKE ALL ON FUNCTION public.membership_status_allows_login(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.membership_status_allows_assignment(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.membership_status_allows_login(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.membership_status_allows_assignment(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.membership_status_allows_login(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.membership_status_allows_assignment(text) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. church_membership_roles junction
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.church_membership_role_status AS ENUM (
    'active',
    'removed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.church_membership_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  church_membership_id uuid NOT NULL REFERENCES public.church_memberships(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.membership_role NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  status public.church_membership_role_status NOT NULL
    DEFAULT 'active'::public.church_membership_role_status,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at timestamp with time zone NOT NULL DEFAULT now(),
  removed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  removed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS church_membership_roles_one_primary_idx
  ON public.church_membership_roles (church_membership_id)
  WHERE is_primary AND status = 'active'::public.church_membership_role_status;

CREATE UNIQUE INDEX IF NOT EXISTS church_membership_roles_unique_active_role_idx
  ON public.church_membership_roles (church_membership_id, role)
  WHERE status = 'active'::public.church_membership_role_status;

CREATE INDEX IF NOT EXISTS church_membership_roles_church_user_idx
  ON public.church_membership_roles (church_id, user_id)
  WHERE status = 'active'::public.church_membership_role_status;

CREATE INDEX IF NOT EXISTS church_membership_roles_membership_idx
  ON public.church_membership_roles (church_membership_id);

COMMENT ON TABLE public.church_membership_roles IS
  'Primary + secondary church roles per membership. church_memberships.role mirrors primary.';

-- ---------------------------------------------------------------------------
-- 6. Sync triggers (primary ↔ memberships.role)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_primary_role_from_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists boolean;
BEGIN
  -- Soft guard against recursive updates from junction → memberships.
  IF TG_OP = 'UPDATE'
     AND NEW.role IS NOT DISTINCT FROM OLD.role
     AND NEW.church_id IS NOT DISTINCT FROM OLD.church_id
     AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id THEN
    RETURN NEW;
  END IF;

  -- Demote any other active primary for this membership.
  UPDATE public.church_membership_roles cmr
  SET
    is_primary = false,
    updated_at = now()
  WHERE cmr.church_membership_id = NEW.id
    AND cmr.status = 'active'::public.church_membership_role_status
    AND cmr.is_primary = true
    AND cmr.role IS DISTINCT FROM NEW.role;

  SELECT EXISTS (
    SELECT 1
    FROM public.church_membership_roles cmr
    WHERE cmr.church_membership_id = NEW.id
      AND cmr.role = NEW.role
      AND cmr.status = 'active'::public.church_membership_role_status
  )
  INTO v_exists;

  IF v_exists THEN
    UPDATE public.church_membership_roles cmr
    SET
      is_primary = true,
      church_id = NEW.church_id,
      user_id = NEW.user_id,
      removed_at = NULL,
      removed_by = NULL,
      updated_at = now()
    WHERE cmr.church_membership_id = NEW.id
      AND cmr.role = NEW.role
      AND cmr.status = 'active'::public.church_membership_role_status;
  ELSE
    INSERT INTO public.church_membership_roles (
      church_id,
      church_membership_id,
      user_id,
      role,
      is_primary,
      status,
      assigned_at
    )
    VALUES (
      NEW.church_id,
      NEW.id,
      NEW.user_id,
      NEW.role,
      true,
      'active'::public.church_membership_role_status,
      COALESCE(NEW.joined_at, NEW.created_at, now())
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_primary_role_from_membership ON public.church_memberships;
CREATE TRIGGER trg_sync_primary_role_from_membership
  AFTER INSERT OR UPDATE OF role, church_id, user_id
  ON public.church_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_primary_role_from_membership();

CREATE OR REPLACE FUNCTION public.sync_membership_role_from_primary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_primary
     AND NEW.status = 'active'::public.church_membership_role_status THEN
    UPDATE public.church_memberships m
    SET role = NEW.role
    WHERE m.id = NEW.church_membership_id
      AND m.role IS DISTINCT FROM NEW.role;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_membership_role_from_primary ON public.church_membership_roles;
CREATE TRIGGER trg_sync_membership_role_from_primary
  AFTER INSERT OR UPDATE OF role, is_primary, status
  ON public.church_membership_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_membership_role_from_primary();

-- ---------------------------------------------------------------------------
-- 7. Backfill primary role rows
-- ---------------------------------------------------------------------------

INSERT INTO public.church_membership_roles (
  church_id,
  church_membership_id,
  user_id,
  role,
  is_primary,
  status,
  assigned_at
)
SELECT
  m.church_id,
  m.id,
  m.user_id,
  m.role,
  true,
  'active'::public.church_membership_role_status,
  COALESCE(m.joined_at, m.created_at, now())
FROM public.church_memberships m
WHERE NOT EXISTS (
  SELECT 1
  FROM public.church_membership_roles cmr
  WHERE cmr.church_membership_id = m.id
    AND cmr.is_primary = true
    AND cmr.status = 'active'::public.church_membership_role_status
);

-- ---------------------------------------------------------------------------
-- 8. RLS (match existing security table posture; app enforces church scope)
-- ---------------------------------------------------------------------------

ALTER TABLE public.church_membership_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS church_membership_roles_select ON public.church_membership_roles;
DROP POLICY IF EXISTS church_membership_roles_write ON public.church_membership_roles;

CREATE POLICY church_membership_roles_select
  ON public.church_membership_roles
  FOR SELECT
  TO authenticated
  USING (
    public.is_active_church_member(church_id)
    OR user_id = auth.uid()
  );

CREATE POLICY church_membership_roles_write
  ON public.church_membership_roles
  FOR ALL
  TO authenticated
  USING (
    public.has_church_role(
      church_id,
      ARRAY['owner', 'co_owner', 'administrator']::text[]
    )
  )
  WITH CHECK (
    public.has_church_role(
      church_id,
      ARRAY['owner', 'co_owner', 'administrator']::text[]
    )
  );

-- ---------------------------------------------------------------------------
-- 9. Audit event types for role / status / campus assignment
-- ---------------------------------------------------------------------------

ALTER TYPE public.security_audit_event_type ADD VALUE IF NOT EXISTS 'role.created';
ALTER TYPE public.security_audit_event_type ADD VALUE IF NOT EXISTS 'role.updated';
ALTER TYPE public.security_audit_event_type ADD VALUE IF NOT EXISTS 'role.deactivated';
ALTER TYPE public.security_audit_event_type ADD VALUE IF NOT EXISTS 'membership_role.assigned';
ALTER TYPE public.security_audit_event_type ADD VALUE IF NOT EXISTS 'membership_role.removed';
ALTER TYPE public.security_audit_event_type ADD VALUE IF NOT EXISTS 'membership_role.primary_changed';
ALTER TYPE public.security_audit_event_type ADD VALUE IF NOT EXISTS 'membership.status_changed';
ALTER TYPE public.security_audit_event_type ADD VALUE IF NOT EXISTS 'campus_assignment.changed';
ALTER TYPE public.security_audit_event_type ADD VALUE IF NOT EXISTS 'permission_override.changed';
