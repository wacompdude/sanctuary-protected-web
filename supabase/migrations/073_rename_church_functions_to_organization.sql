-- =============================================================================
-- 073_rename_church_functions_to_organization.sql
-- Phase B: rename public SQL functions that embed "church" → "organization",
-- then recreate the old names as thin compatibility wrappers.
--
-- DO NOT APPLY until:
--   1. Phase A TypeScript organizationId work is deployed (or shipping together)
--   2. You have confirmed a maintenance window / backup
--
-- Strategy:
--   ALTER FUNCTION … RENAME TO …
--   CREATE wrapper with the previous church_* name that delegates to the new one
--
-- Result:
--   - Backend / new code can call organization_* function names
--   - Existing RLS policies, Storage policies, and app .rpc("…church…") keep working
--
-- What this does NOT do:
--   - Rename enums (Phase C — 074)
--   - Rename Storage path prefix churches/
--   - Rename input parameter names (kept for CREATE OR REPLACE / wrapper simplicity)
--   - Change UI terminology
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Preflight
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organization_memberships'
      AND column_name = 'organization_id'
  ) THEN
    RAISE EXCEPTION
      '073 preflight failed — apply 072 first (organization_id columns required)';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Rename functions + create church_* wrappers
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r record;
  old_name text;
  new_name text;
  identity_args text;
  result_type text;
  arg_count integer;
  call_args text;
  i integer;
  renamed integer := 0;
  skipped text := '';
BEGIN
  FOR r IN
    SELECT
      p.oid,
      p.proname,
      p.pronargs,
      p.provolatile,
      p.proisstrict,
      p.prosecdef,
      pg_get_function_identity_arguments(p.oid) AS identity_args,
      pg_get_function_result(p.oid) AS result_type
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND position('church' in p.proname) > 0
      AND position('organization' in p.proname) = 0
    ORDER BY length(p.proname) DESC, p.proname
  LOOP
    old_name := r.proname;
    new_name := replace(old_name, 'church', 'organization');

    IF new_name = old_name THEN
      skipped := skipped || old_name || ', ';
      CONTINUE;
    END IF;

    -- Skip if target already exists (re-run safety)
    IF EXISTS (
      SELECT 1
      FROM pg_proc p2
      JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
      WHERE n2.nspname = 'public'
        AND p2.proname = new_name
        AND pg_get_function_identity_arguments(p2.oid) = r.identity_args
    ) THEN
      RAISE NOTICE '073 skip rename % — target % already exists', old_name, new_name;
      CONTINUE;
    END IF;

    EXECUTE format(
      'ALTER FUNCTION public.%I(%s) RENAME TO %I',
      old_name,
      r.identity_args,
      new_name
    );

    -- Build positional call list $1, $2, …
    arg_count := r.pronargs;
    call_args := '';
    IF arg_count > 0 THEN
      call_args := (
        SELECT string_agg('$' || g.i::text, ', ' ORDER BY g.i)
        FROM generate_series(1, arg_count) AS g(i)
      );
    END IF;

    -- Thin wrapper keeps old RPC / policy call sites working
    EXECUTE format(
      'CREATE FUNCTION public.%I(%s)
       RETURNS %s
       LANGUAGE sql
       %s
       %s
       AS $wrap$
         SELECT public.%I(%s)
       $wrap$',
      old_name,
      r.identity_args,
      r.result_type,
      CASE r.provolatile
        WHEN 'i' THEN 'IMMUTABLE'
        WHEN 's' THEN 'STABLE'
        ELSE 'VOLATILE'
      END,
      CASE WHEN r.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END,
      new_name,
      call_args
    );

    -- Preserve execute grants from typical app roles
    BEGIN
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated',
        old_name,
        r.identity_args
      );
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated',
        new_name,
        r.identity_args
      );
    EXCEPTION WHEN undefined_object OR invalid_grant_operation THEN
      NULL; -- role may not exist in all environments
    END;

    renamed := renamed + 1;
    RAISE NOTICE '073 renamed %(%) → % + wrapper', old_name, r.identity_args, new_name;
  END LOOP;

  IF renamed = 0 THEN
    RAISE EXCEPTION '073 failed — no functions renamed (already applied?)';
  END IF;

  RAISE NOTICE '073 function rename complete — % function(s); skipped: %',
    renamed, COALESCE(nullif(skipped, ''), '(none)');
END $$;

-- ---------------------------------------------------------------------------
-- 2. Post-checks
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_active_organization_member'
  ) THEN
    RAISE EXCEPTION '073 post-check failed — is_active_organization_member missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_active_church_member'
  ) THEN
    RAISE EXCEPTION
      '073 post-check failed — compatibility wrapper is_active_church_member missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'create_organization_with_owner'
  ) THEN
    RAISE EXCEPTION '073 post-check failed — create_organization_with_owner missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'organization_id_from_branding_path'
  ) THEN
    RAISE EXCEPTION
      '073 post-check failed — organization_id_from_branding_path missing';
  END IF;

  -- Storage policies should still resolve via church_id_from_* wrappers
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'church_id_from_branding_path'
  ) THEN
    RAISE EXCEPTION
      '073 post-check failed — church_id_from_branding_path wrapper missing';
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- After apply:
--   1. Optionally update app .rpc("create_church_with_owner") →
--      .rpc("create_organization_with_owner") (wrappers make this non-blocking)
--   2. Smoke-test login, RLS-gated pages, Storage uploads, create church
--   3. Phase C (074): rename enums church_status → organization_status, etc.
-- =============================================================================
