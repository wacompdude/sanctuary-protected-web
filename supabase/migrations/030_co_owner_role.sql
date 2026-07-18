-- =============================================================================
-- 030_co_owner_role.sql
-- Add co_owner membership role with owner-equivalent privileges.
-- Multiple co-owners allowed. Primary owner may transfer ownership to a co-owner.
-- Safe to re-run.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enum value
-- ---------------------------------------------------------------------------

ALTER TYPE public.membership_role ADD VALUE IF NOT EXISTS 'co_owner';

-- ---------------------------------------------------------------------------
-- 2. Rank helper (co_owner equals owner)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.membership_role_rank(p_role text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_role
    WHEN 'viewer' THEN 10
    WHEN 'security_member' THEN 20
    WHEN 'security_leader' THEN 30
    WHEN 'administrator' THEN 40
    WHEN 'co_owner' THEN 50
    WHEN 'owner' THEN 50
    ELSE 0
  END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Ownership helpers (ignore church status for recovery)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_church_ownership_role(p_role text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_role IN ('owner', 'co_owner');
$$;

CREATE OR REPLACE FUNCTION public.is_church_owner(requested_church_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.church_memberships m
    WHERE m.user_id = auth.uid()
      AND m.church_id = requested_church_id
      AND m.status = 'active'::public.membership_status
      AND public.is_church_ownership_role(m.role::text)
  );
$$;

REVOKE ALL ON FUNCTION public.is_church_ownership_role(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_church_ownership_role(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_church_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_church_owner(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Role-gate helpers: include co_owner wherever owner is permitted
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_manage_memberships(requested_church_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_church_role(
    requested_church_id,
    ARRAY['owner', 'co_owner', 'administrator', 'security_leader']
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_church_settings(requested_church_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_church_owner(requested_church_id)
    OR EXISTS (
      SELECT 1
      FROM public.church_memberships m
      JOIN public.churches c ON c.id = m.church_id
      WHERE m.user_id = auth.uid()
        AND m.church_id = requested_church_id
        AND m.status = 'active'::public.membership_status
        AND m.role = 'administrator'::public.membership_role
        AND c.status IN (
          'trial'::public.church_status,
          'active'::public.church_status
        )
    );
$$;

DROP POLICY IF EXISTS "Admins can read audit logs" ON public.audit_logs;
CREATE POLICY "Admins can read audit logs"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (
    church_id IS NOT NULL
    AND public.has_church_role(
      church_id,
      ARRAY['owner', 'co_owner', 'administrator']
    )
  );

CREATE OR REPLACE FUNCTION public.enforce_church_status_owner_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NOT public.is_church_owner(NEW.id) THEN
    RAISE EXCEPTION 'FORBIDDEN: only church owners or co-owners can change account status';
  END IF;
  RETURN NEW;
END;
$$;

-- Notification helpers (027 / 029) — recreate with co_owner
CREATE OR REPLACE FUNCTION public.can_manage_notification_settings(
  requested_church_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_church_role(
    requested_church_id,
    ARRAY['owner', 'co_owner', 'administrator']
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_notification_history(
  requested_church_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_church_role(
    requested_church_id,
    ARRAY['owner', 'co_owner', 'administrator', 'security_leader']
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_notification_templates(
  requested_church_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_church_role(
    requested_church_id,
    ARRAY['owner', 'co_owner', 'administrator', 'security_leader']
  );
$$;

CREATE OR REPLACE FUNCTION public.can_create_operational_notifications(
  requested_church_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_church_role(
    requested_church_id,
    ARRAY['owner', 'co_owner', 'administrator', 'security_leader']
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_notification_groups(
  requested_church_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_church_role(
    requested_church_id,
    ARRAY['owner', 'co_owner', 'administrator']
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_operational_notification_groups(
  requested_church_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_church_role(
    requested_church_id,
    ARRAY['owner', 'co_owner', 'administrator', 'security_leader']
  );
$$;

-- Medical / equipment helpers if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'can_manage_medical_supplies'
  ) THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.can_manage_medical_supplies(
        requested_church_id uuid
      )
      RETURNS boolean
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public
      AS $body$
        SELECT public.has_church_role(
          requested_church_id,
          ARRAY['owner', 'co_owner', 'administrator', 'security_leader']
        );
      $body$;
    $fn$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'can_manage_security_equipment'
  ) THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.can_manage_security_equipment(
        requested_church_id uuid
      )
      RETURNS boolean
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public
      AS $body$
        SELECT public.has_church_role(
          requested_church_id,
          ARRAY['owner', 'co_owner', 'administrator', 'security_leader']
        );
      $body$;
    $fn$;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Membership mutation rules
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
  IF current_setting('app.bypass_membership_guards', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

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

  IF TG_OP = 'INSERT' THEN
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

    IF NEW.role::text = 'owner'
       AND v_actor_role IS DISTINCT FROM 'owner' THEN
      RAISE EXCEPTION 'FORBIDDEN: only an owner can assign the owner role';
    END IF;

    IF NEW.role::text = 'co_owner'
       AND NOT public.is_church_ownership_role(COALESCE(v_actor_role, '')) THEN
      RAISE EXCEPTION 'FORBIDDEN: only an owner or co-owner can assign the co-owner role';
    END IF;

    IF v_actor_role = 'security_leader'
       AND public.membership_role_rank(NEW.role::text)
         >= public.membership_role_rank('security_leader') THEN
      RAISE EXCEPTION 'FORBIDDEN: security leaders may only assign security_member or viewer';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NOT public.can_manage_memberships(OLD.church_id) THEN
      RAISE EXCEPTION 'FORBIDDEN: cannot update memberships for this church';
    END IF;

    IF NEW.church_id IS DISTINCT FROM OLD.church_id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'FORBIDDEN: cannot reassign membership identity fields';
    END IF;

    IF OLD.user_id = v_actor
       AND (
         NEW.role IS DISTINCT FROM OLD.role
         OR NEW.status IS DISTINCT FROM OLD.status
       ) THEN
      RAISE EXCEPTION 'FORBIDDEN: cannot change your own membership role or status';
    END IF;

    IF NEW.role::text = 'owner'
       AND OLD.role::text IS DISTINCT FROM 'owner'
       AND v_actor_role IS DISTINCT FROM 'owner' THEN
      RAISE EXCEPTION 'FORBIDDEN: only an owner can assign the owner role';
    END IF;

    IF NEW.role::text = 'co_owner'
       AND OLD.role::text IS DISTINCT FROM 'co_owner'
       AND NOT public.is_church_ownership_role(COALESCE(v_actor_role, '')) THEN
      RAISE EXCEPTION 'FORBIDDEN: only an owner or co-owner can assign the co-owner role';
    END IF;

    IF v_actor_role = 'security_leader' THEN
      IF public.is_church_ownership_role(OLD.role::text)
         OR OLD.role::text IN ('administrator', 'security_leader') THEN
        RAISE EXCEPTION 'FORBIDDEN: security leaders cannot modify this membership';
      END IF;
      IF NEW.role::text = 'owner'
         OR NEW.role::text = 'co_owner'
         OR public.membership_role_rank(NEW.role::text)
              >= public.membership_role_rank('security_leader') THEN
        RAISE EXCEPTION 'FORBIDDEN: security leaders may only assign security_member or viewer';
      END IF;
    END IF;

    IF v_actor_role = 'administrator'
       AND public.is_church_ownership_role(OLD.role::text) THEN
      RAISE EXCEPTION 'FORBIDDEN: administrators cannot modify owner or co-owner memberships';
    END IF;

    -- Keep at least one active primary owner
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

  IF TG_OP = 'DELETE' THEN
    IF NOT public.can_manage_memberships(OLD.church_id) THEN
      RAISE EXCEPTION 'FORBIDDEN: cannot delete memberships for this church';
    END IF;

    IF OLD.user_id = v_actor THEN
      RAISE EXCEPTION 'FORBIDDEN: cannot delete your own membership';
    END IF;

    IF public.is_church_ownership_role(OLD.role::text)
       AND NOT public.is_church_ownership_role(COALESCE(v_actor_role, '')) THEN
      RAISE EXCEPTION 'FORBIDDEN: only an owner or co-owner can remove ownership-tier memberships';
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

-- ---------------------------------------------------------------------------
-- 6. Membership / invitation RLS: ownership tier can assign owner/co_owner
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Managers can insert memberships" ON public.church_memberships;
CREATE POLICY "Managers can insert memberships"
  ON public.church_memberships
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_manage_memberships(church_id)
    AND user_id <> auth.uid()
    AND (
      role::text NOT IN ('owner', 'co_owner')
      OR public.has_church_role(church_id, ARRAY['owner', 'co_owner'])
      OR public.is_church_owner(church_id)
    )
    AND (
      role::text <> 'owner'
      OR public.has_church_role(church_id, ARRAY['owner'])
      OR (
        -- primary owner assignment still requires an active primary owner actor;
        -- recovery path uses is_church_owner which includes co_owner — block that
        -- for role=owner by requiring exact owner via membership check below.
        EXISTS (
          SELECT 1
          FROM public.church_memberships m
          WHERE m.user_id = auth.uid()
            AND m.church_id = church_id
            AND m.status = 'active'::public.membership_status
            AND m.role = 'owner'::public.membership_role
        )
      )
    )
  );

DROP POLICY IF EXISTS "Managers can update memberships" ON public.church_memberships;
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
      role::text NOT IN ('owner', 'co_owner')
      OR public.has_church_role(church_id, ARRAY['owner', 'co_owner'])
      OR public.is_church_owner(church_id)
    )
    AND (
      role::text <> 'owner'
      OR EXISTS (
        SELECT 1
        FROM public.church_memberships m
        WHERE m.user_id = auth.uid()
          AND m.church_id = church_id
          AND m.status = 'active'::public.membership_status
          AND m.role = 'owner'::public.membership_role
      )
    )
  );

DROP POLICY IF EXISTS "Managers can create invitations" ON public.church_invitations;
CREATE POLICY "Managers can create invitations"
  ON public.church_invitations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_manage_memberships(church_id)
    AND invited_by = auth.uid()
    AND role::text <> 'owner'
    AND (
      public.has_church_role(
        church_id,
        ARRAY['owner', 'co_owner', 'administrator']
      )
      OR (
        public.has_church_role(church_id, ARRAY['security_leader'])
        AND role::text IN ('security_member', 'viewer')
      )
    )
    AND (
      role::text <> 'co_owner'
      OR public.has_church_role(church_id, ARRAY['owner', 'co_owner'])
      OR public.is_church_owner(church_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 7. Provision path: allow co_owner, still forbid owner
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.attach_church_membership(
  p_church_id uuid,
  p_user_id uuid,
  p_role public.membership_role
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_membership_id uuid;
  v_now timestamptz := now();
  v_created boolean := false;
  v_previous_status text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sign in to provision members';
  END IF;

  IF p_church_id IS NULL OR p_user_id IS NULL OR p_role IS NULL THEN
    RAISE EXCEPTION 'VALIDATION: church, user, and role are required';
  END IF;

  IF p_role = 'owner'::public.membership_role THEN
    RAISE EXCEPTION 'FORBIDDEN: cannot provision an owner via this path';
  END IF;

  IF p_user_id = v_actor THEN
    RAISE EXCEPTION 'FORBIDDEN: cannot provision your own membership';
  END IF;

  IF NOT public.can_manage_memberships(p_church_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: cannot manage memberships for this church';
  END IF;

  SELECT m.role::text
  INTO v_actor_role
  FROM public.church_memberships m
  WHERE m.user_id = v_actor
    AND m.church_id = p_church_id
    AND m.status = 'active'::public.membership_status
  LIMIT 1;

  IF v_actor_role IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: active membership required';
  END IF;

  IF p_role = 'co_owner'::public.membership_role
     AND NOT public.is_church_ownership_role(v_actor_role) THEN
    RAISE EXCEPTION 'FORBIDDEN: only an owner or co-owner can assign the co-owner role';
  END IF;

  IF v_actor_role = 'security_leader'
     AND public.membership_role_rank(p_role::text)
       >= public.membership_role_rank('security_leader') THEN
    RAISE EXCEPTION 'FORBIDDEN: security leaders may only assign security_member or viewer';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'NOT_FOUND: auth user does not exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.church_memberships m
    WHERE m.church_id = p_church_id
      AND m.user_id = p_user_id
      AND m.status = 'active'::public.membership_status
  ) THEN
    RAISE EXCEPTION 'CONFLICT: user already has an active membership at this church';
  END IF;

  PERFORM set_config('app.bypass_membership_guards', 'on', true);

  SELECT m.id, m.status::text
  INTO v_membership_id, v_previous_status
  FROM public.church_memberships m
  WHERE m.church_id = p_church_id
    AND m.user_id = p_user_id
  LIMIT 1;

  IF v_membership_id IS NULL THEN
    INSERT INTO public.church_memberships (
      church_id,
      user_id,
      role,
      status,
      invited_by,
      joined_at,
      created_at,
      updated_at
    ) VALUES (
      p_church_id,
      p_user_id,
      p_role,
      'active'::public.membership_status,
      v_actor,
      v_now,
      v_now,
      v_now
    )
    RETURNING id INTO v_membership_id;
    v_created := true;
  ELSE
    UPDATE public.church_memberships
    SET
      role = p_role,
      status = 'active'::public.membership_status,
      invited_by = COALESCE(invited_by, v_actor),
      joined_at = COALESCE(joined_at, v_now),
      updated_at = v_now
    WHERE id = v_membership_id;
  END IF;

  UPDATE public.church_invitations ci
  SET revoked_at = v_now
  WHERE ci.church_id = p_church_id
    AND ci.accepted_at IS NULL
    AND ci.revoked_at IS NULL
    AND lower(ci.email) = (
      SELECT lower(u.email)
      FROM auth.users u
      WHERE u.id = p_user_id
    );

  RETURN jsonb_build_object(
    'membership_id', v_membership_id,
    'created', v_created,
    'previous_status', v_previous_status,
    'role', p_role::text,
    'user_id', p_user_id,
    'church_id', p_church_id
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Team list: last active primary owner flag
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_church_team_memberships(p_church_id uuid)
RETURNS TABLE (
  membership_id uuid,
  user_id uuid,
  email text,
  role text,
  status text,
  joined_at timestamptz,
  updated_at timestamptz,
  first_name text,
  last_name text,
  full_name text,
  is_last_active_owner boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active_owners integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  IF NOT public.is_active_church_member(p_church_id)
     AND NOT public.is_church_owner(p_church_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: not an active member of this church';
  END IF;

  SELECT COUNT(*)::integer
  INTO v_active_owners
  FROM public.church_memberships m
  WHERE m.church_id = p_church_id
    AND m.role = 'owner'::public.membership_role
    AND m.status = 'active'::public.membership_status;

  RETURN QUERY
  SELECT
    m.id AS membership_id,
    m.user_id,
    u.email::text,
    m.role::text,
    m.status::text,
    m.joined_at,
    m.updated_at,
    p.first_name,
    p.last_name,
    p.full_name,
    (
      m.role = 'owner'::public.membership_role
      AND m.status = 'active'::public.membership_status
      AND v_active_owners <= 1
    ) AS is_last_active_owner
  FROM public.church_memberships m
  JOIN auth.users u ON u.id = m.user_id
  LEFT JOIN public.profiles p ON p.id = m.user_id
  WHERE m.church_id = p_church_id
    AND m.status IN (
      'active'::public.membership_status,
      'suspended'::public.membership_status,
      'removed'::public.membership_status
    )
  ORDER BY
    CASE m.status::text
      WHEN 'active' THEN 0
      WHEN 'suspended' THEN 1
      WHEN 'removed' THEN 2
      ELSE 3
    END,
    CASE m.role::text
      WHEN 'owner' THEN 0
      WHEN 'co_owner' THEN 1
      WHEN 'administrator' THEN 2
      WHEN 'security_leader' THEN 3
      WHEN 'security_member' THEN 4
      ELSE 5
    END,
    COALESCE(m.joined_at, m.created_at) NULLS LAST,
    u.email;
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. Ownership transfer: primary owner → active co-owner
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.transfer_church_ownership(
  p_church_id uuid,
  p_to_membership_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_from public.church_memberships%ROWTYPE;
  v_to public.church_memberships%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  SELECT *
  INTO v_from
  FROM public.church_memberships m
  WHERE m.church_id = p_church_id
    AND m.user_id = v_actor
    AND m.status = 'active'::public.membership_status
  LIMIT 1;

  IF v_from.id IS NULL OR v_from.role::text <> 'owner' THEN
    RAISE EXCEPTION 'FORBIDDEN: only the current owner can transfer ownership';
  END IF;

  SELECT *
  INTO v_to
  FROM public.church_memberships m
  WHERE m.id = p_to_membership_id
    AND m.church_id = p_church_id
  LIMIT 1;

  IF v_to.id IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: target membership not found';
  END IF;

  IF v_to.user_id = v_actor THEN
    RAISE EXCEPTION 'VALIDATION: cannot transfer ownership to yourself';
  END IF;

  IF v_to.status <> 'active'::public.membership_status THEN
    RAISE EXCEPTION 'VALIDATION: target must be an active member';
  END IF;

  IF v_to.role::text <> 'co_owner' THEN
    RAISE EXCEPTION 'VALIDATION: ownership can only be transferred to a co-owner';
  END IF;

  PERFORM set_config('app.bypass_membership_guards', 'on', true);

  UPDATE public.church_memberships
  SET role = 'owner'::public.membership_role,
      updated_at = now()
  WHERE id = v_to.id;

  UPDATE public.church_memberships
  SET role = 'co_owner'::public.membership_role,
      updated_at = now()
  WHERE id = v_from.id;

  PERFORM set_config('app.bypass_membership_guards', 'off', true);

  RETURN jsonb_build_object(
    'church_id', p_church_id,
    'from_membership_id', v_from.id,
    'from_user_id', v_from.user_id,
    'to_membership_id', v_to.id,
    'to_user_id', v_to.user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_church_ownership(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_church_ownership(uuid, uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 10. Seed co-owner system notification group (when groups table exists)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.notification_groups') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.notification_groups (
    church_id,
    name,
    description,
    group_type,
    status,
    is_system_group,
    dynamic_rule_type,
    dynamic_rule_value,
    allow_member_self_join,
    allow_member_self_leave,
    default_notification_severity
  )
  SELECT
    c.id,
    'All Co-Owners',
    'System group: all active co-owners for this church.',
    'leadership',
    'active',
    true,
    'role',
    'co_owner',
    false,
    false,
    'informational'
  FROM public.churches c
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.notification_groups g
    WHERE g.church_id = c.id
      AND g.is_system_group = true
      AND g.dynamic_rule_type = 'role'
      AND g.dynamic_rule_value = 'co_owner'
      AND g.status <> 'archived'
  );
END;
$$;
