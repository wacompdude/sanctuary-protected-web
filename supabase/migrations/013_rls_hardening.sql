-- =============================================================================
-- 013_rls_hardening.sql
-- Phase 7 — Row Level Security hardening for multi-tenant church context
--
-- Approved for apply. Safe to re-run (DROP POLICY IF EXISTS / CREATE OR REPLACE).
--
-- Goals:
--   - Canonical helpers: is_active_church_member(), has_church_role()
--   - Tenant isolation (Church A cannot see Church B)
--   - Suspended / removed members cannot access church-scoped data
--   - Membership management restricted; no self-escalation / self-status edits
--   - Security leaders cannot assign owner
--   - Last active owner cannot be removed / demoted
--   - Audit logs append-only for authenticated clients
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Prerequisites: ensure tables that may be missing from a partial 009 apply
-- ---------------------------------------------------------------------------

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

DO $$ BEGIN
  CREATE TYPE public.church_status AS ENUM ('trial', 'active', 'suspended', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- church_invitations was defined in 009 but may be missing after a partial apply
CREATE TABLE IF NOT EXISTS public.church_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role public.membership_role NOT NULL,
  token_hash TEXT NOT NULL,
  invited_by UUID NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_invitations_token_hash_key UNIQUE (token_hash),
  CONSTRAINT church_invitations_role_not_owner_check CHECK (role::text <> 'owner'),
  CONSTRAINT church_invitations_terminal_state_check CHECK (
    NOT (accepted_at IS NOT NULL AND revoked_at IS NOT NULL)
  ),
  CONSTRAINT church_invitations_email_nonempty_check CHECK (length(trim(email)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS church_invitations_pending_church_email_idx
  ON public.church_invitations (church_id, lower(email))
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS church_invitations_church_id_idx
  ON public.church_invitations (church_id);

CREATE INDEX IF NOT EXISTS church_invitations_email_idx
  ON public.church_invitations (lower(email));

CREATE INDEX IF NOT EXISTS church_invitations_expires_at_idx
  ON public.church_invitations (expires_at);

-- Campuses / audit_logs may already exist via 012; keep IF NOT EXISTS for safety
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT audit_logs_action_nonempty_check CHECK (length(trim(action)) > 0)
);

CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs are append-only';
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_no_update ON public.audit_logs;
CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_log_mutation();

DROP TRIGGER IF EXISTS audit_logs_no_delete ON public.audit_logs;
CREATE TRIGGER audit_logs_no_delete
  BEFORE DELETE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_log_mutation();

-- ---------------------------------------------------------------------------
-- Helper: role rank (for escalation checks)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.membership_role_rank(p_role text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_role
    WHEN 'owner' THEN 50
    WHEN 'administrator' THEN 40
    WHEN 'security_leader' THEN 30
    WHEN 'security_member' THEN 20
    WHEN 'viewer' THEN 10
    ELSE 0
  END;
$$;

-- ---------------------------------------------------------------------------
-- is_active_church_member(requested_church_id uuid)
-- SECURITY DEFINER required so policies on church_memberships / churches can
-- call this without recursive RLS evaluation.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_active_church_member(requested_church_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.church_memberships m
    JOIN public.churches c ON c.id = m.church_id
    WHERE m.user_id = auth.uid()
      AND m.church_id = requested_church_id
      AND m.status = 'active'::public.membership_status
      AND c.status IN (
        'trial'::public.church_status,
        'active'::public.church_status
      )
  );
$$;

-- Keep prior name as a thin alias for existing operational policies.
CREATE OR REPLACE FUNCTION public.has_active_church_membership(p_church_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_active_church_member(p_church_id);
$$;

-- ---------------------------------------------------------------------------
-- has_church_role(requested_church_id uuid, permitted_roles text[])
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.has_church_role(
  requested_church_id uuid,
  permitted_roles text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.church_memberships m
    JOIN public.churches c ON c.id = m.church_id
    WHERE m.user_id = auth.uid()
      AND m.church_id = requested_church_id
      AND m.status = 'active'::public.membership_status
      AND c.status IN (
        'trial'::public.church_status,
        'active'::public.church_status
      )
      AND m.role::text = ANY (permitted_roles)
  );
$$;

-- Convenience: who may manage memberships / invitations (not security_member/viewer)
CREATE OR REPLACE FUNCTION public.can_manage_memberships(requested_church_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_church_role(
    requested_church_id,
    ARRAY['owner', 'administrator', 'security_leader']
  );
$$;

-- Who may change church settings (name, contact, address, etc.)
CREATE OR REPLACE FUNCTION public.can_manage_church_settings(requested_church_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_church_role(
    requested_church_id,
    ARRAY['owner', 'administrator']
  );
$$;

-- Align cert helper with has_church_role (same leadership set)
CREATE OR REPLACE FUNCTION public.can_manage_certifications_for_church(p_church_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_church_role(
    p_church_id,
    ARRAY['owner', 'administrator', 'security_leader']
  );
$$;

REVOKE ALL ON FUNCTION public.membership_role_rank(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_active_church_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_active_church_membership(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_church_role(uuid, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_memberships(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_church_settings(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_certifications_for_church(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.membership_role_rank(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_church_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_church_membership(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_church_role(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_memberships(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_church_settings(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_certifications_for_church(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Membership mutation guard (trigger)
-- Enforces rules that are awkward / unsafe to express only in RLS:
--   - no self role escalation
--   - no self status / role changes (managers edit others' rows)
--   - only owners may assign / keep role = owner
--   - security leaders cannot assign owner
--   - last active owner cannot be demoted / suspended / removed
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_membership_mutation_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_active_owners integer;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: membership changes require a signed-in user';
  END IF;

  SELECT m.role::text
  INTO v_actor_role
  FROM public.church_memberships m
  WHERE m.user_id = v_actor
    AND m.church_id = COALESCE(NEW.church_id, OLD.church_id)
    AND m.status = 'active'::public.membership_status
  LIMIT 1;

  -- INSERT ---------------------------------------------------------------
  IF TG_OP = 'INSERT' THEN
    -- Bootstrap path used by create_church_with_owner(): first active owner
    -- for a brand-new church (no prior memberships).
    IF NEW.user_id = v_actor
       AND NEW.role::text = 'owner'
       AND NEW.status = 'active'::public.membership_status
       AND NOT EXISTS (
         SELECT 1
         FROM public.church_memberships m
         WHERE m.church_id = NEW.church_id
       ) THEN
      RETURN NEW;
    END IF;

    IF NOT public.can_manage_memberships(NEW.church_id) THEN
      RAISE EXCEPTION 'FORBIDDEN: cannot create memberships for this church';
    END IF;

    IF NEW.user_id = v_actor THEN
      RAISE EXCEPTION 'FORBIDDEN: cannot create your own membership row';
    END IF;

    IF NEW.role::text = 'owner' AND v_actor_role IS DISTINCT FROM 'owner' THEN
      RAISE EXCEPTION 'FORBIDDEN: only an owner can assign the owner role';
    END IF;

    IF v_actor_role = 'security_leader'
       AND public.membership_role_rank(NEW.role::text) >= public.membership_role_rank('security_leader') THEN
      RAISE EXCEPTION 'FORBIDDEN: security leaders may only assign security_member or viewer';
    END IF;

    RETURN NEW;
  END IF;

  -- UPDATE ---------------------------------------------------------------
  IF TG_OP = 'UPDATE' THEN
    IF NOT public.can_manage_memberships(OLD.church_id) THEN
      RAISE EXCEPTION 'FORBIDDEN: cannot update memberships for this church';
    END IF;

    -- Never allow changing church_id / user_id linkage
    IF NEW.church_id IS DISTINCT FROM OLD.church_id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'FORBIDDEN: cannot reassign membership identity fields';
    END IF;

    -- Prevent users from changing their own role or status
    IF OLD.user_id = v_actor
       AND (
         NEW.role IS DISTINCT FROM OLD.role
         OR NEW.status IS DISTINCT FROM OLD.status
       ) THEN
      RAISE EXCEPTION 'FORBIDDEN: cannot change your own membership role or status';
    END IF;

    -- Prevent self role escalation even if somehow bypassed above
    IF OLD.user_id = v_actor
       AND public.membership_role_rank(NEW.role::text)
         > public.membership_role_rank(OLD.role::text) THEN
      RAISE EXCEPTION 'FORBIDDEN: cannot escalate your own role';
    END IF;

    -- Only owners may assign owner (administrators cannot promote to owner)
    IF NEW.role::text = 'owner'
       AND OLD.role::text IS DISTINCT FROM 'owner'
       AND v_actor_role IS DISTINCT FROM 'owner' THEN
      RAISE EXCEPTION 'FORBIDDEN: only an owner can assign the owner role';
    END IF;

    -- Security leaders cannot touch owner rows or assign elevated roles
    IF v_actor_role = 'security_leader' THEN
      IF OLD.role::text IN ('owner', 'administrator', 'security_leader') THEN
        RAISE EXCEPTION 'FORBIDDEN: security leaders cannot modify this membership';
      END IF;
      IF NEW.role::text = 'owner' THEN
        RAISE EXCEPTION 'FORBIDDEN: security leaders cannot assign the owner role';
      END IF;
      IF public.membership_role_rank(NEW.role::text)
           >= public.membership_role_rank('security_leader') THEN
        RAISE EXCEPTION 'FORBIDDEN: security leaders may only assign security_member or viewer';
      END IF;
    END IF;

    -- Administrators cannot modify owner rows (demote / suspend / remove)
    IF v_actor_role = 'administrator' AND OLD.role::text = 'owner' THEN
      RAISE EXCEPTION 'FORBIDDEN: administrators cannot modify owner memberships';
    END IF;

    -- Last active owner protection
    IF OLD.role::text = 'owner'
       AND OLD.status = 'active'::public.membership_status
       AND (
         NEW.role::text IS DISTINCT FROM 'owner'
         OR NEW.status IS DISTINCT FROM 'active'::public.membership_status
       ) THEN
      SELECT COUNT(*)::integer
      INTO v_active_owners
      FROM public.church_memberships m
      WHERE m.church_id = OLD.church_id
        AND m.role = 'owner'::public.membership_role
        AND m.status = 'active'::public.membership_status;

      IF v_active_owners <= 1 THEN
        RAISE EXCEPTION 'FORBIDDEN: cannot remove or demote the last active owner';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  -- DELETE ---------------------------------------------------------------
  IF TG_OP = 'DELETE' THEN
    IF NOT public.can_manage_memberships(OLD.church_id) THEN
      RAISE EXCEPTION 'FORBIDDEN: cannot delete memberships for this church';
    END IF;

    IF OLD.user_id = v_actor THEN
      RAISE EXCEPTION 'FORBIDDEN: cannot delete your own membership';
    END IF;

    IF v_actor_role IS DISTINCT FROM 'owner' AND OLD.role::text = 'owner' THEN
      RAISE EXCEPTION 'FORBIDDEN: only an owner can remove an owner membership';
    END IF;

    IF OLD.role::text = 'owner'
       AND OLD.status = 'active'::public.membership_status THEN
      SELECT COUNT(*)::integer
      INTO v_active_owners
      FROM public.church_memberships m
      WHERE m.church_id = OLD.church_id
        AND m.role = 'owner'::public.membership_role
        AND m.status = 'active'::public.membership_status;

      IF v_active_owners <= 1 THEN
        RAISE EXCEPTION 'FORBIDDEN: cannot remove the last active owner';
      END IF;
    END IF;

    RETURN OLD;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS church_memberships_enforce_rules ON public.church_memberships;
CREATE TRIGGER church_memberships_enforce_rules
  BEFORE INSERT OR UPDATE OR DELETE ON public.church_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_membership_mutation_rules();

-- ---------------------------------------------------------------------------
-- Enable RLS on all Phase 7 tables
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.churches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.church_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.church_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ===========================================================================
-- profiles
-- Identity only. No church/role assignment through this table.
-- ===========================================================================

DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can delete own profile" ON public.profiles;
DROP POLICY IF EXISTS "Members can read co-member profiles" ON public.profiles;

CREATE POLICY "Users can read own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Optional roster support: active members may read profiles of users who share
-- an active membership in the same church (never memberships to find peers).
CREATE POLICY "Members can read co-member profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    id <> auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.church_memberships mine
      JOIN public.church_memberships theirs
        ON theirs.church_id = mine.church_id
       AND theirs.user_id = profiles.id
      WHERE mine.user_id = auth.uid()
        AND mine.status = 'active'::public.membership_status
        AND theirs.status = 'active'::public.membership_status
        AND public.is_active_church_member(mine.church_id)
    )
  );

CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- No DELETE policy for authenticated

-- ===========================================================================
-- churches
-- ===========================================================================

DROP POLICY IF EXISTS "Users can read their church" ON public.churches;
DROP POLICY IF EXISTS "Users can read own church" ON public.churches;
DROP POLICY IF EXISTS "Owners can update church settings" ON public.churches;
DROP POLICY IF EXISTS "No direct church inserts" ON public.churches;
DROP POLICY IF EXISTS "No direct church deletes" ON public.churches;

-- Active members see usable churches; invited users may still see the church
-- name while deciding on an invite (suspended/removed cannot).
CREATE POLICY "Members can read their churches"
  ON public.churches
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.church_memberships m
      WHERE m.church_id = churches.id
        AND m.user_id = auth.uid()
        AND m.status IN (
          'invited'::public.membership_status,
          'active'::public.membership_status
        )
    )
  );

CREATE POLICY "Owners and admins can update church settings"
  ON public.churches
  FOR UPDATE
  TO authenticated
  USING (public.can_manage_church_settings(id))
  WITH CHECK (public.can_manage_church_settings(id));

-- Inserts go through create_church_with_owner() (SECURITY DEFINER).
-- No INSERT / DELETE policies for authenticated.

-- ===========================================================================
-- church_memberships
-- ===========================================================================

DROP POLICY IF EXISTS "Users can read own memberships" ON public.church_memberships;
DROP POLICY IF EXISTS "Managers can insert memberships" ON public.church_memberships;
DROP POLICY IF EXISTS "Managers can update memberships" ON public.church_memberships;
DROP POLICY IF EXISTS "Managers can delete memberships" ON public.church_memberships;

-- Own rows always visible (so suspended users can learn they are suspended).
-- Active members can see the roster for churches they actively belong to.
CREATE POLICY "Users can read relevant memberships"
  ON public.church_memberships
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_active_church_member(church_id)
  );

CREATE POLICY "Managers can insert memberships"
  ON public.church_memberships
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_manage_memberships(church_id)
    AND user_id <> auth.uid()
    AND (
      role::text <> 'owner'
      OR public.has_church_role(church_id, ARRAY['owner'])
    )
  );

CREATE POLICY "Managers can update memberships"
  ON public.church_memberships
  FOR UPDATE
  TO authenticated
  USING (
    public.can_manage_memberships(church_id)
    AND user_id <> auth.uid()
  )
  WITH CHECK (
    public.can_manage_memberships(church_id)
    AND user_id <> auth.uid()
    AND (
      role::text <> 'owner'
      OR public.has_church_role(church_id, ARRAY['owner'])
    )
  );

CREATE POLICY "Managers can delete memberships"
  ON public.church_memberships
  FOR DELETE
  TO authenticated
  USING (
    public.can_manage_memberships(church_id)
    AND user_id <> auth.uid()
  );

-- ===========================================================================
-- church_invitations
-- ===========================================================================

DROP POLICY IF EXISTS "Managers can read invitations" ON public.church_invitations;
DROP POLICY IF EXISTS "Managers can create invitations" ON public.church_invitations;
DROP POLICY IF EXISTS "Managers can update invitations" ON public.church_invitations;
DROP POLICY IF EXISTS "Managers can delete invitations" ON public.church_invitations;

CREATE POLICY "Managers can read invitations"
  ON public.church_invitations
  FOR SELECT
  TO authenticated
  USING (public.can_manage_memberships(church_id));

CREATE POLICY "Managers can create invitations"
  ON public.church_invitations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_manage_memberships(church_id)
    AND invited_by = auth.uid()
    AND role::text <> 'owner'
    AND (
      -- security leaders may only invite member/viewer
      public.has_church_role(church_id, ARRAY['owner', 'administrator'])
      OR (
        public.has_church_role(church_id, ARRAY['security_leader'])
        AND role::text IN ('security_member', 'viewer')
      )
    )
  );

CREATE POLICY "Managers can update invitations"
  ON public.church_invitations
  FOR UPDATE
  TO authenticated
  USING (public.can_manage_memberships(church_id))
  WITH CHECK (
    public.can_manage_memberships(church_id)
    AND role::text <> 'owner'
  );

CREATE POLICY "Managers can delete invitations"
  ON public.church_invitations
  FOR DELETE
  TO authenticated
  USING (public.can_manage_memberships(church_id));

-- ===========================================================================
-- campuses
-- ===========================================================================

DROP POLICY IF EXISTS "Members can read campuses" ON public.campuses;
DROP POLICY IF EXISTS "Managers can insert campuses" ON public.campuses;
DROP POLICY IF EXISTS "Managers can update campuses" ON public.campuses;
DROP POLICY IF EXISTS "Managers can delete campuses" ON public.campuses;

CREATE POLICY "Members can read campuses"
  ON public.campuses
  FOR SELECT
  TO authenticated
  USING (public.is_active_church_member(church_id));

CREATE POLICY "Managers can insert campuses"
  ON public.campuses
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_church_settings(church_id));

CREATE POLICY "Managers can update campuses"
  ON public.campuses
  FOR UPDATE
  TO authenticated
  USING (public.can_manage_church_settings(church_id))
  WITH CHECK (public.can_manage_church_settings(church_id));

CREATE POLICY "Managers can delete campuses"
  ON public.campuses
  FOR DELETE
  TO authenticated
  USING (public.can_manage_church_settings(church_id));

-- ===========================================================================
-- audit_logs (append-oriented; triggers already block UPDATE/DELETE)
-- ===========================================================================

DROP POLICY IF EXISTS "Members can read audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Members can insert audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "No update audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "No delete audit logs" ON public.audit_logs;

CREATE POLICY "Members can read audit logs"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (
    church_id IS NOT NULL
    AND public.is_active_church_member(church_id)
  );

-- Prefer writing audit rows from SECURITY DEFINER RPCs. Allow narrow client
-- inserts only for the caller's own user_id and an active church.
CREATE POLICY "Members can insert audit logs"
  ON public.audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND church_id IS NOT NULL
    AND public.is_active_church_member(church_id)
  );

-- Explicitly no UPDATE / DELETE policies for authenticated.
-- Keep table triggers as a second line of defense.

-- ---------------------------------------------------------------------------
-- Grants (least privilege for authenticated)
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
REVOKE DELETE ON public.profiles FROM authenticated;

GRANT SELECT, UPDATE ON public.churches TO authenticated;
REVOKE INSERT, DELETE ON public.churches FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.church_memberships TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.church_invitations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campuses TO authenticated;

GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
REVOKE UPDATE, DELETE ON public.audit_logs FROM authenticated;

-- ---------------------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------------------
-- 1. create_church_with_owner() remains SECURITY DEFINER and bypasses RLS to
--    bootstrap church + owner membership + campus + audit row.
-- 2. Invitation acceptance that flips invited → active on the invitee's own
--    membership should be a SECURITY DEFINER RPC (self-updates are blocked).
-- 3. Operational tables (incidents, events, certifications, team_members)
--    already use has_active_church_membership(); the alias now points at
--    is_active_church_member().
