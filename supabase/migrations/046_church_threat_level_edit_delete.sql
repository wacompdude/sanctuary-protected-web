-- =============================================================================
-- 046_church_threat_level_edit_delete.sql
-- Allow leaders to update/delete threat level rows; include co_owner in manage.
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
      'co_owner',
      'administrator',
      'security_leader'
    ]
  );
$$;

ALTER TABLE public.church_threat_levels
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

ALTER TABLE public.church_threat_levels
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.church_threat_levels.updated_at IS
  'Set when an existing threat level row is edited in place.';
COMMENT ON COLUMN public.church_threat_levels.updated_by IS
  'User who last edited this row in place (null when never edited).';

-- Normalize week_start on UPDATE as well as INSERT (church week start).
DROP TRIGGER IF EXISTS church_threat_levels_normalize_week
  ON public.church_threat_levels;
CREATE TRIGGER church_threat_levels_normalize_week
  BEFORE INSERT OR UPDATE OF week_start ON public.church_threat_levels
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_church_threat_level_week();

DROP POLICY IF EXISTS "Church threat levels are updated by leaders"
  ON public.church_threat_levels;
CREATE POLICY "Church threat levels are updated by leaders"
  ON public.church_threat_levels
  FOR UPDATE
  TO authenticated
  USING (public.can_manage_church_threat_levels(church_id))
  WITH CHECK (public.can_manage_church_threat_levels(church_id));

DROP POLICY IF EXISTS "Church threat levels are deleted by leaders"
  ON public.church_threat_levels;
CREATE POLICY "Church threat levels are deleted by leaders"
  ON public.church_threat_levels
  FOR DELETE
  TO authenticated
  USING (public.can_manage_church_threat_levels(church_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.church_threat_levels TO authenticated;
