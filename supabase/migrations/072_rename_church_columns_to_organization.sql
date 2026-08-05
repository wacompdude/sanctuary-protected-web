-- =============================================================================
-- 072_rename_church_columns_to_organization.sql
-- Phase 2 deliverable (Option B): rename church_* COLUMNS → organization_*.
--
-- Prerequisites:
--   - Migration 071 applied (organization_* tables exist).
--   - Coordinated app deploy ready (Phase 3) that queries organization_id.
--
-- DO NOT APPLY until:
--   1. Application code using .eq("church_id") / inserts is updated, AND
--   2. A maintenance window will deploy app + this migration together.
--
-- Strategy: Strategy A (coordinated maintenance deployment).
-- Rollback: migrations/rollback/072_rename_church_columns_to_organization.sql
-- Verify:   migrations/rollback/072_verify_organization_columns.sql
--
-- What this does:
--   1. Preflight: church_id / church_membership_id exist; targets do not.
--   2. ALTER TABLE … RENAME COLUMN on every public table that has them
--      (dynamic discovery — covers ~94+ tenant tables).
--   3. Rewrite public function BODIES that still hard-code church_id /
--      church_membership_id column references.
--      PostgreSQL does NOT rewrite plpgsql source on column rename.
--      INPUT PARAMETER NAMES (p_church_id, requested_church_id, …) are kept —
--      CREATE OR REPLACE cannot rename input parameters (42P13).
--
-- What this deliberately does NOT do:
--   - Rename tables (already done in 071)
--   - Rename enums (church_status, church_subscription_status, …)
--   - Rename SQL function names (is_active_church_member, create_church_with_owner,
--     church_id_from_*_path helpers — names kept for compatibility)
--   - Rename RPC / function input parameter names (p_church_id, …)
--   - Rename Storage object paths (churches/{id}/…)
--   - Cosmetic rename of all index/constraint names (optional later)
--   - Change customer-facing UI terminology
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Preflight
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  missing_org_tables text;
  church_id_count integer;
  membership_id_count integer;
  target_conflict integer;
BEGIN
  SELECT string_agg(t, ', ')
  INTO missing_org_tables
  FROM unnest(ARRAY[
    'organizations',
    'organization_memberships',
    'organization_membership_roles'
  ]) AS t
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = t
  );

  IF missing_org_tables IS NOT NULL THEN
    RAISE EXCEPTION
      '072 preflight failed — apply 071 first; missing table(s): %',
      missing_org_tables;
  END IF;

  SELECT count(*)::integer
  INTO church_id_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND column_name = 'church_id';

  IF church_id_count = 0 THEN
    RAISE EXCEPTION
      '072 preflight failed — no public.church_id columns found (already migrated?)';
  END IF;

  SELECT count(*)::integer
  INTO membership_id_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND column_name = 'church_membership_id';

  IF membership_id_count = 0 THEN
    RAISE EXCEPTION
      '072 preflight failed — no public.church_membership_id columns found';
  END IF;

  SELECT count(*)::integer
  INTO target_conflict
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.column_name = 'organization_id'
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns c2
      WHERE c2.table_schema = c.table_schema
        AND c2.table_name = c.table_name
        AND c2.column_name = 'church_id'
    );

  IF target_conflict > 0 THEN
    RAISE EXCEPTION
      '072 preflight failed — % table(s) already have both church_id and organization_id',
      target_conflict;
  END IF;

  RAISE NOTICE
    '072 preflight OK — church_id on % table(s), church_membership_id on % table(s)',
    church_id_count, membership_id_count;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Rename church_membership_id → organization_membership_id (2 tables)
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
      AND c.column_name = 'church_membership_id'
      AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns x
        WHERE x.table_schema = 'public'
          AND x.table_name = c.table_name
          AND x.column_name = 'organization_membership_id'
      )
    ORDER BY c.table_name
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I RENAME COLUMN church_membership_id TO organization_membership_id',
      r.table_name
    );
    renamed := renamed + 1;
    RAISE NOTICE '072 renamed %.church_membership_id → organization_membership_id', r.table_name;
  END LOOP;

  IF renamed = 0 THEN
    RAISE EXCEPTION '072 failed — no church_membership_id columns renamed';
  END IF;

  RAISE NOTICE '072 church_membership_id rename complete — % table(s)', renamed;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Rename church_id → organization_id (all public tables that have it)
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
      AND c.column_name = 'church_id'
      AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns x
        WHERE x.table_schema = 'public'
          AND x.table_name = c.table_name
          AND x.column_name = 'organization_id'
      )
    ORDER BY c.table_name
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I RENAME COLUMN church_id TO organization_id',
      r.table_name
    );
    renamed := renamed + 1;
  END LOOP;

  IF renamed = 0 THEN
    RAISE EXCEPTION '072 failed — no church_id columns renamed';
  END IF;

  RAISE NOTICE '072 church_id rename complete — % table(s)', renamed;
END $$;

COMMENT ON COLUMN public.organization_memberships.organization_id IS
  'Tenant organization id (UI: church). FK → organizations.id.';
COMMENT ON COLUMN public.organization_membership_roles.organization_membership_id IS
  'Membership row id (UI: church membership).';

-- ---------------------------------------------------------------------------
-- 3. Rewrite public function bodies that still hard-code old column names
--
--    Order matters:
--      1) Protect function NAMES that embed church_id (user_church_id,
--         church_id_from_*_path, …) so CREATE OR REPLACE targets the same fn
--      2) Protect every function argument name that contains church_id /
--         church_membership_id (CREATE OR REPLACE cannot rename input params)
--      3) church_membership_id → organization_membership_id
--      4) church_id → organization_id
--         (rewrites column refs, NEW/OLD fields, locals like v_church_id,
--          JSON keys 'church_id', etc. — but NOT protected names/args)
--      5) Restore protected tokens
--
--    Function NAMES such as is_active_church_member / user_church_id remain.
--    RPC arg names such as p_church_id / requested_church_id remain unchanged.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r record;
  def text;
  new_def text;
  updated_count integer := 0;
  argnames text[];
  argname text;
  i integer;
  j integer;
  protected_args text[] := ARRAY[]::text[];
  protected_fn_names text[] := ARRAY[]::text[];
BEGIN
  -- Function names that embed church_id must be preserved (e.g. user_church_id,
  -- church_id_from_*_path). Otherwise replace(church_id→organization_id) rewrites
  -- CREATE FUNCTION user_church_id into user_organization_id and leaves the old
  -- function untouched — which then fails the post-check.
  SELECT coalesce(array_agg(p.proname ORDER BY length(p.proname) DESC), ARRAY[]::text[])
  INTO protected_fn_names
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND (
      position('church_membership_id' in p.proname) > 0
      OR position('church_id' in p.proname) > 0
    );

  -- Clean up accidental leftover from a prior partial 072 attempt
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'user_organization_id'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) AND EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'user_church_id'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    DROP FUNCTION public.user_organization_id();
    RAISE NOTICE '072 dropped accidental public.user_organization_id() leftover';
  END IF;

  FOR r IN
    SELECT
      p.oid,
      p.proname,
      p.proargnames,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND (
        pg_get_functiondef(p.oid) ~ 'church_membership_id'
        OR pg_get_functiondef(p.oid) ~ 'church_id'
      )
  LOOP
    def := pg_get_functiondef(r.oid);
    new_def := def;
    protected_args := ARRAY[]::text[];

    -- Protect function names that contain church_id (longest first via array_agg)
    IF array_length(protected_fn_names, 1) IS NOT NULL THEN
      FOR i IN 1..array_length(protected_fn_names, 1) LOOP
        new_def := replace(
          new_def,
          protected_fn_names[i],
          '__KEEP_FN_NAME_' || i::text || '__'
        );
      END LOOP;
    END IF;

    -- Protect argument names (longest first) so CREATE OR REPLACE does not
    -- attempt to rename input parameters (error 42P13).
    argnames := COALESCE(r.proargnames, ARRAY[]::text[]);
    FOR i IN 1..COALESCE(array_length(argnames, 1), 0) LOOP
      argname := argnames[i];
      IF argname IS NOT NULL
         AND (
           position('church_membership_id' in argname) > 0
           OR position('church_id' in argname) > 0
         )
      THEN
        protected_args := array_append(protected_args, argname);
      END IF;
    END LOOP;

    -- Sort protected args by length descending via simple nested loop swaps
    IF array_length(protected_args, 1) IS NOT NULL THEN
      FOR i IN 1..array_length(protected_args, 1) LOOP
        FOR j IN i+1..array_length(protected_args, 1) LOOP
          IF length(protected_args[j]) > length(protected_args[i]) THEN
            argname := protected_args[i];
            protected_args[i] := protected_args[j];
            protected_args[j] := argname;
          END IF;
        END LOOP;
      END LOOP;

      FOR i IN 1..array_length(protected_args, 1) LOOP
        -- Sentinel must NOT contain the substring church_id
        new_def := replace(
          new_def,
          protected_args[i],
          '__KEEP_FN_ARG_' || i::text || '__'
        );
      END LOOP;
    END IF;

    -- Longer identifier first
    new_def := replace(new_def, 'church_membership_id', 'organization_membership_id');
    new_def := replace(new_def, 'church_id', 'organization_id');

    -- Restore protected argument names (reverse order)
    IF array_length(protected_args, 1) IS NOT NULL THEN
      FOR i IN REVERSE 1..array_length(protected_args, 1) LOOP
        new_def := replace(
          new_def,
          '__KEEP_FN_ARG_' || i::text || '__',
          protected_args[i]
        );
      END LOOP;
    END IF;

    -- Restore protected function names (reverse order)
    IF array_length(protected_fn_names, 1) IS NOT NULL THEN
      FOR i IN REVERSE 1..array_length(protected_fn_names, 1) LOOP
        new_def := replace(
          new_def,
          '__KEEP_FN_NAME_' || i::text || '__',
          protected_fn_names[i]
        );
      END LOOP;
    END IF;

    IF new_def IS DISTINCT FROM def THEN
      EXECUTE new_def;
      updated_count := updated_count + 1;
      RAISE NOTICE '072 updated function %.%(%)', 'public', r.proname, r.args;
    END IF;
  END LOOP;

  RAISE NOTICE '072 function rewrite complete — % function(s) updated', updated_count;
END $$;

-- ---------------------------------------------------------------------------
-- 3b. Explicit rewrite for helpers whose NAMES contain church_id
--     (avoids bulk-replace edge cases; path helpers keep Storage prefix churches/)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.user_church_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.organization_id
  FROM public.organization_memberships m
  WHERE m.user_id = auth.uid()
    AND m.status = 'active'::public.membership_status
  ORDER BY COALESCE(m.joined_at, m.created_at) NULLS LAST, m.created_at
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.church_id_from_branding_path(object_name text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  parts text[];
  organization_id uuid;
BEGIN
  parts := string_to_array(object_name, '/');
  IF array_length(parts, 1) < 3 THEN
    RETURN NULL;
  END IF;
  -- Storage paths remain churches/{id}/branding/...
  IF parts[1] <> 'churches' OR parts[3] <> 'branding' THEN
    RETURN NULL;
  END IF;
  BEGIN
    organization_id := parts[2]::uuid;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  RETURN organization_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.church_id_from_incident_media_path(object_name text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  parts text[];
  organization_id uuid;
BEGIN
  parts := string_to_array(object_name, '/');
  IF array_length(parts, 1) < 5 THEN
    RETURN NULL;
  END IF;
  IF parts[1] <> 'churches' OR parts[3] <> 'incidents' THEN
    RETURN NULL;
  END IF;
  BEGIN
    organization_id := parts[2]::uuid;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  RETURN organization_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.church_id_from_equipment_media_path(object_name text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  parts text[];
  organization_id uuid;
BEGIN
  parts := string_to_array(object_name, '/');
  IF array_length(parts, 1) < 5 THEN
    RETURN NULL;
  END IF;
  IF parts[1] <> 'churches' OR parts[3] <> 'equipment' THEN
    RETURN NULL;
  END IF;
  BEGIN
    organization_id := parts[2]::uuid;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  RETURN organization_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.church_id_from_policy_media_path(object_name text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  parts text[];
  organization_id uuid;
BEGIN
  parts := string_to_array(object_name, '/');
  IF array_length(parts, 1) < 5 THEN
    RETURN NULL;
  END IF;
  IF parts[1] <> 'churches' OR parts[3] <> 'policies' THEN
    RETURN NULL;
  END IF;
  BEGIN
    organization_id := parts[2]::uuid;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  RETURN organization_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.church_id_from_safety_concern_photo_path(object_name text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  parts text[];
  organization_id uuid;
BEGIN
  parts := string_to_array(object_name, '/');
  IF array_length(parts, 1) < 5 THEN
    RETURN NULL;
  END IF;
  IF parts[1] <> 'churches' OR parts[3] <> 'safety-concerns' THEN
    RETURN NULL;
  END IF;
  BEGIN
    organization_id := parts[2]::uuid;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  RETURN organization_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Post-checks (in-transaction)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  leftover_cols text;
  missing_org_id integer;
  def text;
BEGIN
  SELECT string_agg(table_name || '.' || column_name, ', ' ORDER BY table_name)
  INTO leftover_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND column_name IN ('church_id', 'church_membership_id');

  IF leftover_cols IS NOT NULL THEN
    RAISE EXCEPTION
      '072 post-check failed — leftover church_* columns: %', leftover_cols;
  END IF;

  SELECT count(*)::integer
  INTO missing_org_id
  FROM information_schema.tables t
  WHERE t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
    AND t.table_name IN (
      'organization_memberships',
      'organization_membership_roles',
      'campuses',
      'campus_memberships',
      'incidents',
      'notifications',
      'organization_subscriptions'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = t.table_name
        AND c.column_name = 'organization_id'
    );

  IF missing_org_id > 0 THEN
    RAISE EXCEPTION
      '072 post-check failed — key table(s) missing organization_id';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'campus_memberships'
      AND column_name = 'organization_membership_id'
  ) THEN
    RAISE EXCEPTION
      '072 post-check failed — campus_memberships.organization_membership_id missing';
  END IF;

  -- Spot-check: legacy helper must read organization_id (not m.church_id)
  SELECT pg_get_functiondef(p.oid)
  INTO def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'user_church_id'
    AND pg_get_function_identity_arguments(p.oid) = ''
  LIMIT 1;

  IF def IS NULL THEN
    RAISE EXCEPTION '072 post-check failed — user_church_id() missing';
  END IF;

  IF def !~ 'organization_id' OR def ~ '\.church_id\y' THEN
    RAISE EXCEPTION
      '072 post-check failed — user_church_id() still references church_id column';
  END IF;

  -- Spot-check: primary membership helper uses organization_id column
  SELECT pg_get_functiondef(p.oid)
  INTO def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'is_active_church_member'
  ORDER BY p.oid
  LIMIT 1;

  IF def IS NULL OR def !~ 'organization_id' THEN
    RAISE EXCEPTION
      '072 post-check failed — is_active_church_member() does not reference organization_id';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'user_organization_id'
  ) THEN
    DROP FUNCTION public.user_organization_id();
    RAISE NOTICE '072 dropped accidental public.user_organization_id()';
  END IF;

  -- Path helper names must remain church_id_from_* (Storage path parsers)
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'church_id_from_branding_path'
  ) THEN
    RAISE EXCEPTION
      '072 post-check failed — church_id_from_branding_path missing';
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- After apply (outside this migration):
--   1. Deploy application that uses organization_id / organization_membership_id
--      (RPC argument names remain p_church_id / requested_church_id)
--   2. Run verification queries in:
--        supabase/migrations/rollback/072_verify_organization_columns.sql
--   3. Smoke-test login, church switch, Team, Incidents, Settings → Church,
--      Scheduling, Notifications, Platform → Churches, demo seed, Storage uploads
-- =============================================================================
