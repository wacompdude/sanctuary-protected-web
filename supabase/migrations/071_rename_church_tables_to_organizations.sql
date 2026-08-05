-- =============================================================================
-- 071_rename_church_tables_to_organizations.sql
-- Phase 2 deliverable: Option A — rename tables only; keep church_id columns.
--
-- DO NOT APPLY until:
--   1. Application code referencing .from("church*") is ready (Phase 3–5), OR
--   2. A coordinated maintenance window will deploy app + migration together.
--
-- Strategy: Strategy A (coordinated maintenance deployment).
-- Rollback: see migrations/rollback/071_rename_church_tables_to_organizations.sql
--
-- What this does:
--   1. Preflight checks (tables exist; targets do not).
--   2. ALTER TABLE … RENAME for 13 tables (data/PK/FK/RLS attachments preserved).
--   3. Rewrite public function source that still hard-codes old table names
--      (PostgreSQL does NOT rewrite plpgsql/sql bodies on table rename).
--   4. Optional cosmetic renames are NOT included (indexes/constraints/enums/
--      function names kept for lower risk).
--
-- What this deliberately does NOT do:
--   - Rename church_id / church_membership_id columns (Option B — later project)
--   - Rename enums (church_status, etc.)
--   - Rename SQL functions (is_active_church_member, create_church_with_owner, …)
--   - Rename Storage object paths (churches/{id}/…)
--   - Change customer-facing UI terminology
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Preflight
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  missing text;
  conflict text;
BEGIN
  SELECT string_agg(t, ', ')
  INTO missing
  FROM unnest(ARRAY[
    'churches',
    'church_memberships',
    'church_membership_roles',
    'church_invitations',
    'church_contacts',
    'church_threat_levels',
    'church_notification_settings',
    'church_schedule_settings',
    'church_policy_settings',
    'church_subscriptions',
    'church_entitlement_overrides',
    'church_role_settings',
    'training_church_settings'
  ]) AS t
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname = t
  );

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION
      '071 preflight failed — missing source table(s): %', missing;
  END IF;

  SELECT string_agg(t, ', ')
  INTO conflict
  FROM unnest(ARRAY[
    'organizations',
    'organization_memberships',
    'organization_membership_roles',
    'organization_invitations',
    'organization_contacts',
    'organization_threat_levels',
    'organization_notification_settings',
    'organization_schedule_settings',
    'organization_policy_settings',
    'organization_subscriptions',
    'organization_entitlement_overrides',
    'organization_role_settings',
    'training_organization_settings'
  ]) AS t
  WHERE EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'v', 'm', 'p')
      AND c.relname = t
  );

  IF conflict IS NOT NULL THEN
    RAISE EXCEPTION
      '071 preflight failed — target name(s) already exist: %', conflict;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Table renames (OID-based FKs / RLS policy trees follow the relation)
-- ---------------------------------------------------------------------------

ALTER TABLE public.church_membership_roles RENAME TO organization_membership_roles;
ALTER TABLE public.church_entitlement_overrides RENAME TO organization_entitlement_overrides;
ALTER TABLE public.church_notification_settings RENAME TO organization_notification_settings;
ALTER TABLE public.church_schedule_settings RENAME TO organization_schedule_settings;
ALTER TABLE public.church_policy_settings RENAME TO organization_policy_settings;
ALTER TABLE public.training_church_settings RENAME TO training_organization_settings;
ALTER TABLE public.church_threat_levels RENAME TO organization_threat_levels;
ALTER TABLE public.church_subscriptions RENAME TO organization_subscriptions;
ALTER TABLE public.church_role_settings RENAME TO organization_role_settings;
ALTER TABLE public.church_memberships RENAME TO organization_memberships;
ALTER TABLE public.church_invitations RENAME TO organization_invitations;
ALTER TABLE public.church_contacts RENAME TO organization_contacts;
ALTER TABLE public.churches RENAME TO organizations;

COMMENT ON TABLE public.organizations IS
  'Tenant root. Presented as Church throughout the Sanctuary Protected UI.';
COMMENT ON TABLE public.organization_memberships IS
  'User membership in an organization (UI: church membership).';

-- ---------------------------------------------------------------------------
-- 2. Rewrite function bodies that hard-code old table names
--    Longest identifiers first. Word-boundary aware. Does not rename church_id.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r record;
  def text;
  new_def text;
  updated_count integer := 0;
BEGIN
  FOR r IN
    SELECT
      p.oid,
      p.proname,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND pg_get_functiondef(p.oid) ~ (
        'church_membership_roles|church_entitlement_overrides|'
        'church_notification_settings|church_schedule_settings|'
        'church_policy_settings|training_church_settings|'
        'church_threat_levels|church_subscriptions|church_role_settings|'
        'church_memberships|church_invitations|church_contacts|'
        '[[:<:]]churches[[:>:]]'
      )
  LOOP
    def := pg_get_functiondef(r.oid);
    new_def := def;

    -- Quoted identifiers
    new_def := replace(new_def, '"church_membership_roles"', '"organization_membership_roles"');
    new_def := replace(new_def, '"church_entitlement_overrides"', '"organization_entitlement_overrides"');
    new_def := replace(new_def, '"church_notification_settings"', '"organization_notification_settings"');
    new_def := replace(new_def, '"church_schedule_settings"', '"organization_schedule_settings"');
    new_def := replace(new_def, '"church_policy_settings"', '"organization_policy_settings"');
    new_def := replace(new_def, '"training_church_settings"', '"training_organization_settings"');
    new_def := replace(new_def, '"church_threat_levels"', '"organization_threat_levels"');
    new_def := replace(new_def, '"church_subscriptions"', '"organization_subscriptions"');
    new_def := replace(new_def, '"church_role_settings"', '"organization_role_settings"');
    new_def := replace(new_def, '"church_memberships"', '"organization_memberships"');
    new_def := replace(new_def, '"church_invitations"', '"organization_invitations"');
    new_def := replace(new_def, '"church_contacts"', '"organization_contacts"');
    new_def := replace(new_def, '"churches"', '"organizations"');

    -- Unquoted / schema-qualified (word boundaries; longest first)
    new_def := regexp_replace(new_def, '[[:<:]]church_membership_roles[[:>:]]', 'organization_membership_roles', 'g');
    new_def := regexp_replace(new_def, '[[:<:]]church_entitlement_overrides[[:>:]]', 'organization_entitlement_overrides', 'g');
    new_def := regexp_replace(new_def, '[[:<:]]church_notification_settings[[:>:]]', 'organization_notification_settings', 'g');
    new_def := regexp_replace(new_def, '[[:<:]]church_schedule_settings[[:>:]]', 'organization_schedule_settings', 'g');
    new_def := regexp_replace(new_def, '[[:<:]]church_policy_settings[[:>:]]', 'organization_policy_settings', 'g');
    new_def := regexp_replace(new_def, '[[:<:]]training_church_settings[[:>:]]', 'training_organization_settings', 'g');
    new_def := regexp_replace(new_def, '[[:<:]]church_threat_levels[[:>:]]', 'organization_threat_levels', 'g');
    new_def := regexp_replace(new_def, '[[:<:]]church_subscriptions[[:>:]]', 'organization_subscriptions', 'g');
    new_def := regexp_replace(new_def, '[[:<:]]church_role_settings[[:>:]]', 'organization_role_settings', 'g');
    new_def := regexp_replace(new_def, '[[:<:]]church_memberships[[:>:]]', 'organization_memberships', 'g');
    new_def := regexp_replace(new_def, '[[:<:]]church_invitations[[:>:]]', 'organization_invitations', 'g');
    new_def := regexp_replace(new_def, '[[:<:]]church_contacts[[:>:]]', 'organization_contacts', 'g');
    new_def := regexp_replace(new_def, '[[:<:]]churches[[:>:]]', 'organizations', 'g');

    IF new_def IS DISTINCT FROM def THEN
      EXECUTE new_def;
      updated_count := updated_count + 1;
      RAISE NOTICE '071 updated function %.%(%)', 'public', r.proname, r.args;
    END IF;
  END LOOP;

  RAISE NOTICE '071 function rewrite complete — % function(s) updated', updated_count;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Post-checks (in-transaction)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  leftover text;
  missing text;
BEGIN
  SELECT string_agg(t, ', ')
  INTO missing
  FROM unnest(ARRAY[
    'organizations',
    'organization_memberships',
    'organization_membership_roles',
    'organization_invitations',
    'organization_contacts',
    'organization_threat_levels',
    'organization_notification_settings',
    'organization_schedule_settings',
    'organization_policy_settings',
    'organization_subscriptions',
    'organization_entitlement_overrides',
    'organization_role_settings',
    'training_organization_settings'
  ]) AS t
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = t
  );

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION '071 post-check failed — missing renamed table(s): %', missing;
  END IF;

  SELECT string_agg(t, ', ')
  INTO leftover
  FROM unnest(ARRAY[
    'churches',
    'church_memberships',
    'church_membership_roles',
    'church_invitations',
    'church_contacts',
    'church_threat_levels',
    'church_notification_settings',
    'church_schedule_settings',
    'church_policy_settings',
    'church_subscriptions',
    'church_entitlement_overrides',
    'church_role_settings',
    'training_church_settings'
  ]) AS t
  WHERE EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = t
  );

  IF leftover IS NOT NULL THEN
    RAISE EXCEPTION '071 post-check failed — old table name(s) still present: %', leftover;
  END IF;

  -- Fail if any public function body still references old physical table names
  IF EXISTS (
    SELECT 1
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
  ) THEN
    RAISE EXCEPTION
      '071 post-check failed — at least one public function still references old church_* table names';
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- After apply (outside this migration):
--   1. Deploy application that uses .from("organizations") etc.
--   2. Run verification queries in:
--        supabase/migrations/rollback/071_verify_organization_rename.sql
--   3. Smoke-test login, church switch, create church, incidents, billing UI
-- =============================================================================
