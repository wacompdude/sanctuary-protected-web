-- =============================================================================
-- Stage 3A-3 LOCAL-ONLY compatibility fixture
-- Disposable local Supabase DB. No Production data. Not a migration.
-- Creates pre-117 security schema (organization_* columns) + vulnerable
-- authenticated-wide policies so migration 117 can be validated in isolation.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Roles used by RLS predicates (Supabase local normally provides these)
DO $$ BEGIN
  CREATE ROLE authenticated NOINHERIT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE service_role NOINHERIT BYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE anon NOINHERIT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT USAGE ON SCHEMA public TO authenticated, service_role, anon;
GRANT ALL ON SCHEMA public TO service_role;

-- Enums
DO $$ BEGIN CREATE TYPE public.organization_status AS ENUM ('trial','active','suspended','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.membership_status AS ENUM ('invited','active','suspended','removed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.membership_role AS ENUM (
  'owner','co_owner','administrator','security_leader','security_member','viewer'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.security_group_status AS ENUM ('active','inactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.security_group_member_status AS ENUM ('active','expired','revoked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.permission_effect AS ENUM ('grant','deny');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.permission_scope_type AS ENUM (
  'all_current_future_campuses','all_current_campuses','selected_campuses','primary_campus','no_restriction'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.user_permission_status AS ENUM ('active','scheduled','expired','revoked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.security_audit_event_type AS ENUM (
  'security_group.created','security_group.updated','security_group.deactivated','security_group.deleted',
  'security_group_member.added','security_group_member.removed','security_group_member.expired',
  'user_permission.granted','user_permission.denied','user_permission.revoked','user_permission.expired',
  'security_audit_log.viewed','security.preview_access_used','tier.changed','tier.downgrade'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.security_audit_result AS ENUM ('success','failure');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status public.organization_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organization_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.membership_role NOT NULL DEFAULT 'viewer',
  status public.membership_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.campuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.permission_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.security_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status public.security_group_status NOT NULL DEFAULT 'active',
  effective_at timestamptz,
  expires_at timestamptz,
  system_template boolean NOT NULL DEFAULT false,
  high_risk boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

CREATE TABLE IF NOT EXISTS public.security_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  security_group_id uuid NOT NULL REFERENCES public.security_groups(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  effective_at timestamptz,
  expires_at timestamptz,
  status public.security_group_member_status NOT NULL DEFAULT 'active',
  campus_id uuid REFERENCES public.campuses(id) ON DELETE SET NULL,
  scope_type public.permission_scope_type NOT NULL DEFAULT 'no_restriction',
  assigned_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  removed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  removed_at timestamptz,
  notes text
);

CREATE TABLE IF NOT EXISTS public.security_group_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  security_group_id uuid NOT NULL REFERENCES public.security_groups(id) ON DELETE CASCADE,
  permission_definition_id uuid NOT NULL REFERENCES public.permission_definitions(id) ON DELETE RESTRICT,
  permission_effect public.permission_effect NOT NULL DEFAULT 'grant',
  scope_type public.permission_scope_type NOT NULL DEFAULT 'all_current_future_campuses',
  campus_id uuid REFERENCES public.campuses(id) ON DELETE SET NULL,
  resource_type text,
  resource_id text,
  effective_at timestamptz,
  expires_at timestamptz,
  assigned_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  reason text
);

CREATE TABLE IF NOT EXISTS public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_definition_id uuid NOT NULL REFERENCES public.permission_definitions(id) ON DELETE RESTRICT,
  permission_effect public.permission_effect NOT NULL DEFAULT 'grant',
  scope_type public.permission_scope_type NOT NULL DEFAULT 'all_current_future_campuses',
  campus_id uuid REFERENCES public.campuses(id) ON DELETE SET NULL,
  resource_type text,
  resource_id text,
  effective_at timestamptz,
  expires_at timestamptz,
  status public.user_permission_status NOT NULL DEFAULT 'active',
  assigned_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  reason text,
  notes text
);

CREATE TABLE IF NOT EXISTS public.security_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campus_id uuid REFERENCES public.campuses(id) ON DELETE SET NULL,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  security_group_id uuid REFERENCES public.security_groups(id) ON DELETE SET NULL,
  permission_definition_id uuid REFERENCES public.permission_definitions(id) ON DELETE SET NULL,
  event_type public.security_audit_event_type NOT NULL,
  previous_value jsonb,
  new_value jsonb,
  reason text,
  result public.security_audit_result NOT NULL DEFAULT 'success',
  failure_reason text,
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Helpers matching Production (SECURITY DEFINER + search_path)
CREATE OR REPLACE FUNCTION public.is_active_organization_member(requested_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_memberships m
    JOIN public.organizations c ON c.id = m.organization_id
    WHERE m.user_id = auth.uid()
      AND m.organization_id = requested_organization_id
      AND m.status = 'active'::public.membership_status
      AND c.status IN (
        'trial'::public.organization_status,
        'active'::public.organization_status
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.has_organization_role(
  requested_organization_id uuid,
  permitted_roles text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_memberships m
    JOIN public.organizations c ON c.id = m.organization_id
    WHERE m.user_id = auth.uid()
      AND m.organization_id = requested_organization_id
      AND m.status = 'active'::public.membership_status
      AND c.status IN (
        'trial'::public.organization_status,
        'active'::public.organization_status
      )
      AND m.role::text = ANY (permitted_roles)
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_organization_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_organization_role(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_organization_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_organization_role(uuid, text[]) TO authenticated, service_role;

-- Enable RLS + pre-117 authenticated-wide policies (the P0 defect under test)
ALTER TABLE public.security_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_group_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "security_groups_authenticated" ON public.security_groups;
DROP POLICY IF EXISTS "security_groups_admin_insert" ON public.security_groups;
DROP POLICY IF EXISTS "security_groups_admin_update" ON public.security_groups;
DROP POLICY IF EXISTS "security_groups_admin_delete" ON public.security_groups;
CREATE POLICY "security_groups_authenticated" ON public.security_groups FOR SELECT TO public USING (auth.role() = 'authenticated');
CREATE POLICY "security_groups_admin_insert" ON public.security_groups FOR INSERT TO public WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "security_groups_admin_update" ON public.security_groups FOR UPDATE TO public USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "security_groups_admin_delete" ON public.security_groups FOR DELETE TO public USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "security_group_members_authenticated" ON public.security_group_members;
DROP POLICY IF EXISTS "security_group_members_admin_insert" ON public.security_group_members;
DROP POLICY IF EXISTS "security_group_members_admin_update" ON public.security_group_members;
DROP POLICY IF EXISTS "security_group_members_admin_delete" ON public.security_group_members;
CREATE POLICY "security_group_members_authenticated" ON public.security_group_members FOR SELECT TO public USING (auth.role() = 'authenticated');
CREATE POLICY "security_group_members_admin_insert" ON public.security_group_members FOR INSERT TO public WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "security_group_members_admin_update" ON public.security_group_members FOR UPDATE TO public USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "security_group_members_admin_delete" ON public.security_group_members FOR DELETE TO public USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "security_group_permissions_authenticated" ON public.security_group_permissions;
DROP POLICY IF EXISTS "security_group_permissions_admin_insert" ON public.security_group_permissions;
DROP POLICY IF EXISTS "security_group_permissions_admin_update" ON public.security_group_permissions;
DROP POLICY IF EXISTS "security_group_permissions_admin_delete" ON public.security_group_permissions;
CREATE POLICY "security_group_permissions_authenticated" ON public.security_group_permissions FOR SELECT TO public USING (auth.role() = 'authenticated');
CREATE POLICY "security_group_permissions_admin_insert" ON public.security_group_permissions FOR INSERT TO public WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "security_group_permissions_admin_update" ON public.security_group_permissions FOR UPDATE TO public USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "security_group_permissions_admin_delete" ON public.security_group_permissions FOR DELETE TO public USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "user_permissions_authenticated" ON public.user_permissions;
DROP POLICY IF EXISTS "user_permissions_admin_insert" ON public.user_permissions;
DROP POLICY IF EXISTS "user_permissions_admin_update" ON public.user_permissions;
DROP POLICY IF EXISTS "user_permissions_admin_delete" ON public.user_permissions;
CREATE POLICY "user_permissions_authenticated" ON public.user_permissions FOR SELECT TO public USING (auth.role() = 'authenticated');
CREATE POLICY "user_permissions_admin_insert" ON public.user_permissions FOR INSERT TO public WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "user_permissions_admin_update" ON public.user_permissions FOR UPDATE TO public USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "user_permissions_admin_delete" ON public.user_permissions FOR DELETE TO public USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "security_audit_logs_select_authenticated" ON public.security_audit_logs;
DROP POLICY IF EXISTS "security_audit_logs_insert_authenticated" ON public.security_audit_logs;
DROP POLICY IF EXISTS "security_audit_logs_delete_service_role" ON public.security_audit_logs;
CREATE POLICY "security_audit_logs_select_authenticated" ON public.security_audit_logs FOR SELECT TO public USING (auth.role() = 'authenticated');
CREATE POLICY "security_audit_logs_insert_authenticated" ON public.security_audit_logs FOR INSERT TO public WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "security_audit_logs_delete_service_role" ON public.security_audit_logs FOR DELETE TO public USING (auth.role() = 'service_role');

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
