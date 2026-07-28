-- =============================================================================
-- 065_training_dashboard_metric_colors.sql
-- Per-church colors for Training dashboard metric cards.
-- =============================================================================

ALTER TABLE public.training_church_settings
  ADD COLUMN IF NOT EXISTS dashboard_metric_colors jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.training_church_settings.dashboard_metric_colors IS
  'Map of training dashboard metric keys to background hex colors, e.g. {"upcoming_events":"#93C5FD"}.';
