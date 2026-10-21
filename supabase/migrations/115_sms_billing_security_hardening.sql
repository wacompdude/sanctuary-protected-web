-- 115_sms_billing_security_hardening.sql
-- Phase 5C-3C-2E-3Z: tighten purchased SMS balance SELECT RLS and require an
-- owner/co_owner actor for tax-attention resolution.
-- Does not change balances, ledger rows, attempts, PaymentMethods, or grants.

-- ---------------------------------------------------------------------------
-- F-3Y-04: purchased SMS balance SELECT follows billing-view roles only
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS organization_sms_credit_balances_select
  ON public.organization_sms_credit_balances;

CREATE POLICY organization_sms_credit_balances_select
  ON public.organization_sms_credit_balances
  FOR SELECT TO authenticated
  USING (public.can_view_organization_billing(organization_id));

COMMENT ON POLICY organization_sms_credit_balances_select
  ON public.organization_sms_credit_balances IS
  'Owner, co-owner, or administrator may SELECT purchased SMS balances. Other membership roles cannot.';

-- Financial writes remain revoked for authenticated (unchanged from foundation).
REVOKE INSERT, UPDATE, DELETE ON public.organization_sms_credit_balances FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.organization_sms_credit_balances FROM anon;

-- ---------------------------------------------------------------------------
-- F-3Y-05: tax-attention resolve requires trusted actor membership
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.resolve_application_sms_replenishment_tax_attention(uuid);

CREATE OR REPLACE FUNCTION public.resolve_application_sms_replenishment_tax_attention(
  p_organization_id uuid,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.membership_role;
  v_cfg public.organization_sms_auto_replenishment%ROWTYPE;
BEGIN
  IF p_organization_id IS NULL OR p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'SMS tax-attention resolution requires an organization and actor';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_organization_id) THEN
    RAISE EXCEPTION 'SMS tax-attention resolution organization does not exist';
  END IF;

  SELECT m.role
  INTO v_role
  FROM public.organization_memberships m
  WHERE m.organization_id = p_organization_id
    AND m.user_id = p_actor_user_id
    AND m.status = 'active';

  IF NOT FOUND OR v_role NOT IN ('owner', 'co_owner') THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'forbidden');
  END IF;

  SELECT *
  INTO v_cfg
  FROM public.organization_sms_auto_replenishment
  WHERE organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND OR v_cfg.status IS DISTINCT FROM 'tax_attention_required' THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'invalid_state');
  END IF;

  PERFORM set_config('sms.tax_attention_resolution', 'allowed', true);

  UPDATE public.organization_sms_auto_replenishment
  SET status = 'enabled',
      enabled_by = p_actor_user_id,
      enabled_at = now()
  WHERE organization_id = p_organization_id;

  INSERT INTO public.organization_sms_auto_replenishment_events (
    organization_id,
    actor_user_id,
    action,
    previous_status,
    new_status,
    threshold_segments,
    max_auto_spend_cents,
    authorized_plan_key,
    authorized_package_key,
    authorized_package_segments,
    authorized_package_price_cents,
    authorization_text_version,
    payment_method_id,
    metadata
  )
  VALUES (
    p_organization_id,
    p_actor_user_id,
    'resumed',
    'tax_attention_required',
    'enabled',
    v_cfg.low_balance_threshold_segments,
    v_cfg.max_auto_spend_cents,
    v_cfg.authorized_plan_key,
    v_cfg.authorized_package_key,
    v_cfg.authorized_package_segments,
    v_cfg.authorized_package_price_cents,
    v_cfg.authorization_text_version,
    v_cfg.payment_method_id,
    jsonb_build_object('from', 'tax_attention_required')
  );

  RETURN jsonb_build_object('ok', true, 'outcome', 'enabled');
END;
$$;

COMMENT ON FUNCTION public.resolve_application_sms_replenishment_tax_attention(uuid, uuid) IS
  'Owner/co_owner resume from tax_attention_required. Service-role EXECUTE only. Does not charge or grant credits.';

REVOKE ALL ON FUNCTION public.resolve_application_sms_replenishment_tax_attention(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_application_sms_replenishment_tax_attention(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.resolve_application_sms_replenishment_tax_attention(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_application_sms_replenishment_tax_attention(uuid, uuid) TO service_role;

-- Reaffirm admin adjustment isolation is unchanged by this migration.
REVOKE ALL ON FUNCTION public.adjust_application_sms_purchased_credits(
  uuid, integer, text, text, uuid, uuid, jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.adjust_application_sms_purchased_credits(
  uuid, integer, text, text, uuid, uuid, jsonb
) FROM anon;
REVOKE ALL ON FUNCTION public.adjust_application_sms_purchased_credits(
  uuid, integer, text, text, uuid, uuid, jsonb
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_application_sms_purchased_credits(
  uuid, integer, text, text, uuid, uuid, jsonb
) TO service_role;
