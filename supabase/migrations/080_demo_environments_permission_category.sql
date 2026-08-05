-- =============================================================================
-- 080_demo_environments_permission_category.sql
-- Add platform_permission_category value for Demo Environments.
-- Must apply BEFORE 081 (new enum values cannot be used in the same transaction
-- that creates them on some Postgres versions).
-- =============================================================================

ALTER TYPE public.platform_permission_category
  ADD VALUE IF NOT EXISTS 'demo_environments';
