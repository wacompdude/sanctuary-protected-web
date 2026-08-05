-- =============================================================================
-- Verification queries for 072 church_* → organization_* COLUMN rename
-- Run AFTER forward migration (and after app deploy in the same window).
-- =============================================================================

-- 1) No leftover church_id / church_membership_id columns
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name IN ('church_id', 'church_membership_id')
ORDER BY table_name, column_name;
-- Expect: zero rows

-- 2) organization_id present — count of tables
SELECT count(*) AS tables_with_organization_id
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'organization_id';
-- Expect: ~94+ (match your pre-migration church_id count)

-- 3) organization_membership_id present
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'organization_membership_id'
ORDER BY table_name;
-- Expect: campus_memberships, organization_membership_roles

-- 4) Key tables have organization_id
SELECT table_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'organization_id'
  AND table_name IN (
    'organizations',  -- should NOT appear (organizations has id, not organization_id)
    'organization_memberships',
    'organization_membership_roles',
    'organization_subscriptions',
    'campuses',
    'campus_memberships',
    'incidents',
    'notifications',
    'security_groups',
    'audit_logs',
    'training_organization_settings'
  )
ORDER BY table_name;
-- Expect: all listed except organizations

-- 5) Row counts (compare to pre-migration snapshot)
SELECT 'organizations' AS table_name, count(*) FROM public.organizations
UNION ALL SELECT 'organization_memberships', count(*) FROM public.organization_memberships
UNION ALL SELECT 'campuses', count(*) FROM public.campuses
UNION ALL SELECT 'incidents', count(*) FROM public.incidents
UNION ALL SELECT 'notifications', count(*) FROM public.notifications
UNION ALL SELECT 'organization_subscriptions', count(*) FROM public.organization_subscriptions
ORDER BY 1;

-- 6) Null counts on organization_id for a required table (should be 0)
SELECT
  count(*) FILTER (WHERE organization_id IS NULL) AS null_org_ids,
  count(*) AS total
FROM public.organization_memberships;

-- 7) FK still valid: memberships.organization_id → organizations.id
SELECT
  conrelid::regclass AS from_table,
  confrelid::regclass AS to_table,
  conname,
  pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE contype = 'f'
  AND conrelid = 'public.organization_memberships'::regclass
  AND confrelid = 'public.organizations'::regclass;

-- 8) Unique (organization_id, user_id) still present on memberships
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.organization_memberships'::regclass
  AND contype IN ('u', 'p')
ORDER BY conname;

-- 9) RLS still enabled on key tenant tables
SELECT c.relname, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'organizations', 'organization_memberships', 'incidents',
    'notifications', 'campuses', 'organization_subscriptions'
  )
ORDER BY 1;

-- 10) Sample policies — expressions should reference organization_id (not church_id)
SELECT schemaname, tablename, policyname, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('organization_memberships', 'incidents', 'campuses')
ORDER BY tablename, policyname;

-- 11) Helper function NAMES and INPUT PARAM NAMES unchanged
--     (p_church_id / requested_church_id retained — CREATE OR REPLACE cannot rename them)
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'is_active_church_member',
    'has_church_role',
    'can_manage_church_settings',
    'create_church_with_owner',
    'list_church_team_memberships',
    'accept_church_invitation',
    'assign_default_church_subscription',
    'church_id_from_branding_path',
    'church_id_from_incident_media_path'
  )
ORDER BY p.proname;
-- Expect: args still show requested_church_id / p_church_id where applicable

-- 12) Function bodies should use organization_id for COLUMNS; param names may still
--     contain church_id. Spot-check one helper:
SELECT pg_get_functiondef(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'is_active_church_member'
LIMIT 1;
-- Expect: body queries organization_memberships.organization_id = requested_church_id

-- 13) Spot-check auth helper still callable (run as a logged-in test later)
-- SELECT public.is_active_church_member('<a-real-organization-uuid>'::uuid);
