-- =============================================================================
-- 117_security_group_tenant_isolation.sql
-- Stage 3A: Replace authenticated-wide security-group RLS with org-scoped policies.
-- Additive policy replacement. Preserves all existing rows. Non-destructive.
--
-- IMPORTANT: PostgreSQL permissive policies OR together. Broad policies must be
-- DROP'ped; adding a tighter policy alone does not neutralize them.
--
-- App writes use the service role (bypasses RLS unless FORCE). These policies
-- protect direct PostgREST access with an end-user JWT.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper: organization administrators who may manage security groups/permissions
-- (matches requireMinChurchRole("administrator") / app security actions)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_manage_organization_security_groups(
  requested_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_organization_role(
    requested_organization_id,
    ARRAY['owner', 'co_owner', 'administrator']::text[]
  );
$$;

COMMENT ON FUNCTION public.can_manage_organization_security_groups(uuid) IS
  'True when the caller is an active owner, co_owner, or administrator of the organization.';

REVOKE ALL ON FUNCTION public.can_manage_organization_security_groups(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_organization_security_groups(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_organization_security_groups(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- security_groups
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "security_groups_authenticated" ON public.security_groups;
DROP POLICY IF EXISTS "security_groups_admin_insert" ON public.security_groups;
DROP POLICY IF EXISTS "security_groups_admin_update" ON public.security_groups;
DROP POLICY IF EXISTS "security_groups_admin_delete" ON public.security_groups;
DROP POLICY IF EXISTS security_groups_select_member ON public.security_groups;
DROP POLICY IF EXISTS security_groups_insert_manager ON public.security_groups;
DROP POLICY IF EXISTS security_groups_update_manager ON public.security_groups;
DROP POLICY IF EXISTS security_groups_delete_manager ON public.security_groups;

CREATE POLICY security_groups_select_member
  ON public.security_groups
  FOR SELECT
  TO authenticated
  USING (public.is_active_organization_member(organization_id));

CREATE POLICY security_groups_insert_manager
  ON public.security_groups
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_organization_security_groups(organization_id));

CREATE POLICY security_groups_update_manager
  ON public.security_groups
  FOR UPDATE
  TO authenticated
  USING (public.can_manage_organization_security_groups(organization_id))
  WITH CHECK (public.can_manage_organization_security_groups(organization_id));

CREATE POLICY security_groups_delete_manager
  ON public.security_groups
  FOR DELETE
  TO authenticated
  USING (public.can_manage_organization_security_groups(organization_id));

-- ---------------------------------------------------------------------------
-- security_group_members
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "security_group_members_authenticated" ON public.security_group_members;
DROP POLICY IF EXISTS "security_group_members_admin_insert" ON public.security_group_members;
DROP POLICY IF EXISTS "security_group_members_admin_update" ON public.security_group_members;
DROP POLICY IF EXISTS "security_group_members_admin_delete" ON public.security_group_members;
DROP POLICY IF EXISTS security_group_members_select_member ON public.security_group_members;
DROP POLICY IF EXISTS security_group_members_insert_manager ON public.security_group_members;
DROP POLICY IF EXISTS security_group_members_update_manager ON public.security_group_members;
DROP POLICY IF EXISTS security_group_members_delete_manager ON public.security_group_members;

CREATE POLICY security_group_members_select_member
  ON public.security_group_members
  FOR SELECT
  TO authenticated
  USING (
    public.is_active_organization_member(organization_id)
    AND EXISTS (
      SELECT 1
      FROM public.security_groups g
      WHERE g.id = security_group_id
        AND g.organization_id = security_group_members.organization_id
    )
  );

CREATE POLICY security_group_members_insert_manager
  ON public.security_group_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_manage_organization_security_groups(organization_id)
    AND EXISTS (
      SELECT 1
      FROM public.security_groups g
      WHERE g.id = security_group_id
        AND g.organization_id = organization_id
    )
    AND EXISTS (
      SELECT 1
      FROM public.organization_memberships m
      WHERE m.user_id = security_group_members.user_id
        AND m.organization_id = organization_id
        AND m.status = 'active'::public.membership_status
    )
  );

CREATE POLICY security_group_members_update_manager
  ON public.security_group_members
  FOR UPDATE
  TO authenticated
  USING (public.can_manage_organization_security_groups(organization_id))
  WITH CHECK (
    public.can_manage_organization_security_groups(organization_id)
    AND EXISTS (
      SELECT 1
      FROM public.security_groups g
      WHERE g.id = security_group_id
        AND g.organization_id = organization_id
    )
  );

CREATE POLICY security_group_members_delete_manager
  ON public.security_group_members
  FOR DELETE
  TO authenticated
  USING (public.can_manage_organization_security_groups(organization_id));

-- ---------------------------------------------------------------------------
-- security_group_permissions (org via parent group; no organization_id column)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "security_group_permissions_authenticated" ON public.security_group_permissions;
DROP POLICY IF EXISTS "security_group_permissions_admin_insert" ON public.security_group_permissions;
DROP POLICY IF EXISTS "security_group_permissions_admin_update" ON public.security_group_permissions;
DROP POLICY IF EXISTS "security_group_permissions_admin_delete" ON public.security_group_permissions;
DROP POLICY IF EXISTS security_group_permissions_select_member ON public.security_group_permissions;
DROP POLICY IF EXISTS security_group_permissions_insert_manager ON public.security_group_permissions;
DROP POLICY IF EXISTS security_group_permissions_update_manager ON public.security_group_permissions;
DROP POLICY IF EXISTS security_group_permissions_delete_manager ON public.security_group_permissions;

CREATE POLICY security_group_permissions_select_member
  ON public.security_group_permissions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.security_groups g
      WHERE g.id = security_group_id
        AND public.is_active_organization_member(g.organization_id)
    )
  );

CREATE POLICY security_group_permissions_insert_manager
  ON public.security_group_permissions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.security_groups g
      WHERE g.id = security_group_id
        AND public.can_manage_organization_security_groups(g.organization_id)
    )
  );

CREATE POLICY security_group_permissions_update_manager
  ON public.security_group_permissions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.security_groups g
      WHERE g.id = security_group_id
        AND public.can_manage_organization_security_groups(g.organization_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.security_groups g
      WHERE g.id = security_group_id
        AND public.can_manage_organization_security_groups(g.organization_id)
    )
  );

CREATE POLICY security_group_permissions_delete_manager
  ON public.security_group_permissions
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.security_groups g
      WHERE g.id = security_group_id
        AND public.can_manage_organization_security_groups(g.organization_id)
    )
  );

-- ---------------------------------------------------------------------------
-- user_permissions
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "user_permissions_authenticated" ON public.user_permissions;
DROP POLICY IF EXISTS "user_permissions_admin_insert" ON public.user_permissions;
DROP POLICY IF EXISTS "user_permissions_admin_update" ON public.user_permissions;
DROP POLICY IF EXISTS "user_permissions_admin_delete" ON public.user_permissions;
DROP POLICY IF EXISTS user_permissions_select_member ON public.user_permissions;
DROP POLICY IF EXISTS user_permissions_insert_manager ON public.user_permissions;
DROP POLICY IF EXISTS user_permissions_update_manager ON public.user_permissions;
DROP POLICY IF EXISTS user_permissions_delete_manager ON public.user_permissions;

CREATE POLICY user_permissions_select_member
  ON public.user_permissions
  FOR SELECT
  TO authenticated
  USING (public.is_active_organization_member(organization_id));

CREATE POLICY user_permissions_insert_manager
  ON public.user_permissions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_manage_organization_security_groups(organization_id)
    AND user_id IS DISTINCT FROM auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.organization_memberships m
      WHERE m.user_id = user_permissions.user_id
        AND m.organization_id = organization_id
        AND m.status = 'active'::public.membership_status
    )
  );

CREATE POLICY user_permissions_update_manager
  ON public.user_permissions
  FOR UPDATE
  TO authenticated
  USING (public.can_manage_organization_security_groups(organization_id))
  WITH CHECK (
    public.can_manage_organization_security_groups(organization_id)
    AND user_id IS DISTINCT FROM auth.uid()
  );

CREATE POLICY user_permissions_delete_manager
  ON public.user_permissions
  FOR DELETE
  TO authenticated
  USING (public.can_manage_organization_security_groups(organization_id));

-- ---------------------------------------------------------------------------
-- security_audit_logs
-- App writes via service role. Block authenticated forge/overwrite.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "security_audit_logs_select_authenticated" ON public.security_audit_logs;
DROP POLICY IF EXISTS "security_audit_logs_insert_authenticated" ON public.security_audit_logs;
DROP POLICY IF EXISTS "security_audit_logs_delete_service_role" ON public.security_audit_logs;
DROP POLICY IF EXISTS security_audit_logs_select_manager ON public.security_audit_logs;
DROP POLICY IF EXISTS security_audit_logs_insert_service_role ON public.security_audit_logs;
DROP POLICY IF EXISTS security_audit_logs_delete_service_role ON public.security_audit_logs;

CREATE POLICY security_audit_logs_select_manager
  ON public.security_audit_logs
  FOR SELECT
  TO authenticated
  USING (public.can_manage_organization_security_groups(organization_id));

-- No INSERT/UPDATE policy for authenticated → forge/modify denied.
-- Service role bypasses RLS (relforcerowsecurity remains false).

REVOKE INSERT ON public.security_audit_logs FROM authenticated;
GRANT SELECT ON public.security_audit_logs TO authenticated;
GRANT ALL ON public.security_audit_logs TO service_role;
