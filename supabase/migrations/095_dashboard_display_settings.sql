-- =============================================================================
-- 095_dashboard_display_settings.sql
-- Church-scoped dashboard display preference (auto-sort by active count).
-- Additive / idempotent. Does not change dashboard_box_settings rows or RLS.
-- Default is false so existing churches keep their saved manual order.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.dashboard_display_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  sort_by_active_count boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.dashboard_display_settings IS
  'Church-wide dashboard display preferences. sort_by_active_count is display-only and must not rewrite dashboard_box_settings.display_order.';

COMMENT ON COLUMN public.dashboard_display_settings.sort_by_active_count IS
  'When true, the dashboard sorts visible boxes by item count descending, using saved display_order as the tie-breaker.';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'touch_notifications_updated_at'
  ) THEN
    DROP TRIGGER IF EXISTS dashboard_display_settings_touch_updated_at
      ON public.dashboard_display_settings;
    CREATE TRIGGER dashboard_display_settings_touch_updated_at
      BEFORE UPDATE ON public.dashboard_display_settings
      FOR EACH ROW
      EXECUTE FUNCTION public.touch_notifications_updated_at();
  ELSIF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'set_updated_at'
  ) THEN
    DROP TRIGGER IF EXISTS dashboard_display_settings_touch_updated_at
      ON public.dashboard_display_settings;
    CREATE TRIGGER dashboard_display_settings_touch_updated_at
      BEFORE UPDATE ON public.dashboard_display_settings
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END;
$$;

ALTER TABLE public.dashboard_display_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Dashboard display settings viewable by church members"
  ON public.dashboard_display_settings;
CREATE POLICY "Dashboard display settings viewable by church members"
  ON public.dashboard_display_settings
  FOR SELECT
  TO authenticated
  USING (public.is_active_organization_member(organization_id));

DROP POLICY IF EXISTS "Dashboard display settings insertable by church managers"
  ON public.dashboard_display_settings;
CREATE POLICY "Dashboard display settings insertable by church managers"
  ON public.dashboard_display_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_organization_settings(organization_id));

DROP POLICY IF EXISTS "Dashboard display settings updatable by church managers"
  ON public.dashboard_display_settings;
CREATE POLICY "Dashboard display settings updatable by church managers"
  ON public.dashboard_display_settings
  FOR UPDATE
  TO authenticated
  USING (public.can_manage_organization_settings(organization_id))
  WITH CHECK (public.can_manage_organization_settings(organization_id));

DROP POLICY IF EXISTS "Dashboard display settings deletable by church managers"
  ON public.dashboard_display_settings;
CREATE POLICY "Dashboard display settings deletable by church managers"
  ON public.dashboard_display_settings
  FOR DELETE
  TO authenticated
  USING (public.can_manage_organization_settings(organization_id));

REVOKE ALL ON public.dashboard_display_settings FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboard_display_settings
  TO authenticated;
GRANT ALL ON public.dashboard_display_settings TO service_role;
