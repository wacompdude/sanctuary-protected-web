-- =============================================================================
-- 067_temporary_permission_update_support.sql
-- Support editing temporary user permissions and recalculating status on update.
-- =============================================================================

ALTER TYPE public.security_audit_event_type
  ADD VALUE IF NOT EXISTS 'user_permission.updated';

CREATE OR REPLACE FUNCTION public.user_permissions_sync_expiry_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Keep explicit revocations intact.
  IF NEW.status = 'revoked'::public.user_permission_status THEN
    RETURN NEW;
  END IF;

  IF NEW.expires_at IS NOT NULL AND NEW.expires_at <= now() THEN
    NEW.status := 'expired'::public.user_permission_status;
  ELSIF NEW.effective_at IS NOT NULL AND NEW.effective_at > now() THEN
    NEW.status := 'scheduled'::public.user_permission_status;
  ELSE
    NEW.status := 'active'::public.user_permission_status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
