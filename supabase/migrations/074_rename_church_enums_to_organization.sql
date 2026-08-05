-- =============================================================================
-- 074_rename_church_enums_to_organization.sql
-- Phase C: rename church_* ENUM TYPE names → organization_*.
--
-- DO NOT APPLY until 073 is applied and verified.
--
-- Enum VALUES are unchanged (trial, active, …). Only type names change.
-- Column types follow the rename automatically (OID-stable).
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regtype('public.church_status') IS NULL THEN
    RAISE EXCEPTION '074 preflight failed — public.church_status not found';
  END IF;
  IF to_regtype('public.organization_status') IS NOT NULL THEN
    RAISE EXCEPTION '074 preflight failed — organization_status already exists';
  END IF;
END $$;

ALTER TYPE public.church_status RENAME TO organization_status;
ALTER TYPE public.church_subscription_status RENAME TO organization_subscription_status;
ALTER TYPE public.church_contact_type RENAME TO organization_contact_type;
ALTER TYPE public.church_membership_role_status RENAME TO organization_membership_role_status;

-- Rewrite function bodies / signatures that still mention old type names in source
DO $$
DECLARE
  r record;
  def text;
  new_def text;
  updated integer := 0;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND pg_get_functiondef(p.oid) ~ 'church_(status|subscription_status|contact_type|membership_role_status)'
  LOOP
    def := pg_get_functiondef(r.oid);
    new_def := def;
    new_def := replace(new_def, 'church_membership_role_status', 'organization_membership_role_status');
    new_def := replace(new_def, 'church_subscription_status', 'organization_subscription_status');
    new_def := replace(new_def, 'church_contact_type', 'organization_contact_type');
    new_def := replace(new_def, 'church_status', 'organization_status');

    IF new_def IS DISTINCT FROM def THEN
      BEGIN
        EXECUTE new_def;
        updated := updated + 1;
        RAISE NOTICE '074 updated function %.%(%)', 'public', r.proname, r.args;
      EXCEPTION WHEN others THEN
        -- Parameter type renames may require DROP; type OID update usually enough.
        RAISE NOTICE '074 could not rewrite %(%) — %', r.proname, r.args, SQLERRM;
      END;
    END IF;
  END LOOP;

  RAISE NOTICE '074 enum rename complete — % function source(s) rewritten', updated;
END $$;

DO $$
BEGIN
  IF to_regtype('public.organization_status') IS NULL THEN
    RAISE EXCEPTION '074 post-check failed — organization_status missing';
  END IF;
  IF to_regtype('public.church_status') IS NOT NULL THEN
    RAISE EXCEPTION '074 post-check failed — church_status still present';
  END IF;
END $$;

COMMIT;
