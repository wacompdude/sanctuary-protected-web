-- =============================================================================
-- 025_church_threat_levels.sql
-- Weekly church threat level history with append-only auditability.
-- Safe to re-run.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.can_manage_church_threat_levels(
  requested_church_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_church_role(
    requested_church_id,
    ARRAY[
      'owner',
      'administrator',
      'security_leader'
    ]
  );
$$;

CREATE TABLE IF NOT EXISTS public.church_threat_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  week_start date NOT NULL,
  threat_level text NOT NULL,
  changed_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT church_threat_levels_threat_level_check
    CHECK (threat_level IN ('green', 'blue', 'yellow', 'orange', 'red'))
);

CREATE INDEX IF NOT EXISTS church_threat_levels_church_week_idx
  ON public.church_threat_levels (church_id, week_start DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS church_threat_levels_changed_by_idx
  ON public.church_threat_levels (changed_by, created_at DESC);

CREATE OR REPLACE FUNCTION public.normalize_church_threat_level_week()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.week_start := date_trunc('week', NEW.week_start::timestamp)::date;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS church_threat_levels_normalize_week
  ON public.church_threat_levels;
CREATE TRIGGER church_threat_levels_normalize_week
  BEFORE INSERT ON public.church_threat_levels
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_church_threat_level_week();

ALTER TABLE public.church_threat_levels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Church threat levels are viewable by church members"
  ON public.church_threat_levels;
CREATE POLICY "Church threat levels are viewable by church members"
  ON public.church_threat_levels
  FOR SELECT
  USING (public.is_active_church_member(church_id));

DROP POLICY IF EXISTS "Church threat levels are inserted by leaders"
  ON public.church_threat_levels;
CREATE POLICY "Church threat levels are inserted by leaders"
  ON public.church_threat_levels
  FOR INSERT
  WITH CHECK (
    public.can_manage_church_threat_levels(church_id)
    AND changed_by = auth.uid()
  );

GRANT SELECT, INSERT ON public.church_threat_levels TO authenticated;
