-- =============================================================================
-- 041_dashboard_box_settings_rls_harden.sql
-- Phase 6: clarify dashboard_box_settings RLS (church isolation).
-- Additive / non-destructive. Safe to re-run.
-- =============================================================================

ALTER TABLE public.dashboard_box_settings ENABLE ROW LEVEL SECURITY;

-- Members may read presentation overrides for their active church only.
DROP POLICY IF EXISTS "Dashboard box settings viewable by church members"
  ON public.dashboard_box_settings;
CREATE POLICY "Dashboard box settings viewable by church members"
  ON public.dashboard_box_settings
  FOR SELECT
  TO authenticated
  USING (public.is_active_church_member(church_id));

-- Replace broad FOR ALL with explicit write policies for managers.
DROP POLICY IF EXISTS "Dashboard box settings manageable by church managers"
  ON public.dashboard_box_settings;

DROP POLICY IF EXISTS "Dashboard box settings insertable by church managers"
  ON public.dashboard_box_settings;
CREATE POLICY "Dashboard box settings insertable by church managers"
  ON public.dashboard_box_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_church_settings(church_id));

DROP POLICY IF EXISTS "Dashboard box settings updatable by church managers"
  ON public.dashboard_box_settings;
CREATE POLICY "Dashboard box settings updatable by church managers"
  ON public.dashboard_box_settings
  FOR UPDATE
  TO authenticated
  USING (public.can_manage_church_settings(church_id))
  WITH CHECK (public.can_manage_church_settings(church_id));

DROP POLICY IF EXISTS "Dashboard box settings deletable by church managers"
  ON public.dashboard_box_settings;
CREATE POLICY "Dashboard box settings deletable by church managers"
  ON public.dashboard_box_settings
  FOR DELETE
  TO authenticated
  USING (public.can_manage_church_settings(church_id));

REVOKE ALL ON public.dashboard_box_settings FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboard_box_settings
  TO authenticated;
GRANT ALL ON public.dashboard_box_settings TO service_role;
