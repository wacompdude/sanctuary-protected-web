-- =============================================================================
-- Verification queries for 071 church → organization table rename (Option A)
-- Run AFTER forward migration (and after app deploy in the same window).
-- =============================================================================

-- 1) Renamed tables present / old names absent
SELECT relname
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND relname IN (
    'organizations', 'organization_memberships', 'organization_membership_roles',
    'organization_invitations', 'organization_contacts', 'organization_threat_levels',
    'organization_notification_settings', 'organization_schedule_settings',
    'organization_policy_settings', 'organization_subscriptions',
    'organization_entitlement_overrides', 'organization_role_settings',
    'training_organization_settings',
    'churches', 'church_memberships', 'church_membership_roles',
    'church_invitations', 'church_contacts', 'church_threat_levels',
    'church_notification_settings', 'church_schedule_settings',
    'church_policy_settings', 'church_subscriptions',
    'church_entitlement_overrides', 'church_role_settings',
    'training_church_settings'
  )
ORDER BY relname;

-- Expect: only organization_* / training_organization_settings rows.

-- 2) Row counts (compare to pre-migration snapshot you recorded)
SELECT 'organizations' AS table_name, count(*) FROM public.organizations
UNION ALL SELECT 'organization_memberships', count(*) FROM public.organization_memberships
UNION ALL SELECT 'organization_membership_roles', count(*) FROM public.organization_membership_roles
UNION ALL SELECT 'organization_invitations', count(*) FROM public.organization_invitations
UNION ALL SELECT 'organization_contacts', count(*) FROM public.organization_contacts
UNION ALL SELECT 'organization_threat_levels', count(*) FROM public.organization_threat_levels
UNION ALL SELECT 'organization_notification_settings', count(*) FROM public.organization_notification_settings
UNION ALL SELECT 'organization_schedule_settings', count(*) FROM public.organization_schedule_settings
UNION ALL SELECT 'organization_policy_settings', count(*) FROM public.organization_policy_settings
UNION ALL SELECT 'organization_subscriptions', count(*) FROM public.organization_subscriptions
UNION ALL SELECT 'organization_entitlement_overrides', count(*) FROM public.organization_entitlement_overrides
UNION ALL SELECT 'organization_role_settings', count(*) FROM public.organization_role_settings
UNION ALL SELECT 'training_organization_settings', count(*) FROM public.training_organization_settings
ORDER BY 1;

-- 3) church_id columns still exist on key tables (Option A)
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name IN ('church_id', 'church_membership_id')
  AND table_name IN (
    'organization_memberships', 'campuses', 'incidents',
    'organization_subscriptions', 'organization_membership_roles'
  )
ORDER BY table_name, column_name;

-- 4) FK from organization_memberships.church_id → organizations.id
SELECT
  conrelid::regclass AS from_table,
  confrelid::regclass AS to_table,
  conname
FROM pg_constraint
WHERE contype = 'f'
  AND conrelid = 'public.organization_memberships'::regclass
  AND confrelid = 'public.organizations'::regclass;

-- 5) RLS still enabled on renamed tables
SELECT c.relname, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'organizations', 'organization_memberships', 'organization_invitations',
    'organization_subscriptions'
  )
ORDER BY 1;

-- 6) Helper functions still exist (names unchanged under Option A)
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'is_active_church_member',
    'has_church_role',
    'create_church_with_owner',
    'accept_church_invitation',
    'list_church_team_memberships',
    'assign_default_church_subscription'
  )
ORDER BY 1;

-- 7) No public function body still references old physical table names
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
  AND pg_get_functiondef(p.oid) ~ (
    '[[:<:]]church_membership_roles[[:>:]]|'
    '[[:<:]]church_entitlement_overrides[[:>:]]|'
    '[[:<:]]church_notification_settings[[:>:]]|'
    '[[:<:]]church_schedule_settings[[:>:]]|'
    '[[:<:]]church_policy_settings[[:>:]]|'
    '[[:<:]]training_church_settings[[:>:]]|'
    '[[:<:]]church_threat_levels[[:>:]]|'
    '[[:<:]]church_subscriptions[[:>:]]|'
    '[[:<:]]church_role_settings[[:>:]]|'
    '[[:<:]]church_memberships[[:>:]]|'
    '[[:<:]]church_invitations[[:>:]]|'
    '[[:<:]]church_contacts[[:>:]]|'
    '[[:<:]]churches[[:>:]]'
  )
ORDER BY 1;

-- Expect: zero rows.

-- 8) Smoke RPCs (run as a logged-in test only in a safe environment)
-- SELECT public.is_active_church_member('<a-known-church-uuid>'::uuid);
-- SELECT public.membership_role_rank('owner');
