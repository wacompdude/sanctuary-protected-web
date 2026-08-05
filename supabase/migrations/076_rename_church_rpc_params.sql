-- =============================================================================
-- 076_rename_church_rpc_params.sql
-- Rename input params p_church_id → p_organization_id and
-- requested_church_id → requested_organization_id.
--
-- CREATE OR REPLACE cannot change param names (42P13), so we:
--   1) RENAME each target aside (_mig076_<oid>) — RLS keeps working via OID
--      (OID-based aside names avoid Postgres 63-char identifier truncation)
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

CREATE TEMP TABLE mig076_aside (
  proc_oid oid PRIMARY KEY,
  original_name text NOT NULL,
  aside_name text NOT NULL,
  args text NOT NULL
) ON COMMIT DROP;

-- ---------------------------------------------------------------------------
-- 1. Rename-aside + recreate with new param names
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r record;
  aside text;
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
      AND p.proname NOT LIKE '\_mig076\_%' ESCAPE '\'
      AND p.proname NOT LIKE '%\_\_church_par%' ESCAPE '\'
      AND pg_get_function_identity_arguments(p.oid) ~ 'p_church_id|requested_church_id'
    ORDER BY length(p.proname) DESC, p.proname
  LOOP
    -- Short, unique, always ≤ 63 chars (oid text is small)
    aside := '_mig076_' || r.oid::text;

    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
      WHERE n2.nspname = 'public'
        AND p2.proname = aside
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      RAISE NOTICE '076 skip % — aside % already exists', r.proname, aside;
      CONTINUE;
    END IF;

    EXECUTE format(
      'ALTER FUNCTION public.%I(%s) RENAME TO %I',
      r.proname,
      r.args,
      aside
    );

    INSERT INTO mig076_aside(proc_oid, original_name, aside_name, args)
    VALUES (r.oid, r.proname, aside, r.args);

    new_def := r.def;
    new_def := replace(new_def, 'requested_church_id', 'requested_organization_id');
    new_def := replace(new_def, 'p_church_id', 'p_organization_id');

    BEGIN
      EXECUTE new_def;
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
      EXECUTE format(
        'ALTER FUNCTION public.%I(%s) RENAME TO %I',
        aside,
        r.args,
        r.proname
      );
      DELETE FROM mig076_aside WHERE proc_oid = r.oid;
      RAISE EXCEPTION '076 failed recreating %(%) — %', r.proname, r.args, SQLERRM;
    END;
  END LOOP;

  IF recreated = 0 THEN
    RAISE EXCEPTION '076 failed — no functions recreated (already applied?)';
  END IF;

  RAISE NOTICE '076 recreated % function(s) with organization param names', recreated;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Rebind dependent function bodies that still call aside names
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
      AND p.proname NOT LIKE '\_mig076\_%' ESCAPE '\'
      AND EXISTS (SELECT 1 FROM mig076_aside)
      AND pg_get_functiondef(p.oid) ~ '_mig076_'
  LOOP
    def := r.def;
    new_def := def;
    FOR pair IN
      SELECT aside_name, original_name
      FROM mig076_aside
      ORDER BY length(aside_name) DESC
    LOOP
      new_def := replace(new_def, pair.aside_name, pair.original_name);
    END LOOP;

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
      AND (
        COALESCE(pg_get_expr(p.polqual, p.polrelid), '') LIKE '%_mig076_%'
        OR COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), '') LIKE '%_mig076_%'
      )
  LOOP
    qual := r.qual;
    with_check := r.with_check;
    new_qual := qual;
    new_with_check := with_check;

    FOR pair IN
      SELECT aside_name, original_name
      FROM mig076_aside
      ORDER BY length(aside_name) DESC
    LOOP
      IF new_qual IS NOT NULL THEN
        new_qual := replace(new_qual, pair.aside_name, pair.original_name);
      END IF;
      IF new_with_check IS NOT NULL THEN
        new_with_check := replace(new_with_check, pair.aside_name, pair.original_name);
      END IF;
    END LOOP;

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
    SELECT aside_name, args FROM mig076_aside
    ORDER BY length(aside_name) DESC
  LOOP
    EXECUTE format('DROP FUNCTION public.%I(%s)', r.aside_name, r.args);
    dropped := dropped + 1;
    RAISE NOTICE '076 dropped aside %(%)', r.aside_name, r.args;
  END LOOP;

  -- Safety: drop any truncated leftovers from earlier 076 attempts
  FOR r IN
    SELECT
      p.proname,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND (
        p.proname LIKE '\_mig076\_%' ESCAPE '\'
        OR p.proname LIKE '%\_\_church_par%' ESCAPE '\'
      )
  LOOP
    EXECUTE format('DROP FUNCTION public.%I(%s)', r.proname, r.args);
    dropped := dropped + 1;
    RAISE NOTICE '076 dropped leftover aside %(%)', r.proname, r.args;
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
    SELECT string_agg(
      p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
      ', '
    )
    INTO leftover
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND pg_get_function_identity_arguments(p.oid) ~ 'p_church_id|requested_church_id';

    RAISE EXCEPTION '076 post-check failed — leftover church params: %', leftover;
  END IF;
END $$;

DO $$
BEGIN
  PERFORM pg_notify('pgrst', 'reload schema');
EXCEPTION WHEN others THEN
  NULL;
END $$;

COMMIT;
