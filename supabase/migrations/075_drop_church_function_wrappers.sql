-- =============================================================================
-- 075_drop_church_function_wrappers.sql
-- Phase D: retarget RLS / Storage policies and function bodies to
-- organization_* names, then drop church_* compatibility wrappers from 073.
--
-- APPLY ONLY AFTER:
--   1. 073 + 074 are applied
--   2. App deploy that calls organization_* RPCs is live
--      (create_organization_with_owner, list_organization_team_memberships, …)
--
-- Keeps p_church_id parameter names (CREATE OR REPLACE cannot rename them).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Preflight
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_active_organization_member'
  ) THEN
    RAISE EXCEPTION '075 preflight failed — apply 073 first (organization_* functions)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_active_church_member'
  ) THEN
    RAISE EXCEPTION
      '075 preflight failed — church_* wrappers missing (already dropped?)';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Rewrite policy expressions (public + storage)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r record;
  pair record;
  qual text;
  with_check text;
  new_qual text;
  new_with_check text;
  updated integer := 0;
BEGIN
  FOR r IN
    SELECT
      n.nspname AS schema_name,
      c.relname AS table_name,
      p.polname AS policy_name,
      pg_get_expr(p.polqual, p.polrelid) AS qual,
      pg_get_expr(p.polwithcheck, p.polrelid) AS with_check
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('public', 'storage')
  LOOP
    qual := r.qual;
    with_check := r.with_check;
    new_qual := qual;
    new_with_check := with_check;

    FOR pair IN
      SELECT
        church.proname AS church_name,
        org.proname AS org_name
      FROM pg_proc church
      JOIN pg_namespace cn ON cn.oid = church.pronamespace
      JOIN pg_proc org
        ON org.pronamespace = church.pronamespace
       AND org.proname = replace(church.proname, 'church', 'organization')
       AND pg_get_function_identity_arguments(org.oid)
         = pg_get_function_identity_arguments(church.oid)
      WHERE cn.nspname = 'public'
        AND church.prokind = 'f'
        AND position('church' in church.proname) > 0
        AND position('organization' in church.proname) = 0
        AND church.proname IS DISTINCT FROM org.proname
      ORDER BY length(church.proname) DESC
    LOOP
      IF new_qual IS NOT NULL THEN
        new_qual := replace(new_qual, pair.church_name, pair.org_name);
      END IF;
      IF new_with_check IS NOT NULL THEN
        new_with_check := replace(new_with_check, pair.church_name, pair.org_name);
      END IF;
    END LOOP;

    IF new_qual IS DISTINCT FROM qual AND new_qual IS NOT NULL THEN
      EXECUTE format(
        'ALTER POLICY %I ON %I.%I USING (%s)',
        r.policy_name,
        r.schema_name,
        r.table_name,
        new_qual
      );
      updated := updated + 1;
    END IF;

    IF new_with_check IS DISTINCT FROM with_check AND new_with_check IS NOT NULL THEN
      EXECUTE format(
        'ALTER POLICY %I ON %I.%I WITH CHECK (%s)',
        r.policy_name,
        r.schema_name,
        r.table_name,
        new_with_check
      );
      updated := updated + 1;
    END IF;
  END LOOP;

  RAISE NOTICE '075 rewritten % policy expression(s)', updated;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Rewrite non-wrapper function bodies that still call church_* names
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r record;
  pair record;
  def text;
  new_def text;
  updated integer := 0;
BEGIN
  FOR r IN
    SELECT
      p.oid,
      p.proname,
      pg_get_function_identity_arguments(p.oid) AS args,
      pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      -- Skip wrappers (thin SQL delegates); they will be dropped
      AND NOT (
        position('church' in p.proname) > 0
        AND position('organization' in p.proname) = 0
        AND EXISTS (
          SELECT 1
          FROM pg_proc o
          JOIN pg_namespace onsp ON onsp.oid = o.pronamespace
          WHERE onsp.nspname = 'public'
            AND o.proname = replace(p.proname, 'church', 'organization')
            AND pg_get_function_identity_arguments(o.oid)
              = pg_get_function_identity_arguments(p.oid)
        )
      )
      AND pg_get_functiondef(p.oid) ~ 'church'
    ORDER BY length(p.proname) DESC, p.proname
  LOOP
    def := r.def;
    new_def := def;

    FOR pair IN
      SELECT
        church.proname AS church_name,
        org.proname AS org_name
      FROM pg_proc church
      JOIN pg_namespace cn ON cn.oid = church.pronamespace
      JOIN pg_proc org
        ON org.pronamespace = church.pronamespace
       AND org.proname = replace(church.proname, 'church', 'organization')
       AND pg_get_function_identity_arguments(org.oid)
         = pg_get_function_identity_arguments(church.oid)
      WHERE cn.nspname = 'public'
        AND church.prokind = 'f'
        AND position('church' in church.proname) > 0
        AND position('organization' in church.proname) = 0
        AND church.proname IS DISTINCT FROM org.proname
      ORDER BY length(church.proname) DESC
    LOOP
      new_def := replace(new_def, pair.church_name, pair.org_name);
    END LOOP;

    IF new_def IS DISTINCT FROM def THEN
      BEGIN
        EXECUTE new_def;
        updated := updated + 1;
        RAISE NOTICE '075 updated function %(%)', r.proname, r.args;
      EXCEPTION WHEN others THEN
        RAISE NOTICE '075 could not rewrite %(%) — %', r.proname, r.args, SQLERRM;
      END;
    END IF;
  END LOOP;

  RAISE NOTICE '075 rewritten % function source(s)', updated;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Drop church_* wrappers
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r record;
  dropped integer := 0;
BEGIN
  FOR r IN
    SELECT
      church.proname,
      pg_get_function_identity_arguments(church.oid) AS args
    FROM pg_proc church
    JOIN pg_namespace cn ON cn.oid = church.pronamespace
    JOIN pg_proc org
      ON org.pronamespace = church.pronamespace
     AND org.proname = replace(church.proname, 'church', 'organization')
     AND pg_get_function_identity_arguments(org.oid)
       = pg_get_function_identity_arguments(church.oid)
    WHERE cn.nspname = 'public'
      AND church.prokind = 'f'
      AND position('church' in church.proname) > 0
      AND position('organization' in church.proname) = 0
      AND church.proname IS DISTINCT FROM org.proname
    ORDER BY length(church.proname) DESC, church.proname
  LOOP
    EXECUTE format(
      'DROP FUNCTION public.%I(%s)',
      r.proname,
      r.args
    );
    dropped := dropped + 1;
    RAISE NOTICE '075 dropped wrapper %(%)', r.proname, r.args;
  END LOOP;

  IF dropped = 0 THEN
    RAISE EXCEPTION '075 failed — no church_* wrappers dropped';
  END IF;

  RAISE NOTICE '075 dropped % church_* wrapper(s)', dropped;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Post-checks
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  leftover text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_active_organization_member'
  ) THEN
    RAISE EXCEPTION '075 post-check failed — is_active_organization_member missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_active_church_member'
  ) THEN
    RAISE EXCEPTION '075 post-check failed — is_active_church_member wrapper still present';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'create_church_with_owner'
  ) THEN
    RAISE EXCEPTION '075 post-check failed — create_church_with_owner wrapper still present';
  END IF;

  SELECT string_agg(p.proname, ', ' ORDER BY p.proname)
  INTO leftover
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND position('church' in p.proname) > 0
    AND position('organization' in p.proname) = 0;

  IF leftover IS NOT NULL THEN
    RAISE NOTICE '075 remaining public *church* functions (review): %', leftover;
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- After apply:
--   Smoke-test login, switch church, Team, Incidents, Storage, create church
-- =============================================================================
