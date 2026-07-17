-- =============================================================================
-- 028_notification_function_grants.sql
-- Grant EXECUTE on notification RLS helper functions to authenticated.
-- Without these grants, RLS policies that call the helpers deny all rows,
-- so the Notifications UI appears empty even when data exists.
-- Safe to re-run.
-- =============================================================================

REVOKE ALL ON FUNCTION public.can_manage_notification_settings(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_notification_history(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_notification_templates(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_create_operational_notifications(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_notification_recipient(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.can_manage_notification_settings(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_notification_history(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_notification_templates(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_create_operational_notifications(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_notification_recipient(uuid)
  TO authenticated;

-- service_role bypasses RLS, but keep execute available for consistency
GRANT EXECUTE ON FUNCTION public.can_manage_notification_settings(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.can_view_notification_history(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_notification_templates(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.can_create_operational_notifications(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.is_notification_recipient(uuid)
  TO service_role;
