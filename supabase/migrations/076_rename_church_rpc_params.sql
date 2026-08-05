-- =============================================================================
-- 076_rename_church_rpc_params.sql
-- Rename input params p_church_id → p_organization_id and
-- requested_church_id → requested_organization_id.
--
-- CREATE OR REPLACE cannot change param names (42P13), so we:
--   1) RENAME each target aside (…__church_params) — RLS keeps working via OID
--   2) CREATE replacement with new param names under the original name
--   3) Rebind policies + dependent function bodies to the new OID
--   4) DROP aside functions
--
-- APPLY WITH the app deploy that sends p_organization_id in .rpc() calls.
-- Prefer: run 076, then deploy app immediately (short RPC window).
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_active_organization_member'
  ) THEN
    RAISE EXCEPTION '076 preflight failed — apply 073–075 first';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Rename-aside + recreate with new param names
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r record;
  aside text;
  def text;
  new_def text;
  recreated integer := 0;
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
      AND position('__church_params' in p.proname) = 0
      AND (
        pg_get_function_identity_arguments(p.oid) ~ 'p_church_id|requested_church_id'
      )
    ORDER BY length(p.proname) DESC, p.proname
  LOOP
    aside := r.proname || '__church_params';

    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
      WHERE n2.nspname = 'public'
        AND p2.proname = aside
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      RAISE NOTICE '076 skip % — aside already exists', r.proname;
      CONTINUE;
    END IF;

    EXECUTE format(
      'ALTER FUNCTION public.%I(%s) RENAME TO %I',
      r.proname,
      r.args,
      aside
    );

    def := r.def;
    new_def := def;
    new_def := replace(new_def, 'requested_church_id', 'requested_organization_id');
    new_def := replace(new_def, 'p_church_id', 'p_organization_id');
    -- pg_get_functiondef embeds the old name; after rename the CREATE must use it
    -- The def still says CREATE FUNCTION … original_name … which is what we want.

    BEGIN
      EXECUTE new_def;
      -- pg_get_functiondef does not restore ACLs; re-grant typical app roles
      BEGIN
        EXECUTE format(
          'GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated',
          r.proname,
          r.args
        );
        EXECUTE format(
          'GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role',
          r.proname,
          r.args
        );
      EXCEPTION WHEN undefined_object OR invalid_grant_operation THEN
        NULL;
      END;
      recreated := recreated + 1;
      RAISE NOTICE '076 recreated %(%) with organization params', r.proname, r.args;
    EXCEPTION WHEN others THEN
      -- Roll the aside back so the system is not left half-migrated for this fn
      EXECUTE format(
        'ALTER FUNCTION public.%I(%s) RENAME TO %I',
        aside,
        r.args,
        r.proname
      );
      RAISE EXCEPTION '076 failed recreating %(%) — %', r.proname, r.args, SQLERRM;
    END;
  END LOOP;

  IF recreated = 0 THEN
    RAISE EXCEPTION '076 failed — no functions recreated (already applied?)';
  END IF;

  RAISE NOTICE '076 recreated % function(s) with organization param names', recreated;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Rebind dependent function bodies that still call __church_params names
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r record;
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
      AND position('__church_params' in p.proname) = 0
      AND pg_get_functiondef(p.oid) LIKE '%__church_params%'
  LOOP
    def := r.def;
    new_def := replace(def, '__church_params', '');
    IF new_def IS DISTINCT FROM def THEN
      BEGIN
        EXECUTE new_def;
        updated := updated + 1;
        RAISE NOTICE '076 rebound function %(%)', r.proname, r.args;
      EXCEPTION WHEN others THEN
        RAISE NOTICE '076 could not rebind %(%) — %', r.proname, r.args, SQLERRM;
      END;
    END IF;
  END LOOP;

  RAISE NOTICE '076 rebound % dependent function(s)', updated;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Rebind policies (re-resolve function names → new OIDs)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r record;
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
      AND (
        COALESCE(pg_get_expr(p.polqual, p.polrelid), '') LIKE '%__church_params%'
        OR COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), '') LIKE '%__church_params%'
      )
  LOOP
    qual := r.qual;
    with_check := r.with_check;
    new_qual := CASE WHEN qual IS NULL THEN NULL ELSE replace(qual, '__church_params', '') END;
    new_with_check := CASE
      WHEN with_check IS NULL THEN NULL
      ELSE replace(with_check, '__church_params', '')
    END;

    IF new_qual IS DISTINCT FROM qual AND new_qual IS NOT NULL THEN
      EXECUTE format(
        'ALTER POLICY %I ON %I.%I USING (%s)',
        r.policy_name, r.schema_name, r.table_name, new_qual
      );
      updated := updated + 1;
    END IF;

    IF new_with_check IS DISTINCT FROM with_check AND new_with_check IS NOT NULL THEN
      EXECUTE format(
        'ALTER POLICY %I ON %I.%I WITH CHECK (%s)',
        r.policy_name, r.schema_name, r.table_name, new_with_check
      );
      updated := updated + 1;
    END IF;
  END LOOP;

  RAISE NOTICE '076 rebound % policy expression(s)', updated;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Drop aside functions
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r record;
  dropped integer := 0;
BEGIN
  FOR r IN
    SELECT
      p.proname,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proname LIKE '%\_\_church_params' ESCAPE '\'
    ORDER BY length(p.proname) DESC
  LOOP
    EXECUTE format('DROP FUNCTION public.%I(%s)', r.proname, r.args);
    dropped := dropped + 1;
    RAISE NOTICE '076 dropped aside %(%)', r.proname, r.args;
  END LOOP;

  RAISE NOTICE '076 dropped % aside function(s)', dropped;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Post-checks
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  leftover text;
BEGIN
  IF pg_get_function_identity_arguments(
    'public.is_active_organization_member(uuid)'::regprocedure
  ) !~ 'requested_organization_id' THEN
    RAISE EXCEPTION
      '076 post-check failed — is_active_organization_member params not renamed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND pg_get_function_identity_arguments(p.oid) ~ 'p_church_id|requested_church_id'
  ) THEN
    SELECT string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ')
    INTO leftover
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND pg_get_function_identity_arguments(p.oid) ~ 'p_church_id|requested_church_id';

    RAISE EXCEPTION '076 post-check failed — leftover church params: %', leftover;
  END IF;
END $$;

-- Refresh PostgREST schema cache when available
DO $$
BEGIN
  PERFORM pg_notify('pgrst', 'reload schema');
EXCEPTION WHEN others THEN
  NULL;
END $$;

COMMIT;
