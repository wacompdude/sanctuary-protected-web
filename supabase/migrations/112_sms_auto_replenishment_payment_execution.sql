-- 112_sms_auto_replenishment_payment_execution.sql
-- Attempt transitions for an off-session PaymentIntent.
-- Does not call Stripe, grant credits, or enable replenishment.

ALTER TABLE public.organization_sms_replenishment_attempts
  ADD COLUMN IF NOT EXISTS payment_method_id text;

ALTER TABLE public.organization_sms_replenishment_attempts
  DROP CONSTRAINT IF EXISTS organization_sms_replenishment_attempts_payment_method_check;

ALTER TABLE public.organization_sms_replenishment_attempts
  ADD CONSTRAINT organization_sms_replenishment_attempts_payment_method_check
  CHECK (
    payment_method_id IS NULL
    OR (
      char_length(payment_method_id) BETWEEN 8 AND 255
      AND payment_method_id ~ '^pm_[A-Za-z0-9_]+$'
    )
  );

COMMENT ON COLUMN public.organization_sms_replenishment_attempts.payment_method_id IS
  'Card payment method snapshotted when charging starts. Not a card number.';

-- ---------------------------------------------------------------------------
-- Move a claimed attempt to charging, or resume an unresolved charge.
-- Cancels a claimed attempt that is no longer eligible so it cannot charge.
-- Does not create a PaymentIntent and does not grant credits.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.begin_application_sms_replenishment_charge(
  p_attempt_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt public.organization_sms_replenishment_attempts%ROWTYPE;
  v_cfg public.organization_sms_auto_replenishment%ROWTYPE;
  v_sub public.organization_subscriptions%ROWTYPE;
  v_plan_key text;
  v_package_key text;
  v_package_segments integer;
  v_package_price integer;
  v_package_count integer := 0;
  v_spent integer := 0;
  v_cfg_found boolean := false;
BEGIN
  IF p_attempt_id IS NULL THEN
    RAISE EXCEPTION 'SMS replenishment charge requires an attempt';
  END IF;

  SELECT *
  INTO v_attempt
  FROM public.organization_sms_replenishment_attempts
  WHERE id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'missing');
  END IF;

  IF v_attempt.status = 'succeeded' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'already_settled',
      'attempt_id', v_attempt.id,
      'status', v_attempt.status
    );
  END IF;

  IF v_attempt.status IN ('failed', 'canceled') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'invalid_state',
      'attempt_id', v_attempt.id,
      'status', v_attempt.status
    );
  END IF;

  IF v_attempt.status = 'payment_pending' AND v_attempt.provider_payment_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'awaiting_settlement',
      'attempt_id', v_attempt.id,
      'organization_id', v_attempt.organization_id,
      'status', v_attempt.status,
      'payment_method_id', v_attempt.payment_method_id,
      'expected_amount_cents', v_attempt.expected_amount_cents,
      'tax_cents', v_attempt.tax_cents,
      'currency', v_attempt.currency,
      'package_segments', v_attempt.package_segments,
      'plan_key', v_attempt.plan_key,
      'package_key', v_attempt.package_key,
      'provider_idempotency_key', v_attempt.provider_idempotency_key,
      'provider_payment_id', v_attempt.provider_payment_id
    );
  END IF;

  SELECT *
  INTO v_cfg
  FROM public.organization_sms_auto_replenishment
  WHERE organization_id = v_attempt.organization_id
  FOR UPDATE;
  v_cfg_found := FOUND;

  IF v_attempt.status = 'charging' THEN
    IF v_attempt.provider_payment_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'ok', true,
        'outcome', 'awaiting_settlement',
        'attempt_id', v_attempt.id,
        'organization_id', v_attempt.organization_id,
        'status', v_attempt.status,
        'payment_method_id', v_attempt.payment_method_id,
        'expected_amount_cents', v_attempt.expected_amount_cents,
        'currency', v_attempt.currency,
        'package_segments', v_attempt.package_segments,
        'plan_key', v_attempt.plan_key,
        'package_key', v_attempt.package_key,
        'provider_idempotency_key', v_attempt.provider_idempotency_key,
        'provider_payment_id', v_attempt.provider_payment_id
      );
    END IF;

    IF NOT v_cfg_found
      OR v_cfg.status IS DISTINCT FROM 'enabled'
      OR v_cfg.payment_method_id IS DISTINCT FROM v_attempt.payment_method_id THEN
      RETURN jsonb_build_object(
        'ok', false,
        'outcome', 'reconciliation_required',
        'attempt_id', v_attempt.id,
        'status', v_attempt.status,
        'provider_idempotency_key', v_attempt.provider_idempotency_key
      );
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'charging',
      'attempt_id', v_attempt.id,
      'organization_id', v_attempt.organization_id,
      'status', 'charging',
      'payment_method_id', v_attempt.payment_method_id,
      'expected_amount_cents', v_attempt.expected_amount_cents,
      'currency', v_attempt.currency,
      'package_segments', v_attempt.package_segments,
      'plan_key', v_attempt.plan_key,
      'package_key', v_attempt.package_key,
      'provider_idempotency_key', v_attempt.provider_idempotency_key,
      'provider_payment_id', NULL
    );
  END IF;

  IF v_attempt.status IS DISTINCT FROM 'claimed' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'invalid_state',
      'attempt_id', v_attempt.id,
      'status', v_attempt.status
    );
  END IF;

  IF NOT v_cfg_found OR v_cfg.status IS DISTINCT FROM 'enabled' THEN
    UPDATE public.organization_sms_replenishment_attempts
    SET status = 'canceled', canceled_at = now()
    WHERE id = v_attempt.id;
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'configuration_disabled',
      'attempt_id', v_attempt.id,
      'status', 'canceled'
    );
  END IF;

  IF v_cfg.payment_method_id IS NULL
    OR v_cfg.payment_method_id !~ '^pm_[A-Za-z0-9_]+$' THEN
    UPDATE public.organization_sms_replenishment_attempts
    SET status = 'canceled', canceled_at = now()
    WHERE id = v_attempt.id;
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'payment_method_missing',
      'attempt_id', v_attempt.id,
      'status', 'canceled'
    );
  END IF;

  SELECT *
  INTO v_sub
  FROM public.organization_subscriptions
  WHERE organization_id = v_attempt.organization_id
    AND status = 'active'
  ORDER BY started_at DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND
    OR v_sub.current_period_start IS DISTINCT FROM v_attempt.subscription_period_start
    OR v_sub.current_period_end IS DISTINCT FROM v_attempt.subscription_period_end THEN
    UPDATE public.organization_sms_replenishment_attempts
    SET status = 'canceled', canceled_at = now()
    WHERE id = v_attempt.id;
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'not_active',
      'attempt_id', v_attempt.id,
      'status', 'canceled'
    );
  END IF;

  SELECT count(*)
  INTO v_package_count
  FROM public.resolve_current_application_sms_package(v_sub.plan_id);
  IF v_package_count IS DISTINCT FROM 1 THEN
    UPDATE public.organization_sms_replenishment_attempts
    SET status = 'canceled', canceled_at = now()
    WHERE id = v_attempt.id;
    RETURN jsonb_build_object('ok', false, 'outcome', 'catalog_invalid', 'attempt_id', v_attempt.id);
  END IF;

  SELECT plan_key, package_key, package_segments, package_price_cents
  INTO v_plan_key, v_package_key, v_package_segments, v_package_price
  FROM public.resolve_current_application_sms_package(v_sub.plan_id);

  IF v_package_price IS NULL
    OR v_package_price IS DISTINCT FROM v_attempt.expected_amount_cents
    OR v_package_segments IS DISTINCT FROM v_attempt.package_segments
    OR v_plan_key IS DISTINCT FROM v_attempt.plan_key
    OR v_package_key IS DISTINCT FROM v_attempt.package_key THEN
    UPDATE public.organization_sms_replenishment_attempts
    SET status = 'canceled', canceled_at = now()
    WHERE id = v_attempt.id;
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'amount_mismatch',
      'attempt_id', v_attempt.id,
      'status', 'canceled'
    );
  END IF;

  IF v_cfg.authorized_package_price_cents IS NULL
    OR v_package_price > v_cfg.authorized_package_price_cents THEN
    UPDATE public.organization_sms_auto_replenishment
    SET status = 'authorization_review_required'
    WHERE organization_id = v_attempt.organization_id;

    INSERT INTO public.organization_sms_auto_replenishment_events (
      organization_id,
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
      v_attempt.organization_id,
      'authorization_review_required',
      v_cfg.status,
      'authorization_review_required',
      v_cfg.low_balance_threshold_segments,
      v_cfg.max_auto_spend_cents,
      v_cfg.authorized_plan_key,
      v_cfg.authorized_package_key,
      v_cfg.authorized_package_segments,
      v_cfg.authorized_package_price_cents,
      v_cfg.authorization_text_version,
      v_cfg.payment_method_id,
      jsonb_build_object('current_package_price_cents', v_package_price)
    );

    UPDATE public.organization_sms_replenishment_attempts
    SET status = 'canceled', canceled_at = now()
    WHERE id = v_attempt.id;

    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'authorization_review_required',
      'attempt_id', v_attempt.id,
      'status', 'canceled'
    );
  END IF;

  SELECT COALESCE(SUM(expected_amount_cents + tax_cents), 0)::integer
  INTO v_spent
  FROM public.organization_sms_replenishment_attempts
  WHERE organization_id = v_attempt.organization_id
    AND status = 'succeeded'
    AND subscription_period_start = v_attempt.subscription_period_start
    AND subscription_period_end = v_attempt.subscription_period_end;

  IF v_cfg.max_auto_spend_cents IS NULL
    OR v_spent + v_attempt.expected_amount_cents + v_attempt.tax_cents > v_cfg.max_auto_spend_cents THEN
    UPDATE public.organization_sms_replenishment_attempts
    SET status = 'canceled', canceled_at = now()
    WHERE id = v_attempt.id;
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'period_cap_reached',
      'attempt_id', v_attempt.id,
      'status', 'canceled'
    );
  END IF;

  UPDATE public.organization_sms_replenishment_attempts
  SET status = 'charging',
      payment_method_id = v_cfg.payment_method_id,
      charging_at = now()
  WHERE id = v_attempt.id;

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', 'charging',
    'attempt_id', v_attempt.id,
    'organization_id', v_attempt.organization_id,
    'status', 'charging',
    'payment_method_id', v_cfg.payment_method_id,
    'expected_amount_cents', v_attempt.expected_amount_cents,
    'currency', v_attempt.currency,
    'package_segments', v_attempt.package_segments,
    'plan_key', v_attempt.plan_key,
    'package_key', v_attempt.package_key,
    'provider_idempotency_key', v_attempt.provider_idempotency_key,
    'provider_payment_id', NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.begin_application_sms_replenishment_charge(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.begin_application_sms_replenishment_charge(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.begin_application_sms_replenishment_charge(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.begin_application_sms_replenishment_charge(uuid) TO service_role;

COMMENT ON FUNCTION public.begin_application_sms_replenishment_charge(uuid) IS
  'Service-role transition from claimed to charging. Does not call Stripe or grant credits.';

-- ---------------------------------------------------------------------------
-- Persist the PaymentIntent id and wait for the verified webhook.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_application_sms_replenishment_provider_payment(
  p_attempt_id uuid,
  p_provider_payment_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt public.organization_sms_replenishment_attempts%ROWTYPE;
  v_payment text;
BEGIN
  IF p_attempt_id IS NULL THEN
    RAISE EXCEPTION 'SMS replenishment provider payment requires an attempt';
  END IF;

  v_payment := NULLIF(btrim(COALESCE(p_provider_payment_id, '')), '');
  IF v_payment IS NULL
    OR char_length(v_payment) > 255
    OR v_payment !~ '^pi_[A-Za-z0-9_]+$' THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'provider_payment_invalid');
  END IF;

  SELECT *
  INTO v_attempt
  FROM public.organization_sms_replenishment_attempts
  WHERE id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'missing');
  END IF;

  IF v_attempt.status = 'succeeded' THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'already_settled', 'attempt_id', v_attempt.id);
  END IF;

  IF v_attempt.status NOT IN ('charging', 'payment_pending') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'invalid_state',
      'attempt_id', v_attempt.id,
      'status', v_attempt.status
    );
  END IF;

  IF v_attempt.provider_payment_id IS NOT NULL
    AND v_attempt.provider_payment_id IS DISTINCT FROM v_payment THEN
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'idempotency_mismatch',
      'attempt_id', v_attempt.id
    );
  END IF;

  IF v_attempt.provider_payment_id = v_payment AND v_attempt.status = 'payment_pending' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'duplicate',
      'duplicate', true,
      'attempt_id', v_attempt.id,
      'status', 'payment_pending',
      'provider_payment_id', v_payment
    );
  END IF;

  UPDATE public.organization_sms_replenishment_attempts
  SET status = 'payment_pending',
      provider_payment_id = v_payment,
      payment_pending_at = COALESCE(payment_pending_at, now())
  WHERE id = v_attempt.id;

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', 'payment_pending',
    'duplicate', false,
    'attempt_id', v_attempt.id,
    'status', 'payment_pending',
    'provider_payment_id', v_payment
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'idempotency_mismatch',
      'attempt_id', p_attempt_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.record_application_sms_replenishment_provider_payment(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_application_sms_replenishment_provider_payment(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.record_application_sms_replenishment_provider_payment(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_application_sms_replenishment_provider_payment(uuid, text) TO service_role;

COMMENT ON FUNCTION public.record_application_sms_replenishment_provider_payment(uuid, text) IS
  'Service-role correlation of one PaymentIntent to an open attempt. Does not grant credits.';

-- ---------------------------------------------------------------------------
-- Definitive payment failure. Does not grant or remove credits.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fail_application_sms_replenishment_payment(
  p_attempt_id uuid,
  p_safe_failure_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt public.organization_sms_replenishment_attempts%ROWTYPE;
  v_cfg public.organization_sms_auto_replenishment%ROWTYPE;
  v_code text;
  v_cfg_found boolean := false;
BEGIN
  IF p_attempt_id IS NULL THEN
    RAISE EXCEPTION 'SMS replenishment failure requires an attempt';
  END IF;

  v_code := NULLIF(btrim(COALESCE(p_safe_failure_code, '')), '');
  IF v_code IS NULL OR v_code !~ '^[a-z0-9_]{1,64}$' THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'failure_code_invalid');
  END IF;

  SELECT *
  INTO v_attempt
  FROM public.organization_sms_replenishment_attempts
  WHERE id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'missing');
  END IF;

  IF v_attempt.status = 'succeeded' THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'already_settled', 'attempt_id', v_attempt.id);
  END IF;

  IF v_attempt.status = 'failed' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'duplicate',
      'duplicate', true,
      'attempt_id', v_attempt.id,
      'status', 'failed'
    );
  END IF;

  IF v_attempt.status NOT IN ('charging', 'payment_pending') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'invalid_state',
      'attempt_id', v_attempt.id,
      'status', v_attempt.status
    );
  END IF;

  UPDATE public.organization_sms_replenishment_attempts
  SET status = 'failed',
      safe_failure_code = v_code,
      failed_at = now()
  WHERE id = v_attempt.id;

  SELECT *
  INTO v_cfg
  FROM public.organization_sms_auto_replenishment
  WHERE organization_id = v_attempt.organization_id
  FOR UPDATE;
  v_cfg_found := FOUND;

  IF v_cfg_found AND v_cfg.status = 'enabled' THEN
    UPDATE public.organization_sms_auto_replenishment
    SET status = 'payment_attention_required'
    WHERE organization_id = v_attempt.organization_id;

    INSERT INTO public.organization_sms_auto_replenishment_events (
      organization_id,
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
      v_attempt.organization_id,
      'payment_attention_required',
      'enabled',
      'payment_attention_required',
      v_cfg.low_balance_threshold_segments,
      v_cfg.max_auto_spend_cents,
      v_cfg.authorized_plan_key,
      v_cfg.authorized_package_key,
      v_cfg.authorized_package_segments,
      v_cfg.authorized_package_price_cents,
      v_cfg.authorization_text_version,
      v_cfg.payment_method_id,
      jsonb_build_object('safe_failure_code', v_code, 'attempt_id', v_attempt.id)
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', 'failed',
    'duplicate', false,
    'attempt_id', v_attempt.id,
    'status', 'failed',
    'safe_failure_code', v_code
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fail_application_sms_replenishment_payment(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fail_application_sms_replenishment_payment(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.fail_application_sms_replenishment_payment(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fail_application_sms_replenishment_payment(uuid, text) TO service_role;

COMMENT ON FUNCTION public.fail_application_sms_replenishment_payment(uuid, text) IS
  'Service-role definitive payment failure. Moves an enabled configuration to payment_attention_required. Does not grant credits or detach a payment method.';
