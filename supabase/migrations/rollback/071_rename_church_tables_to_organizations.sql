-- =============================================================================
-- ROLLBACK: 071_rename_church_tables_to_organizations
--
-- Location: supabase/migrations/rollback/
-- DO NOT place this in the auto-applied migrations stream.
-- Apply manually only to reverse a successful 071 forward migration.
--
-- Coordinate with application rollback to code that uses .from("churches") etc.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Preflight — forward rename must already be present
-- ---------------------------------------------------------------------------

DO $$
DECLARE
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
    RAISE EXCEPTION
      '071 rollback preflight failed — missing organization table(s): %', missing;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Reverse table renames
-- ---------------------------------------------------------------------------

ALTER TABLE public.organizations RENAME TO churches;
ALTER TABLE public.organization_memberships RENAME TO church_memberships;
ALTER TABLE public.organization_membership_roles RENAME TO church_membership_roles;
ALTER TABLE public.organization_invitations RENAME TO church_invitations;
ALTER TABLE public.organization_contacts RENAME TO church_contacts;
ALTER TABLE public.organization_threat_levels RENAME TO church_threat_levels;
ALTER TABLE public.organization_notification_settings RENAME TO church_notification_settings;
ALTER TABLE public.organization_schedule_settings RENAME TO church_schedule_settings;
ALTER TABLE public.organization_policy_settings RENAME TO church_policy_settings;
ALTER TABLE public.organization_subscriptions RENAME TO church_subscriptions;
ALTER TABLE public.organization_entitlement_overrides RENAME TO church_entitlement_overrides;
ALTER TABLE public.organization_role_settings RENAME TO church_role_settings;
ALTER TABLE public.training_organization_settings RENAME TO training_church_settings;

-- ---------------------------------------------------------------------------
-- 2. Rewrite function bodies back to church_* table names
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
        'organization_membership_roles|organization_entitlement_overrides|'
        'organization_notification_settings|organization_schedule_settings|'
        'organization_policy_settings|training_organization_settings|'
        'organization_threat_levels|organization_subscriptions|organization_role_settings|'
        'organization_memberships|organization_invitations|organization_contacts|'
        '[[:<:]]organizations[[:>:]]'
      )
  LOOP
    def := pg_get_functiondef(r.oid);
    new_def := def;

    new_def := replace(new_def, '"organization_membership_roles"', '"church_membership_roles"');
    new_def := replace(new_def, '"organization_entitlement_overrides"', '"church_entitlement_overrides"');
    new_def := replace(new_def, '"organization_notification_settings"', '"church_notification_settings"');
    new_def := replace(new_def, '"organization_schedule_settings"', '"church_schedule_settings"');
    new_def := replace(new_def, '"organization_policy_settings"', '"church_policy_settings"');
    new_def := replace(new_def, '"training_organization_settings"', '"training_church_settings"');
    new_def := replace(new_def, '"organization_threat_levels"', '"church_threat_levels"');
    new_def := replace(new_def, '"organization_subscriptions"', '"church_subscriptions"');
    new_def := replace(new_def, '"organization_role_settings"', '"church_role_settings"');
    new_def := replace(new_def, '"organization_memberships"', '"church_memberships"');
    new_def := replace(new_def, '"organization_invitations"', '"church_invitations"');
    new_def := replace(new_def, '"organization_contacts"', '"church_contacts"');
    new_def := replace(new_def, '"organizations"', '"churches"');

    new_def := regexp_replace(new_def, '[[:<:]]organization_membership_roles[[:>:]]', 'church_membership_roles', 'g');
    new_def := regexp_replace(new_def, '[[:<:]]organization_entitlement_overrides[[:>:]]', 'church_entitlement_overrides', 'g');
    new_def := regexp_replace(new_def, '[[:<:]]organization_notification_settings[[:>:]]', 'church_notification_settings', 'g');
    new_def := regexp_replace(new_def, '[[:<:]]organization_schedule_settings[[:>:]]', 'church_schedule_settings', 'g');
    new_def := regexp_replace(new_def, '[[:<:]]organization_policy_settings[[:>:]]', 'church_policy_settings', 'g');
    new_def := regexp_replace(new_def, '[[:<:]]training_organization_settings[[:>:]]', 'training_church_settings', 'g');
    new_def := regexp_replace(new_def, '[[:<:]]organization_threat_levels[[:>:]]', 'church_threat_levels', 'g');
    new_def := regexp_replace(new_def, '[[:<:]]organization_subscriptions[[:>:]]', 'church_subscriptions', 'g');
    new_def := regexp_replace(new_def, '[[:<:]]organization_role_settings[[:>:]]', 'church_role_settings', 'g');
    new_def := regexp_replace(new_def, '[[:<:]]organization_memberships[[:>:]]', 'church_memberships', 'g');
    new_def := regexp_replace(new_def, '[[:<:]]organization_invitations[[:>:]]', 'church_invitations', 'g');
    new_def := regexp_replace(new_def, '[[:<:]]organization_contacts[[:>:]]', 'church_contacts', 'g');
    new_def := regexp_replace(new_def, '[[:<:]]organizations[[:>:]]', 'churches', 'g');

    IF new_def IS DISTINCT FROM def THEN
      EXECUTE new_def;
      updated_count := updated_count + 1;
      RAISE NOTICE '071 rollback updated function %.%(%)', 'public', r.proname, r.args;
    END IF;
  END LOOP;

  RAISE NOTICE '071 rollback function rewrite complete — % function(s) updated', updated_count;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Post-checks
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = 'churches'
  ) THEN
    RAISE EXCEPTION '071 rollback post-check failed — churches table missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = 'organizations'
  ) THEN
    RAISE EXCEPTION '071 rollback post-check failed — organizations table still present';
  END IF;
END $$;

COMMIT;
