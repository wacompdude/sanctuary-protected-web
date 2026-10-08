-- =============================================================================
-- 104_billing_trial_activation.sql
-- Allow the billing service role to move an organization from trial to active
-- only after a verified paid base-plan subscription invoice.
--
-- Does not disable the owner/co-owner status trigger.
-- Does not allow suspended, closed, or any other transition.
-- Do not apply until reviewed.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enforce_organization_status_owner_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    -- Narrow billing exception. The GUC is transaction-local and is set only
    -- by activate_organization_after_paid_base_subscription. auth.role() is
    -- the JWT role, so an authenticated client cannot satisfy this branch.
    IF OLD.status = 'trial'
       AND NEW.status = 'active'
       AND current_setting('app.billing_paid_subscription_activation', true) = 'on'
       AND auth.role() = 'service_role' THEN
      RETURN NEW;
    END IF;

    IF NOT public.is_organization_owner(NEW.id) THEN
      RAISE EXCEPTION 'FORBIDDEN: only church owners or co-owners can change account status';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_organization_after_paid_base_subscription(
  p_organization_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'FORBIDDEN: paid subscription activation is server-only';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization id is required';
  END IF;

  SELECT status::text
  INTO v_status
  FROM public.organizations
  WHERE id = p_organization_id;

  IF v_status IS NULL THEN
    RETURN 'missing';
  END IF;

  IF v_status = 'active' THEN
    RETURN 'noop';
  END IF;

  IF v_status <> 'trial' THEN
    RETURN 'unchanged';
  END IF;

  PERFORM set_config('app.billing_paid_subscription_activation', 'on', true);

  UPDATE public.organizations
  SET status = 'active'::public.organization_status
  WHERE id = p_organization_id
    AND status = 'trial'::public.organization_status;

  RETURN 'activated';
END;
$$;

REVOKE ALL ON FUNCTION public.activate_organization_after_paid_base_subscription(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.activate_organization_after_paid_base_subscription(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.activate_organization_after_paid_base_subscription(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.activate_organization_after_paid_base_subscription(uuid) TO service_role;

COMMENT ON FUNCTION public.activate_organization_after_paid_base_subscription(uuid) IS
  'Service-role only. Changes organizations.status from trial to active. No-ops when already active. Leaves suspended and closed unchanged.';
