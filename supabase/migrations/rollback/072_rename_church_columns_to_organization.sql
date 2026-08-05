-- =============================================================================
-- ROLLBACK: 072_rename_church_columns_to_organization
--
-- Location: supabase/migrations/rollback/
-- DO NOT place this in the auto-applied migrations stream.
-- Apply manually only to reverse a successful 072 forward migration.
--
-- Coordinate with application rollback to code that uses church_id columns
-- and RPC args p_church_id / requested_church_id.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Preflight — forward column rename must already be present
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  org_id_count integer;
  membership_id_count integer;
BEGIN
  SELECT count(*)::integer
  INTO org_id_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND column_name = 'organization_id';

  IF org_id_count = 0 THEN
    RAISE EXCEPTION
      '072 rollback preflight failed — no public.organization_id columns found';
  END IF;

  SELECT count(*)::integer
  INTO membership_id_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND column_name = 'organization_membership_id';

  IF membership_id_count = 0 THEN
    RAISE EXCEPTION
      '072 rollback preflight failed — no public.organization_membership_id columns found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'church_id'
  ) THEN
    RAISE EXCEPTION
      '072 rollback preflight failed — church_id already present (partial state?)';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Rewrite function bodies back to church_id / church_membership_id
--    (before column rename so CREATE OR REPLACE stays consistent in intent;
--     whole rollback is one transaction)
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
      AND (
        pg_get_functiondef(p.oid) ~ 'organization_membership_id'
        OR pg_get_functiondef(p.oid) ~ 'organization_id'
      )
  LOOP
    def := pg_get_functiondef(r.oid);
    new_def := def;

    -- organization_membership_id does not contain organization_id as a substring,
    -- but replace the longer token first for clarity.
    new_def := replace(new_def, 'organization_membership_id', 'church_membership_id');
    new_def := replace(new_def, 'organization_id', 'church_id');

    IF new_def IS DISTINCT FROM def THEN
      EXECUTE new_def;
      updated_count := updated_count + 1;
      RAISE NOTICE '072 rollback updated function %.%(%)', 'public', r.proname, r.args;
    END IF;
  END LOOP;

  RAISE NOTICE '072 rollback function rewrite complete — % function(s)', updated_count;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Rename organization_id → church_id
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r record;
  renamed integer := 0;
BEGIN
  FOR r IN
    SELECT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name = 'organization_id'
      AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns x
        WHERE x.table_schema = 'public'
          AND x.table_name = c.table_name
          AND x.column_name = 'church_id'
      )
    ORDER BY c.table_name
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I RENAME COLUMN organization_id TO church_id',
      r.table_name
    );
    renamed := renamed + 1;
  END LOOP;

  IF renamed = 0 THEN
    RAISE EXCEPTION '072 rollback failed — no organization_id columns renamed';
  END IF;

  RAISE NOTICE '072 rollback organization_id → church_id — % table(s)', renamed;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Rename organization_membership_id → church_membership_id
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r record;
  renamed integer := 0;
BEGIN
  FOR r IN
    SELECT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name = 'organization_membership_id'
      AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns x
        WHERE x.table_schema = 'public'
          AND x.table_name = c.table_name
          AND x.column_name = 'church_membership_id'
      )
    ORDER BY c.table_name
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I RENAME COLUMN organization_membership_id TO church_membership_id',
      r.table_name
    );
    renamed := renamed + 1;
    RAISE NOTICE '072 rollback %.organization_membership_id → church_membership_id', r.table_name;
  END LOOP;

  IF renamed = 0 THEN
    RAISE EXCEPTION '072 rollback failed — no organization_membership_id columns renamed';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Post-checks
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  leftover text;
BEGIN
  SELECT string_agg(table_name || '.' || column_name, ', ')
  INTO leftover
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND column_name IN ('organization_id', 'organization_membership_id');

  IF leftover IS NOT NULL THEN
    RAISE EXCEPTION
      '072 rollback post-check failed — leftover organization_* columns: %', leftover;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organization_memberships'
      AND column_name = 'church_id'
  ) THEN
    RAISE EXCEPTION
      '072 rollback post-check failed — organization_memberships.church_id missing';
  END IF;
END $$;

COMMIT;
