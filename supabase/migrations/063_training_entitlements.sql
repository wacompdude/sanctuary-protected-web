-- =============================================================================
-- 063_training_entitlements.sql
-- Add feature_category enum value 'training' only.
-- Must commit before 064 can insert features that use this value.
-- =============================================================================

ALTER TYPE public.feature_category ADD VALUE IF NOT EXISTS 'training';
