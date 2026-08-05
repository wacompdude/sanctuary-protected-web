-- =============================================================================
-- ROLLBACK: 073_rename_church_functions_to_organization
-- Drop organization_* names that have church_* wrappers, then rename
-- organization_* back to church_* (inverse of forward migration).
-- =============================================================================

BEGIN;

DO $$
DECLARE
  r record;
  org_name text;
  church_name text;
BEGIN
  -- Drop wrappers (church_* names that are SQL wrappers calling organization_*)
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args,
           pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND position('church' in p.proname) > 0
      AND pg_get_functiondef(p.oid) LIKE '%SELECT public.organization%'
  LOOP
    EXECUTE format('DROP FUNCTION public.%I(%s)', r.proname, r.args);
    RAISE NOTICE '073 rollback dropped wrapper %(%)', r.proname, r.args;
  END LOOP;

  -- Rename organization_* functions back to church_*
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND position('organization' in p.proname) > 0
      AND (
        -- Only those that were renamed from church_* (have a church equivalent name)
        position('church' in replace(p.proname, 'organization', 'church')) > 0
      )
    ORDER BY length(p.proname) DESC
  LOOP
    org_name := r.proname;
    church_name := replace(org_name, 'organization', 'church');

    IF church_name = org_name THEN
      CONTINUE;
    END IF;

    -- Only rename if church_* does not already exist
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
      WHERE n2.nspname = 'public'
        AND p2.proname = church_name
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      RAISE NOTICE '073 rollback skip % — % already exists', org_name, church_name;
      CONTINUE;
    END IF;

    EXECUTE format(
      'ALTER FUNCTION public.%I(%s) RENAME TO %I',
      org_name,
      r.args,
      church_name
    );
    RAISE NOTICE '073 rollback renamed % → %', org_name, church_name;
  END LOOP;
END $$;

COMMIT;
