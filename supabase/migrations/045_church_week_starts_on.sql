-- =============================================================================
-- 045_church_week_starts_on.sql
-- Per-church calendar week start (default Sunday) for threat levels and weeks.
-- Also replaces Monday-only Postgres date_trunc('week') normalization.
-- Safe to re-run.
-- =============================================================================

ALTER TABLE public.churches
  ADD COLUMN IF NOT EXISTS week_starts_on smallint;

DO $$
BEGIN
  ALTER TABLE public.churches
    ALTER COLUMN week_starts_on SET DEFAULT 0;
EXCEPTION
  WHEN others THEN NULL;
END $$;

UPDATE public.churches
SET week_starts_on = 0
WHERE week_starts_on IS NULL;

ALTER TABLE public.churches
  ALTER COLUMN week_starts_on SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'churches_week_starts_on_check'
  ) THEN
    ALTER TABLE public.churches
      ADD CONSTRAINT churches_week_starts_on_check
      CHECK (week_starts_on BETWEEN 0 AND 6);
  END IF;
END $$;

COMMENT ON COLUMN public.churches.week_starts_on IS
  'First day of the church calendar week: 0=Sunday … 6=Saturday. Used by weekly threat levels and other week-scoped features.';

-- Prefer existing schedule setting when present (already defaulted to Sunday).
UPDATE public.churches c
SET week_starts_on = s.week_starts_on
FROM public.church_schedule_settings s
WHERE s.church_id = c.id
  AND s.week_starts_on BETWEEN 0 AND 6;

-- Keep schedule settings aligned when churches.week_starts_on changes.
CREATE OR REPLACE FUNCTION public.sync_schedule_week_starts_on_from_church()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.week_starts_on IS DISTINCT FROM OLD.week_starts_on THEN
    UPDATE public.church_schedule_settings
    SET week_starts_on = NEW.week_starts_on,
        updated_at = now()
    WHERE church_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS churches_sync_schedule_week_starts_on
  ON public.churches;
CREATE TRIGGER churches_sync_schedule_week_starts_on
  AFTER UPDATE OF week_starts_on ON public.churches
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_schedule_week_starts_on_from_church();

-- Keep churches aligned when schedule settings week_starts_on changes.
CREATE OR REPLACE FUNCTION public.sync_church_week_starts_on_from_schedule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.week_starts_on IS DISTINCT FROM OLD.week_starts_on THEN
    UPDATE public.churches
    SET week_starts_on = NEW.week_starts_on,
        updated_at = now()
    WHERE id = NEW.church_id
      AND week_starts_on IS DISTINCT FROM NEW.week_starts_on;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS church_schedule_settings_sync_week_starts_on
  ON public.church_schedule_settings;
CREATE TRIGGER church_schedule_settings_sync_week_starts_on
  AFTER INSERT OR UPDATE OF week_starts_on ON public.church_schedule_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_church_week_starts_on_from_schedule();

-- Threat week normalization: snap to the church week start (not ISO Monday).
CREATE OR REPLACE FUNCTION public.normalize_church_threat_level_week()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_week_starts_on smallint := 0;
  v_dow integer;
BEGIN
  SELECT COALESCE(c.week_starts_on, 0)
  INTO v_week_starts_on
  FROM public.churches c
  WHERE c.id = NEW.church_id;

  IF v_week_starts_on IS NULL THEN
    v_week_starts_on := 0;
  END IF;

  -- EXTRACT(DOW): 0=Sunday … 6=Saturday (matches week_starts_on).
  v_dow := EXTRACT(DOW FROM NEW.week_start)::integer;
  NEW.week_start := (
    NEW.week_start - ((v_dow - v_week_starts_on + 7) % 7)
  )::date;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS church_threat_levels_normalize_week
  ON public.church_threat_levels;
CREATE TRIGGER church_threat_levels_normalize_week
  BEFORE INSERT ON public.church_threat_levels
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_church_threat_level_week();
