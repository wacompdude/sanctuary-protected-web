-- =============================================================================
-- Stage 3A RLS regression harness (ISOLATED / NON-PRODUCTION DATABASE ONLY)
--
-- Prerequisites:
--   1. Fresh or disposable database with migrations through 117 applied.
--   2. Two auth users and two organizations with memberships.
--   3. Run as a role that can SET ROLE / set request.jwt.claim.sub.
--
-- DO NOT run against Production. Creates and rolls back fixture data in a
-- transaction when possible; prefer a dedicated branch/local DB.
-- =============================================================================

-- Operator must bind these before running:
-- \set org_a '...'
-- \set org_b '...'
-- \set user_a '...'  -- member of org_a only
-- \set user_b '...'  -- member of org_b only
-- \set admin_a '...' -- administrator of org_a

BEGIN;

-- Expected after migration 117: zero authenticated-wide policies remain.
DO $$
DECLARE
  broad_count integer;
BEGIN
  SELECT count(*) INTO broad_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN (
      'security_groups',
      'security_group_members',
      'security_group_permissions',
      'user_permissions',
      'security_audit_logs'
    )
    AND (
      coalesce(qual, '') LIKE '%auth.role() = ''authenticated''%'
      OR coalesce(with_check, '') LIKE '%auth.role() = ''authenticated''%'
    );

  IF broad_count <> 0 THEN
    RAISE EXCEPTION 'FAIL Test 15: % authenticated-wide policies remain', broad_count;
  END IF;
  RAISE NOTICE 'PASS Test 15 — no authenticated-wide policies';
END $$;

-- Remaining tests require JWT impersonation fixtures and are documented for
-- local/CI runners with auth.uid() control. See Stage 3A report section I.

ROLLBACK;
