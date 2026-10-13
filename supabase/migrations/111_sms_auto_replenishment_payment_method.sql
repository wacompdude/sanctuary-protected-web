-- 111_sms_auto_replenishment_payment_method.sql
-- Save or clear the auto-replenishment payment-method reference.
-- Does not call Stripe, create an attempt, grant credits, or enable charging.

CREATE OR REPLACE FUNCTION public.record_application_sms_replenishment_payment_method(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_payment_method_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.membership_role;
  v_cfg public.organization_sms_auto_replenishment%ROWTYPE;
  v_found boolean := false;
  v_payment text;
  v_previous text;
  v_next text;
BEGIN
  IF p_organization_id IS NULL OR p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'SMS payment-method setup requires an organization and actor';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_organization_id) THEN
    RAISE EXCEPTION 'SMS payment-method setup organization does not exist';
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

  v_payment := NULLIF(btrim(COALESCE(p_payment_method_id, '')), '');
  IF v_payment IS NOT NULL AND (
    char_length(v_payment) < 8
    OR char_length(v_payment) > 255
    OR v_payment !~ '^pm_[A-Za-z0-9_]+$'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'configuration_invalid');
  END IF;

  SELECT *
  INTO v_cfg
  FROM public.organization_sms_auto_replenishment
  WHERE organization_id = p_organization_id
  FOR UPDATE;
  v_found := FOUND;

  IF NOT v_found AND v_payment IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'already_clear',
      'duplicate', true,
      'status', 'disabled'
    );
  END IF;

  IF v_found AND v_cfg.payment_method_id IS NOT DISTINCT FROM v_payment THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'duplicate',
      'duplicate', true,
      'status', v_cfg.status
    );
  END IF;

  v_previous := CASE WHEN v_found THEN v_cfg.status ELSE NULL END;
  v_next := CASE
    WHEN v_found AND v_payment IS NULL AND v_cfg.status = 'enabled'
      THEN 'payment_attention_required'
    WHEN v_found THEN v_cfg.status
    ELSE 'disabled'
  END;

  IF NOT v_found THEN
    INSERT INTO public.organization_sms_auto_replenishment (
      organization_id,
      status,
      payment_method_id
    )
    VALUES (
      p_organization_id,
      'disabled',
      v_payment
    );
  ELSE
    UPDATE public.organization_sms_auto_replenishment
    SET payment_method_id = v_payment,
        status = v_next
    WHERE organization_id = p_organization_id;
  END IF;

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
    'payment_method_changed',
    v_previous,
    v_next,
    CASE WHEN v_found THEN v_cfg.low_balance_threshold_segments ELSE NULL END,
    CASE WHEN v_found THEN v_cfg.max_auto_spend_cents ELSE NULL END,
    CASE WHEN v_found THEN v_cfg.authorized_plan_key ELSE NULL END,
    CASE WHEN v_found THEN v_cfg.authorized_package_key ELSE NULL END,
    CASE WHEN v_found THEN v_cfg.authorized_package_segments ELSE NULL END,
    CASE WHEN v_found THEN v_cfg.authorized_package_price_cents ELSE NULL END,
    CASE WHEN v_found THEN v_cfg.authorization_text_version ELSE NULL END,
    v_payment,
    CASE
      WHEN v_found AND v_cfg.payment_method_id IS NOT NULL
        THEN jsonb_build_object('previous_payment_method_id', v_cfg.payment_method_id)
      ELSE '{}'::jsonb
    END
  );

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', 'payment_method_changed',
    'status', v_next,
    'enabled', v_next = 'enabled'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_application_sms_replenishment_payment_method(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_application_sms_replenishment_payment_method(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.record_application_sms_replenishment_payment_method(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_application_sms_replenishment_payment_method(uuid, uuid, text) TO service_role;

COMMENT ON FUNCTION public.record_application_sms_replenishment_payment_method(uuid, uuid, text) IS
  'Service-role save or clear of the auto-replenishment payment-method reference. Does not enable charging, detach a Stripe payment method, grant credits, or create a replenishment attempt.';
