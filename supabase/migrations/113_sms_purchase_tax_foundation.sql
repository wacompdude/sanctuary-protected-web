-- 113_sms_purchase_tax_foundation.sql
-- Persist a Stripe tax snapshot before an automatic SMS charge.
-- Does not call Stripe, grant credits, create a registration, or enable replenishment.

ALTER TABLE public.organization_sms_replenishment_attempts
  ADD COLUMN IF NOT EXISTS tax_calculation_id text,
  ADD COLUMN IF NOT EXISTS tax_calculation_expires_at timestamptz;

ALTER TABLE public.organization_sms_replenishment_attempts
  DROP CONSTRAINT IF EXISTS organization_sms_replenishment_attempts_tax_calculation_check;

ALTER TABLE public.organization_sms_replenishment_attempts
  ADD CONSTRAINT organization_sms_replenishment_attempts_tax_calculation_check
  CHECK (
    tax_calculation_id IS NULL
    OR tax_calculation_id ~ '^taxcalc_[A-Za-z0-9_]+$'
  );

CREATE UNIQUE INDEX IF NOT EXISTS organization_sms_replenishment_attempts_tax_calculation_uidx
  ON public.organization_sms_replenishment_attempts (tax_calculation_id)
  WHERE tax_calculation_id IS NOT NULL;

COMMENT ON COLUMN public.organization_sms_replenishment_attempts.tax_calculation_id IS
  'Stripe Tax Calculation id snapshotted before PaymentIntent creation. Not a raw tax payload.';

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.organization_sms_auto_replenishment'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%authorization_review_required%'
    AND pg_get_constraintdef(oid) NOT ILIKE '%tax_attention_required%';
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.organization_sms_auto_replenishment DROP CONSTRAINT %I', constraint_name);
  END IF;
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.organization_sms_auto_replenishment_events'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%authorization_review_required%'
    AND pg_get_constraintdef(oid) NOT ILIKE '%tax_attention_required%';
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.organization_sms_auto_replenishment_events DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE public.organization_sms_auto_replenishment
  ADD CONSTRAINT organization_sms_auto_replenishment_status_check
  CHECK (status IN (
    'disabled',
    'enabled',
    'payment_attention_required',
    'authorization_review_required',
    'tax_attention_required'
  ));

ALTER TABLE public.organization_sms_auto_replenishment_events
  ADD CONSTRAINT organization_sms_auto_replenishment_events_action_check
  CHECK (action IN (
    'enabled',
    'disabled',
    'resumed',
    'reauthorized',
    'threshold_changed',
    'spending_cap_changed',
    'payment_method_changed',
    'payment_attention_required',
    'authorization_review_required',
    'tax_attention_required'
  ));

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
    'tax_cents', v_attempt.tax_cents,
    'tax_calculation_id', v_attempt.tax_calculation_id,
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
    'tax_cents', v_attempt.tax_cents,
    'tax_calculation_id', v_attempt.tax_calculation_id,
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

  IF v_attempt.tax_calculation_id IS NULL
    OR v_attempt.tax_calculation_expires_at IS NULL
    OR v_attempt.tax_calculation_expires_at <= now() THEN
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'tax_not_ready',
      'attempt_id', v_attempt.id,
      'status', v_attempt.status
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
    'tax_cents', v_attempt.tax_cents,
    'tax_calculation_id', v_attempt.tax_calculation_id,
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

CREATE OR REPLACE FUNCTION public.guard_sms_replenishment_tax_attention()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'tax_attention_required'
    AND NEW.status NOT IN ('tax_attention_required', 'disabled')
    AND current_setting('sms.tax_attention_resolution', true) IS DISTINCT FROM 'allowed' THEN
    RAISE EXCEPTION 'SMS replenishment tax attention requires an explicit resolution';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_sms_replenishment_tax_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.tax_calculation_id IS NOT NULL
    AND OLD.tax_calculation_expires_at IS NOT NULL
    AND OLD.tax_calculation_expires_at > now()
    AND NEW.tax_cents IS DISTINCT FROM OLD.tax_cents THEN
    RAISE EXCEPTION 'SMS replenishment tax snapshot is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organization_sms_auto_replenishment_tax_attention
  ON public.organization_sms_auto_replenishment;
CREATE TRIGGER organization_sms_auto_replenishment_tax_attention
  BEFORE UPDATE ON public.organization_sms_auto_replenishment
  FOR EACH ROW EXECUTE FUNCTION public.guard_sms_replenishment_tax_attention();

DROP TRIGGER IF EXISTS organization_sms_replenishment_attempts_tax_snapshot
  ON public.organization_sms_replenishment_attempts;
CREATE TRIGGER organization_sms_replenishment_attempts_tax_snapshot
  BEFORE UPDATE ON public.organization_sms_replenishment_attempts
  FOR EACH ROW EXECUTE FUNCTION public.guard_sms_replenishment_tax_snapshot();

CREATE OR REPLACE FUNCTION public.record_application_sms_replenishment_tax_snapshot(
  p_attempt_id uuid,
  p_calculation_id text,
  p_tax_cents integer,
  p_total_cents integer,
  p_expires_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt public.organization_sms_replenishment_attempts%ROWTYPE;
  v_cfg public.organization_sms_auto_replenishment%ROWTYPE;
  v_spent integer := 0;
  v_calculation text;
BEGIN
  IF p_attempt_id IS NULL THEN
    RAISE EXCEPTION 'SMS replenishment tax snapshot requires an attempt';
  END IF;
  v_calculation := NULLIF(btrim(COALESCE(p_calculation_id, '')), '');
  IF v_calculation IS NULL OR v_calculation !~ '^taxcalc_[A-Za-z0-9_]+$' THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'calculation_invalid');
  END IF;
  IF p_tax_cents IS NULL OR p_tax_cents < 0 OR p_total_cents IS NULL OR p_total_cents <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'amount_invalid');
  END IF;
  IF p_expires_at IS NULL OR p_expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'calculation_expired');
  END IF;

  SELECT *
  INTO v_attempt
  FROM public.organization_sms_replenishment_attempts
  WHERE id = p_attempt_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'missing');
  END IF;
  IF v_attempt.status IS DISTINCT FROM 'claimed' OR v_attempt.provider_payment_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'invalid_state', 'status', v_attempt.status);
  END IF;
  IF p_total_cents IS DISTINCT FROM v_attempt.expected_amount_cents + p_tax_cents THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'total_mismatch');
  END IF;

  IF v_attempt.tax_calculation_id IS NOT NULL
    AND v_attempt.tax_calculation_expires_at IS NOT NULL
    AND v_attempt.tax_calculation_expires_at > now() THEN
    IF v_attempt.tax_calculation_id = v_calculation
      AND v_attempt.tax_cents = p_tax_cents THEN
      RETURN jsonb_build_object('ok', true, 'outcome', 'duplicate', 'attempt_id', v_attempt.id);
    END IF;
    RETURN jsonb_build_object('ok', false, 'outcome', 'idempotency_mismatch', 'attempt_id', v_attempt.id);
  END IF;

  SELECT *
  INTO v_cfg
  FROM public.organization_sms_auto_replenishment
  WHERE organization_id = v_attempt.organization_id
  FOR UPDATE;
  IF NOT FOUND OR v_cfg.status IS DISTINCT FROM 'enabled' THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'configuration_disabled');
  END IF;

  SELECT COALESCE(SUM(expected_amount_cents + tax_cents), 0)::integer
  INTO v_spent
  FROM public.organization_sms_replenishment_attempts
  WHERE organization_id = v_attempt.organization_id
    AND status = 'succeeded'
    AND subscription_period_start = v_attempt.subscription_period_start
    AND subscription_period_end = v_attempt.subscription_period_end;

  IF v_cfg.max_auto_spend_cents IS NULL
    OR v_spent + v_attempt.expected_amount_cents + p_tax_cents > v_cfg.max_auto_spend_cents THEN
    UPDATE public.organization_sms_replenishment_attempts
    SET status = 'canceled', canceled_at = now()
    WHERE id = v_attempt.id;
    RETURN jsonb_build_object('ok', false, 'outcome', 'period_cap_reached', 'attempt_id', v_attempt.id);
  END IF;

  UPDATE public.organization_sms_replenishment_attempts
  SET tax_calculation_id = v_calculation,
      tax_calculation_expires_at = p_expires_at,
      tax_cents = p_tax_cents
  WHERE id = v_attempt.id;

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', 'recorded',
    'attempt_id', v_attempt.id,
    'expected_amount_cents', v_attempt.expected_amount_cents,
    'tax_cents', p_tax_cents,
    'total_cents', p_total_cents
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_application_sms_replenishment_tax_snapshot(uuid, text, integer, integer, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_application_sms_replenishment_tax_snapshot(uuid, text, integer, integer, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.record_application_sms_replenishment_tax_snapshot(uuid, text, integer, integer, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_application_sms_replenishment_tax_snapshot(uuid, text, integer, integer, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_application_sms_replenishment_tax_attention(
  p_organization_id uuid,
  p_safe_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg public.organization_sms_auto_replenishment%ROWTYPE;
  v_code text;
BEGIN
  v_code := NULLIF(btrim(COALESCE(p_safe_code, '')), '');
  IF p_organization_id IS NULL OR v_code IS NULL OR v_code !~ '^[a-z0-9_]{1,64}$' THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'invalid');
  END IF;
  SELECT *
  INTO v_cfg
  FROM public.organization_sms_auto_replenishment
  WHERE organization_id = p_organization_id
  FOR UPDATE;
  IF NOT FOUND OR v_cfg.status IS DISTINCT FROM 'enabled' THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'not_enabled');
  END IF;

  UPDATE public.organization_sms_auto_replenishment
  SET status = 'tax_attention_required'
  WHERE organization_id = p_organization_id;

  UPDATE public.organization_sms_replenishment_attempts
  SET status = 'canceled', canceled_at = now()
  WHERE organization_id = p_organization_id
    AND status = 'claimed';

  INSERT INTO public.organization_sms_auto_replenishment_events (
    organization_id, action, previous_status, new_status,
    threshold_segments, max_auto_spend_cents, authorized_plan_key,
    authorized_package_key, authorized_package_segments, authorized_package_price_cents,
    authorization_text_version, payment_method_id, metadata
  )
  VALUES (
    p_organization_id, 'tax_attention_required', v_cfg.status, 'tax_attention_required',
    v_cfg.low_balance_threshold_segments, v_cfg.max_auto_spend_cents, v_cfg.authorized_plan_key,
    v_cfg.authorized_package_key, v_cfg.authorized_package_segments, v_cfg.authorized_package_price_cents,
    v_cfg.authorization_text_version, v_cfg.payment_method_id,
    jsonb_build_object('safe_code', v_code)
  );

  RETURN jsonb_build_object('ok', true, 'outcome', 'tax_attention_required');
END;
$$;

REVOKE ALL ON FUNCTION public.mark_application_sms_replenishment_tax_attention(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_application_sms_replenishment_tax_attention(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.mark_application_sms_replenishment_tax_attention(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mark_application_sms_replenishment_tax_attention(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.resolve_application_sms_replenishment_tax_attention(
  p_organization_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg public.organization_sms_auto_replenishment%ROWTYPE;
BEGIN
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
  SET status = 'enabled'
  WHERE organization_id = p_organization_id;
  RETURN jsonb_build_object('ok', true, 'outcome', 'enabled');
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_application_sms_replenishment_tax_attention(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_application_sms_replenishment_tax_attention(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.resolve_application_sms_replenishment_tax_attention(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_application_sms_replenishment_tax_attention(uuid) TO service_role;
