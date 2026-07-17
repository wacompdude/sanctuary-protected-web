-- =============================================================================
-- 026_church_threat_level_notes.sql
-- Add optional weekly notes for church threat level history.
-- Safe to re-run.
-- =============================================================================

ALTER TABLE public.church_threat_levels
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.church_threat_levels
  DROP CONSTRAINT IF EXISTS church_threat_levels_notes_length_check;

ALTER TABLE public.church_threat_levels
  ADD CONSTRAINT church_threat_levels_notes_length_check
  CHECK (notes IS NULL OR char_length(notes) <= 4000);

COMMENT ON COLUMN public.church_threat_levels.notes IS
  'Optional notes explaining the weekly threat level assessment.';
