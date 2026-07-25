-- =============================================================================
-- 049_dashboard_active_safety_concerns_box.sql
-- Allow dashboard_box_settings to store Known Safety Concerns tile overrides.
-- Additive. Safe to re-run.
-- =============================================================================

ALTER TABLE public.dashboard_box_settings
  DROP CONSTRAINT IF EXISTS dashboard_box_settings_box_key_check;

ALTER TABLE public.dashboard_box_settings
  ADD CONSTRAINT dashboard_box_settings_box_key_check
  CHECK (
    box_key IN (
      'active_incidents',
      'active_safety_concerns',
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
  );
