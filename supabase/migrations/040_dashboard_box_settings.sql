-- =============================================================================
-- 040_dashboard_box_settings.sql
-- Church-scoped dashboard summary-box customization (visibility, order, colors).
-- Additive / non-destructive. Safe to re-run.
-- Review before applying to production Supabase.
--
-- System defaults live in application registry (lib/dashboard/*).
-- This table stores church-level overrides only.
-- Campus filter continues to affect box DATA, not these settings.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- dashboard_box_settings
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.dashboard_box_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  box_key text NOT NULL,
  is_visible boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL,
  background_color text NOT NULL,
  text_color text NOT NULL,
  use_automatic_text_color boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dashboard_box_settings_box_key_check
    CHECK (
      box_key IN (
        'active_incidents',
        'unacknowledged_events',
        'camera_events',
        'security_alarm_events',
        'certifications_expiring',
        'certifications_expired',
        'upcoming_events',
        'todays_shifts',
        'unfilled_shifts',
        'pending_responses',
        'unavailable_today',
        'upcoming_training'
      )
    ),
  CONSTRAINT dashboard_box_settings_display_order_check
    CHECK (display_order BETWEEN 0 AND 1000),
  CONSTRAINT dashboard_box_settings_background_color_check
    CHECK (background_color ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT dashboard_box_settings_text_color_check
    CHECK (text_color ~ '^#[0-9A-Fa-f]{6}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS dashboard_box_settings_church_box_key_uidx
  ON public.dashboard_box_settings (church_id, box_key);

CREATE INDEX IF NOT EXISTS dashboard_box_settings_church_order_idx
  ON public.dashboard_box_settings (church_id, display_order);

CREATE INDEX IF NOT EXISTS dashboard_box_settings_church_id_idx
  ON public.dashboard_box_settings (church_id);

-- Touch updated_at (reuse existing helper from notifications/029 if present)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'touch_notifications_updated_at'
  ) THEN
    DROP TRIGGER IF EXISTS dashboard_box_settings_touch_updated_at
      ON public.dashboard_box_settings;
    CREATE TRIGGER dashboard_box_settings_touch_updated_at
      BEFORE UPDATE ON public.dashboard_box_settings
      FOR EACH ROW
      EXECUTE FUNCTION public.touch_notifications_updated_at();
  ELSIF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'set_updated_at'
  ) THEN
    DROP TRIGGER IF EXISTS dashboard_box_settings_touch_updated_at
      ON public.dashboard_box_settings;
    CREATE TRIGGER dashboard_box_settings_touch_updated_at
      BEFORE UPDATE ON public.dashboard_box_settings
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.dashboard_box_settings ENABLE ROW LEVEL SECURITY;

-- Active church members may read their church's dashboard presentation settings.
DROP POLICY IF EXISTS "Dashboard box settings viewable by church members"
  ON public.dashboard_box_settings;
CREATE POLICY "Dashboard box settings viewable by church members"
  ON public.dashboard_box_settings
  FOR SELECT
  TO authenticated
  USING (public.is_active_church_member(church_id));

-- Owners / co-owners / administrators may manage overrides
-- (via can_manage_church_settings).
DROP POLICY IF EXISTS "Dashboard box settings manageable by church managers"
  ON public.dashboard_box_settings;
CREATE POLICY "Dashboard box settings manageable by church managers"
  ON public.dashboard_box_settings
  FOR ALL
  TO authenticated
  USING (public.can_manage_church_settings(church_id))
  WITH CHECK (public.can_manage_church_settings(church_id));

-- Soft preference: allow hard delete for reset-to-defaults cleanup.
-- Prefer application upsert/delete of override rows that match system defaults.

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboard_box_settings
  TO authenticated;
GRANT ALL ON public.dashboard_box_settings TO service_role;
