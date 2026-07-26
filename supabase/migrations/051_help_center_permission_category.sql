-- =============================================================================
-- 051_help_center_permission_category.sql
-- Add platform_permission_category enum value 'help' in its own transaction
-- so later Help Center seeds can use it safely (Postgres enum ADD VALUE rule).
--
-- PHASE 2 ARTIFACT: Review before applying. Apply before 052_help_center.sql.
-- =============================================================================

ALTER TYPE public.platform_permission_category ADD VALUE IF NOT EXISTS 'help';
