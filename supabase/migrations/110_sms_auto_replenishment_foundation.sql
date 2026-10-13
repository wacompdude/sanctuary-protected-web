-- =============================================================================
-- 110_sms_auto_replenishment_foundation.sql
-- Application SMS auto-replenishment foundation.
-- Does not call Stripe or Bird. Does not grant credits by itself.
-- Does not change purchased balances, reserved credits, usage, allocations,
-- deliveries, billing transactions, or existing ledger rows.
-- The only balance-row data change is forcing the legacy authorization flag
-- to false. That flag is not customer consent.
-- =============================================================================

ALTER TABLE public.organization_sms_credit_balances
  ALTER COLUMN auto_replenish_enabled SET DEFAULT false;

ALTER TABLE public.organization_sms_credit_balances
  DISABLE TRIGGER organization_sms_credit_balances_set_updated_at;

UPDATE public.organization_sms_credit_balances
SET auto_replenish_enabled = false
WHERE auto_replenish_enabled IS DISTINCT FROM false;

ALTER TABLE public.organization_sms_credit_balances
  ENABLE TRIGGER organization_sms_credit_balances_set_updated_at;

COMMENT ON COLUMN public.organization_sms_credit_balances.auto_replenish_enabled IS
  'DEPRECATED and not customer authorization. Default false. Forced false by migration 110. Use organization_sms_auto_replenishment.';

COMMENT ON COLUMN public.organization_sms_credit_balances.low_balance_threshold IS
  'DEPRECATED. Not the auto-replenishment threshold. Use organization_sms_auto_replenishment.low_balance_threshold_segments.';

COMMENT ON COLUMN public.organization_sms_credit_balances.max_auto_blocks_per_period IS
  'DEPRECATED. Not the automatic spending cap.';

COMMENT ON COLUMN public.organization_sms_credit_balances.auto_blocks_used_this_period IS
  'DEPRECATED. Not the automatic spend counter.';

COMMENT ON COLUMN public.organization_sms_credit_balances.grace_credits_remaining IS
  'DEPRECATED for auto-replenishment. Not part of application SMS capacity.';

COMMENT ON COLUMN public.organization_sms_credit_balances.period_start IS
  'DEPRECATED for auto-replenishment. The spending period is the subscription period.';

COMMENT ON COLUMN public.organization_sms_credit_balances.period_end IS
  'DEPRECATED for auto-replenishment. The spending period is the subscription period.';

COMMENT ON COLUMN public.billing_extra_items.auto_purchase_allowed IS
  'Catalog capability only. Not organization authorization to charge.';

-- ---------------------------------------------------------------------------
-- Configuration
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.organization_sms_auto_replenishment (
  organization_id uuid PRIMARY KEY
    REFERENCES public.organizations (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'disabled'
    CHECK (status IN (
      'disabled',
      'enabled',
      'payment_attention_required',
      'authorization_review_required'
    )),
  low_balance_threshold_segments integer
    CHECK (
      low_balance_threshold_segments IS NULL
      OR low_balance_threshold_segments >= 1
    ),
  max_auto_spend_cents integer
    CHECK (
      max_auto_spend_cents IS NULL
      OR (max_auto_spend_cents >= 1 AND max_auto_spend_cents <= 50000)
    ),
  authorized_plan_key text,
  authorized_package_key text,
  authorized_package_segments integer
    CHECK (authorized_package_segments IS NULL OR authorized_package_segments > 0),
  authorized_package_price_cents integer
    CHECK (authorized_package_price_cents IS NULL OR authorized_package_price_cents > 0),
  authorization_text_version text,
  payment_method_id text
    CHECK (
      payment_method_id IS NULL
      OR (
        char_length(payment_method_id) BETWEEN 8 AND 255
        AND payment_method_id ~ '^pm_[A-Za-z0-9_]+$'
      )
    ),
  enabled_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  enabled_at timestamptz,
  disabled_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.organization_sms_auto_replenishment IS
  'Explicit organization authorization for automatic application SMS purchases. Absent or disabled means off.';

DROP TRIGGER IF EXISTS organization_sms_auto_replenishment_set_updated_at
  ON public.organization_sms_auto_replenishment;
CREATE TRIGGER organization_sms_auto_replenishment_set_updated_at
  BEFORE UPDATE ON public.organization_sms_auto_replenishment
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Append-only authorization events
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.organization_sms_auto_replenishment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations (id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  action text NOT NULL
    CHECK (action IN (
      'enabled',
      'disabled',
      'resumed',
      'reauthorized',
      'threshold_changed',
      'spending_cap_changed',
      'payment_method_changed',
      'payment_attention_required',
      'authorization_review_required'
    )),
  previous_status text,
  new_status text,
  threshold_segments integer,
  max_auto_spend_cents integer,
  authorized_plan_key text,
  authorized_package_key text,
  authorized_package_segments integer,
  authorized_package_price_cents integer,
  authorization_text_version text,
  payment_method_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS organization_sms_auto_replenishment_events_org_idx
  ON public.organization_sms_auto_replenishment_events (organization_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.reject_sms_auto_replenishment_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE'
    AND current_setting('app.sms_auto_event_cleanup', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'SMS auto-replenishment authorization events are append-only';
END;
$$;

DROP TRIGGER IF EXISTS organization_sms_auto_replenishment_events_append_only
  ON public.organization_sms_auto_replenishment_events;
CREATE TRIGGER organization_sms_auto_replenishment_events_append_only
  BEFORE UPDATE OR DELETE ON public.organization_sms_auto_replenishment_events
  FOR EACH ROW EXECUTE FUNCTION public.reject_sms_auto_replenishment_event_mutation();

CREATE OR REPLACE FUNCTION public.allow_sms_auto_replenishment_event_cleanup()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('app.sms_auto_event_cleanup', 'on', true);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS organizations_sms_auto_event_cleanup ON public.organizations;
CREATE TRIGGER organizations_sms_auto_event_cleanup
  BEFORE DELETE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.allow_sms_auto_replenishment_event_cleanup();

-- ---------------------------------------------------------------------------
-- Durable attempts. One open attempt per organization.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.organization_sms_replenishment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations (id) ON DELETE CASCADE,
  status text NOT NULL
    CHECK (status IN (
      'claimed',
      'charging',
      'payment_pending',
      'succeeded',
      'failed',
      'canceled'
    )),
  subscription_period_start timestamptz NOT NULL,
  subscription_period_end timestamptz NOT NULL,
  observed_total_available_segments integer NOT NULL,
  observed_included_available_segments integer NOT NULL,
  observed_purchased_available_segments integer NOT NULL,
  threshold_segments integer NOT NULL,
  plan_key text NOT NULL,
  package_key text NOT NULL,
  package_segments integer NOT NULL CHECK (package_segments > 0),
  expected_amount_cents integer NOT NULL CHECK (expected_amount_cents > 0),
  tax_cents integer NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  idempotency_key text NOT NULL,
  provider_idempotency_key text NOT NULL,
  provider_payment_id text,
  safe_failure_code text,
  billing_transaction_id uuid REFERENCES public.billing_transactions (id) ON DELETE SET NULL,
  credit_ledger_id uuid REFERENCES public.organization_sms_credit_ledger (id) ON DELETE SET NULL,
  authorization_event_id uuid REFERENCES public.organization_sms_auto_replenishment_events (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  charging_at timestamptz,
  payment_pending_at timestamptz,
  succeeded_at timestamptz,
  failed_at timestamptz,
  canceled_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_sms_replenishment_attempts_period_order_check
    CHECK (subscription_period_end >= subscription_period_start),
  CONSTRAINT organization_sms_replenishment_attempts_provider_id_check
    CHECK (
      provider_payment_id IS NULL
      OR (
        char_length(btrim(provider_payment_id)) BETWEEN 1 AND 255
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS organization_sms_replenishment_attempts_idempotency_uidx
  ON public.organization_sms_replenishment_attempts (idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS organization_sms_replenishment_attempts_provider_idem_uidx
  ON public.organization_sms_replenishment_attempts (provider_idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS organization_sms_replenishment_attempts_one_open_uidx
  ON public.organization_sms_replenishment_attempts (organization_id)
  WHERE status IN ('claimed', 'charging', 'payment_pending');

CREATE UNIQUE INDEX IF NOT EXISTS organization_sms_replenishment_attempts_provider_payment_uidx
  ON public.organization_sms_replenishment_attempts (provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS organization_sms_replenishment_attempts_org_idx
  ON public.organization_sms_replenishment_attempts (organization_id, created_at DESC);

DROP TRIGGER IF EXISTS organization_sms_replenishment_attempts_set_updated_at
  ON public.organization_sms_replenishment_attempts;
CREATE TRIGGER organization_sms_replenishment_attempts_set_updated_at
  BEFORE UPDATE ON public.organization_sms_replenishment_attempts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.organization_sms_replenishment_attempts IS
  'One automatic SMS replenishment attempt. Open states are claimed, charging, and payment_pending. Stripe idempotency key is provider_idempotency_key (sms_auto_pi_{attempt id}). Grant key is idempotency_key (sms:auto:{attempt id}).';

COMMENT ON COLUMN public.organization_sms_replenishment_attempts.expected_amount_cents IS
  'Trusted catalog package price in cents, excluding tax.';

COMMENT ON COLUMN public.organization_sms_replenishment_attempts.tax_cents IS
  'Tax reported by the payment authority. Zero until a succeeded grant stores Stripe tax. Independent of expected_amount_cents.';

-- ---------------------------------------------------------------------------
-- Trusted current package. Does not read auto_purchase_allowed.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolve_current_application_sms_package(p_plan_id uuid)
RETURNS TABLE (
  plan_key text,
  package_key text,
  package_segments integer,
  package_price_cents integer,
  lookup_key text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    sp.plan_key,
    e.item_key,
    pr.quantity_units,
    pr.unit_amount_cents,
    pr.provider_lookup_key
  FROM public.subscription_plans sp
  JOIN public.billing_plan_extra_items bpe
    ON bpe.plan_id = sp.id
   AND bpe.is_default_for_plan = true
  JOIN public.billing_extra_items e
    ON e.id = bpe.extra_item_id
   AND e.item_kind = 'sms_block'
   AND e.is_active = true
  JOIN public.billing_extra_item_prices pr
    ON pr.extra_item_id = e.id
   AND pr.is_current_for_new_purchases = true
   AND pr.status = 'active'
  WHERE sp.id = p_plan_id;
$$;

REVOKE ALL ON FUNCTION public.resolve_current_application_sms_package(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_current_application_sms_package(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.resolve_current_application_sms_package(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_current_application_sms_package(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Claim. Short transaction. Does not call a provider.
-- Spending reservation:
--   succeeded automatic attempts in THIS subscription period
--   (expected_amount_cents + tax_cents)
--   plus any open attempt amount
--   plus the current package price
--   must be <= max_auto_spend_cents.
-- Manual SMS purchases are not attempts and are not counted.
-- A proposed package that lands exactly on the cap is allowed.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_application_sms_replenishment(
  p_organization_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_exists boolean;
  v_sub public.organization_subscriptions%ROWTYPE;
  v_cfg public.organization_sms_auto_replenishment%ROWTYPE;
  v_limit integer := 0;
  v_used integer := 0;
  v_included_reserved integer := 0;
  v_included integer := 0;
  v_purchased integer := 0;
  v_total integer := 0;
  v_has_balance boolean := false;
  v_sms_enabled boolean;
  v_package_count integer := 0;
  v_plan_key text;
  v_package_key text;
  v_package_segments integer;
  v_package_price integer;
  v_spent integer := 0;
  v_open_count integer := 0;
  v_open_amount integer := 0;
  v_attempt_id uuid;
  v_event_id uuid;
  v_key text;
  v_provider_key text;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'SMS replenishment claim requires an organization';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.organizations WHERE id = p_organization_id
  ) INTO v_org_exists;
  IF NOT v_org_exists THEN
    RAISE EXCEPTION 'SMS replenishment claim organization does not exist';
  END IF;

  PERFORM public.application_sms_capacity_lock(p_organization_id);

  SELECT *
  INTO v_sub
  FROM public.organization_subscriptions
  WHERE organization_id = p_organization_id
    AND status = 'active'
  ORDER BY started_at DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'not_active');
  END IF;

  IF v_sub.current_period_start IS NULL OR v_sub.current_period_end IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'configuration_invalid');
  END IF;

  SELECT pf.boolean_value
  INTO v_sms_enabled
  FROM public.plan_features pf
  JOIN public.features f ON f.id = pf.feature_id
  WHERE pf.plan_id = v_sub.plan_id
    AND f.feature_key = 'messaging.sms.enabled';

  IF v_sms_enabled IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'sms_not_entitled');
  END IF;

  SELECT *
  INTO v_cfg
  FROM public.organization_sms_auto_replenishment
  WHERE organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND OR v_cfg.status = 'disabled' THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'not_enabled');
  END IF;

  IF v_cfg.status = 'payment_attention_required' THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'payment_attention_required');
  END IF;

  IF v_cfg.status = 'authorization_review_required' THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'authorization_review_required');
  END IF;

  IF v_cfg.status IS DISTINCT FROM 'enabled' THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'configuration_invalid');
  END IF;

  IF v_cfg.payment_method_id IS NULL OR btrim(v_cfg.payment_method_id) = '' THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'payment_method_missing');
  END IF;

  SELECT count(*)
  INTO v_package_count
  FROM public.resolve_current_application_sms_package(v_sub.plan_id);

  IF v_package_count IS DISTINCT FROM 1 THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'catalog_invalid');
  END IF;

  SELECT plan_key, package_key, package_segments, package_price_cents
  INTO v_plan_key, v_package_key, v_package_segments, v_package_price
  FROM public.resolve_current_application_sms_package(v_sub.plan_id);

  IF v_package_segments IS NULL OR v_package_segments <= 0
    OR v_package_price IS NULL OR v_package_price <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'catalog_invalid');
  END IF;

  IF v_cfg.authorized_package_price_cents IS NULL
    OR v_package_price > v_cfg.authorized_package_price_cents THEN
    UPDATE public.organization_sms_auto_replenishment
    SET status = 'authorization_review_required'
    WHERE organization_id = p_organization_id;

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
      p_organization_id,
      'authorization_review_required',
      'enabled',
      'authorization_review_required',
      v_cfg.low_balance_threshold_segments,
      v_cfg.max_auto_spend_cents,
      v_plan_key,
      v_package_key,
      v_package_segments,
      v_package_price,
      v_cfg.authorization_text_version,
      v_cfg.payment_method_id,
      jsonb_build_object(
        'authorized_package_price_cents', v_cfg.authorized_package_price_cents,
        'current_package_price_cents', v_package_price
      )
    );

    RETURN jsonb_build_object('ok', false, 'outcome', 'authorization_review_required');
  END IF;

  IF v_cfg.low_balance_threshold_segments IS NULL
    OR v_cfg.low_balance_threshold_segments < 1
    OR v_cfg.low_balance_threshold_segments >= v_package_segments THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'configuration_invalid');
  END IF;

  IF v_cfg.max_auto_spend_cents IS NULL
    OR v_cfg.max_auto_spend_cents < v_package_price
    OR v_cfg.max_auto_spend_cents > 50000 THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'configuration_invalid');
  END IF;

  SELECT COALESCE(pf.integer_value, 0)
  INTO v_limit
  FROM public.plan_features pf
  JOIN public.features f ON f.id = pf.feature_id
  WHERE pf.plan_id = v_sub.plan_id
    AND f.feature_key = 'messaging.sms.monthly_segment_limit';
  IF NOT FOUND OR v_limit IS NULL OR v_limit < 0 THEN
    v_limit := 0;
  END IF;

  SELECT
    COALESCE(su.quantity_used, 0)::integer,
    COALESCE(su.quantity_reserved, 0)::integer
  INTO v_used, v_included_reserved
  FROM public.subscription_usage su
  JOIN public.features f ON f.id = su.feature_id
  WHERE su.subscription_id = v_sub.id
    AND f.feature_key = 'messaging.sms.monthly_segment_limit'
    AND su.period_start = v_sub.current_period_start
    AND su.period_end = v_sub.current_period_end;
  IF NOT FOUND THEN
    v_used := 0;
    v_included_reserved := 0;
  END IF;

  v_included := GREATEST(0, v_limit - v_used - v_included_reserved);

  SELECT (balance - reserved) INTO v_purchased
  FROM public.organization_sms_credit_balances
  WHERE organization_id = p_organization_id
  FOR UPDATE;
  v_has_balance := FOUND;
  IF NOT v_has_balance OR v_purchased IS NULL THEN
    v_purchased := 0;
  END IF;
  IF v_purchased < 0 THEN
    v_purchased := 0;
  END IF;

  v_total := v_included + v_purchased;

  IF v_total > v_cfg.low_balance_threshold_segments THEN
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'above_threshold',
      'observed_total_available', v_total,
      'included_available', v_included,
      'purchased_available', v_purchased,
      'threshold_segments', v_cfg.low_balance_threshold_segments
    );
  END IF;

  SELECT count(*)::integer, COALESCE(SUM(expected_amount_cents + tax_cents), 0)::integer
  INTO v_open_count, v_open_amount
  FROM public.organization_sms_replenishment_attempts
  WHERE organization_id = p_organization_id
    AND status IN ('claimed', 'charging', 'payment_pending');

  IF v_open_count > 0 THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'open_attempt_exists');
  END IF;

  SELECT COALESCE(SUM(expected_amount_cents + tax_cents), 0)::integer
  INTO v_spent
  FROM public.organization_sms_replenishment_attempts
  WHERE organization_id = p_organization_id
    AND status = 'succeeded'
    AND subscription_period_start = v_sub.current_period_start
    AND subscription_period_end = v_sub.current_period_end;

  IF v_spent + v_open_amount + v_package_price > v_cfg.max_auto_spend_cents THEN
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'period_cap_reached',
      'automatic_spend_cents', v_spent,
      'open_attempt_cents', v_open_amount,
      'package_price_cents', v_package_price,
      'max_auto_spend_cents', v_cfg.max_auto_spend_cents
    );
  END IF;

  SELECT id
  INTO v_event_id
  FROM public.organization_sms_auto_replenishment_events
  WHERE organization_id = p_organization_id
  ORDER BY created_at DESC
  LIMIT 1;

  v_attempt_id := gen_random_uuid();
  v_key := 'sms:auto:' || v_attempt_id::text;
  v_provider_key := 'sms_auto_pi_' || v_attempt_id::text;

  INSERT INTO public.organization_sms_replenishment_attempts (
    id,
    organization_id,
    status,
    subscription_period_start,
    subscription_period_end,
    observed_total_available_segments,
    observed_included_available_segments,
    observed_purchased_available_segments,
    threshold_segments,
    plan_key,
    package_key,
    package_segments,
    expected_amount_cents,
    tax_cents,
    currency,
    idempotency_key,
    provider_idempotency_key,
    authorization_event_id,
    claimed_at
  )
  VALUES (
    v_attempt_id,
    p_organization_id,
    'claimed',
    v_sub.current_period_start,
    v_sub.current_period_end,
    v_total,
    v_included,
    v_purchased,
    v_cfg.low_balance_threshold_segments,
    v_plan_key,
    v_package_key,
    v_package_segments,
    v_package_price,
    0,
    'USD',
    v_key,
    v_provider_key,
    v_event_id,
    now()
  );

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', 'claimed',
    'attempt_id', v_attempt_id,
    'idempotency_key', v_key,
    'provider_idempotency_key', v_provider_key,
    'observed_total_available', v_total,
    'included_available', v_included,
    'purchased_available', v_purchased,
    'threshold_segments', v_cfg.low_balance_threshold_segments,
    'plan_key', v_plan_key,
    'package_key', v_package_key,
    'package_segments', v_package_segments,
    'expected_amount_cents', v_package_price
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'open_attempt_exists');
END;
$$;

REVOKE ALL ON FUNCTION public.claim_application_sms_replenishment(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_application_sms_replenishment(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.claim_application_sms_replenishment(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_application_sms_replenishment(uuid) TO service_role;

COMMENT ON FUNCTION public.claim_application_sms_replenishment(uuid) IS
  'Service-role claim for one automatic application SMS replenishment attempt. Does not call Stripe. Holds the capacity lock only for this transaction.';

-- ---------------------------------------------------------------------------
-- Configuration changes. Service role passes the authenticated actor.
-- The actor must be an active owner or co-owner. Administrator is rejected.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.configure_application_sms_auto_replenishment(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_threshold_segments integer,
  p_max_auto_spend_cents integer,
  p_payment_method_id text,
  p_authorization_text_version text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.membership_role;
  v_sub public.organization_subscriptions%ROWTYPE;
  v_cfg public.organization_sms_auto_replenishment%ROWTYPE;
  v_cfg_found boolean := false;
  v_sms_enabled boolean;
  v_package_count integer := 0;
  v_plan_key text;
  v_package_key text;
  v_package_segments integer;
  v_package_price integer;
  v_payment text;
  v_version text := 'sms_auto_replenishment_v1';
  v_previous text;
  v_next text;
  v_event_action text;
BEGIN
  IF p_organization_id IS NULL OR p_actor_user_id IS NULL OR p_action IS NULL THEN
    RAISE EXCEPTION 'SMS replenishment configuration requires an organization, actor, and action';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_organization_id) THEN
    RAISE EXCEPTION 'SMS replenishment configuration organization does not exist';
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
  INTO v_sub
  FROM public.organization_subscriptions
  WHERE organization_id = p_organization_id
    AND status = 'active'
  ORDER BY started_at DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND OR v_sub.current_period_start IS NULL OR v_sub.current_period_end IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'not_active');
  END IF;

  SELECT pf.boolean_value
  INTO v_sms_enabled
  FROM public.plan_features pf
  JOIN public.features f ON f.id = pf.feature_id
  WHERE pf.plan_id = v_sub.plan_id
    AND f.feature_key = 'messaging.sms.enabled';

  IF v_sms_enabled IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'sms_not_entitled');
  END IF;

  SELECT count(*)
  INTO v_package_count
  FROM public.resolve_current_application_sms_package(v_sub.plan_id);
  IF v_package_count IS DISTINCT FROM 1 THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'catalog_invalid');
  END IF;

  SELECT plan_key, package_key, package_segments, package_price_cents
  INTO v_plan_key, v_package_key, v_package_segments, v_package_price
  FROM public.resolve_current_application_sms_package(v_sub.plan_id);

  SELECT *
  INTO v_cfg
  FROM public.organization_sms_auto_replenishment
  WHERE organization_id = p_organization_id
  FOR UPDATE;
  v_cfg_found := FOUND;
  v_previous := CASE WHEN v_cfg_found THEN v_cfg.status ELSE NULL END;

  v_payment := NULLIF(btrim(COALESCE(p_payment_method_id, '')), '');
  IF v_payment IS NOT NULL AND v_payment !~ '^pm_[A-Za-z0-9_]+$' THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'configuration_invalid');
  END IF;

  IF p_action = 'enable' THEN
    IF v_cfg_found AND v_cfg.status = 'payment_attention_required' THEN
      RETURN jsonb_build_object('ok', false, 'outcome', 'payment_attention_required');
    END IF;
    IF v_cfg_found AND v_cfg.status = 'authorization_review_required' THEN
      RETURN jsonb_build_object('ok', false, 'outcome', 'authorization_review_required');
    END IF;
    IF v_cfg_found AND v_cfg.status = 'enabled' THEN
      RETURN jsonb_build_object('ok', true, 'outcome', 'already_enabled', 'duplicate', true);
    END IF;
    IF v_payment IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'outcome', 'payment_method_missing');
    END IF;
    IF p_authorization_text_version IS DISTINCT FROM v_version THEN
      RETURN jsonb_build_object('ok', false, 'outcome', 'configuration_invalid');
    END IF;
    IF p_threshold_segments IS NULL
      OR p_threshold_segments < 1
      OR p_threshold_segments >= v_package_segments
      OR p_max_auto_spend_cents IS NULL
      OR p_max_auto_spend_cents < v_package_price
      OR p_max_auto_spend_cents > 50000 THEN
      RETURN jsonb_build_object('ok', false, 'outcome', 'configuration_invalid');
    END IF;

    INSERT INTO public.organization_sms_auto_replenishment (
      organization_id,
      status,
      low_balance_threshold_segments,
      max_auto_spend_cents,
      authorized_plan_key,
      authorized_package_key,
      authorized_package_segments,
      authorized_package_price_cents,
      authorization_text_version,
      payment_method_id,
      enabled_by,
      enabled_at,
      disabled_by,
      disabled_at
    )
    VALUES (
      p_organization_id,
      'enabled',
      p_threshold_segments,
      p_max_auto_spend_cents,
      v_plan_key,
      v_package_key,
      v_package_segments,
      v_package_price,
      v_version,
      v_payment,
      p_actor_user_id,
      now(),
      NULL,
      NULL
    )
    ON CONFLICT (organization_id) DO UPDATE
    SET status = 'enabled',
        low_balance_threshold_segments = EXCLUDED.low_balance_threshold_segments,
        max_auto_spend_cents = EXCLUDED.max_auto_spend_cents,
        authorized_plan_key = EXCLUDED.authorized_plan_key,
        authorized_package_key = EXCLUDED.authorized_package_key,
        authorized_package_segments = EXCLUDED.authorized_package_segments,
        authorized_package_price_cents = EXCLUDED.authorized_package_price_cents,
        authorization_text_version = EXCLUDED.authorization_text_version,
        payment_method_id = EXCLUDED.payment_method_id,
        enabled_by = EXCLUDED.enabled_by,
        enabled_at = EXCLUDED.enabled_at,
        disabled_by = NULL,
        disabled_at = NULL;

    v_next := 'enabled';
    v_event_action := 'enabled';
  ELSIF p_action = 'disable' THEN
    IF NOT v_cfg_found THEN
      RETURN jsonb_build_object('ok', false, 'outcome', 'not_enabled');
    END IF;
    UPDATE public.organization_sms_auto_replenishment
    SET status = 'disabled',
        disabled_by = p_actor_user_id,
        disabled_at = now()
    WHERE organization_id = p_organization_id;
    v_next := 'disabled';
    v_event_action := 'disabled';
    v_payment := v_cfg.payment_method_id;
    p_threshold_segments := v_cfg.low_balance_threshold_segments;
    p_max_auto_spend_cents := v_cfg.max_auto_spend_cents;
  ELSIF p_action = 'resume' THEN
    IF NOT v_cfg_found OR v_cfg.status IS DISTINCT FROM 'payment_attention_required' THEN
      RETURN jsonb_build_object('ok', false, 'outcome', 'configuration_invalid');
    END IF;
    v_payment := COALESCE(v_payment, v_cfg.payment_method_id);
    IF v_payment IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'outcome', 'payment_method_missing');
    END IF;
    IF v_package_price > v_cfg.authorized_package_price_cents THEN
      UPDATE public.organization_sms_auto_replenishment
      SET status = 'authorization_review_required'
      WHERE organization_id = p_organization_id;
      v_next := 'authorization_review_required';
      v_event_action := 'authorization_review_required';
    ELSE
      UPDATE public.organization_sms_auto_replenishment
      SET status = 'enabled',
          payment_method_id = v_payment,
          enabled_by = p_actor_user_id,
          enabled_at = now()
      WHERE organization_id = p_organization_id;
      v_next := 'enabled';
      v_event_action := 'resumed';
    END IF;
    p_threshold_segments := v_cfg.low_balance_threshold_segments;
    p_max_auto_spend_cents := v_cfg.max_auto_spend_cents;
  ELSIF p_action = 'reauthorize' THEN
    IF NOT v_cfg_found THEN
      RETURN jsonb_build_object('ok', false, 'outcome', 'not_enabled');
    END IF;
    IF p_authorization_text_version IS DISTINCT FROM v_version THEN
      RETURN jsonb_build_object('ok', false, 'outcome', 'configuration_invalid');
    END IF;
    IF v_cfg.status NOT IN ('authorization_review_required', 'enabled') THEN
      RETURN jsonb_build_object('ok', false, 'outcome', 'configuration_invalid');
    END IF;
    IF v_cfg.status = 'enabled' AND v_package_price <= v_cfg.authorized_package_price_cents THEN
      RETURN jsonb_build_object('ok', false, 'outcome', 'configuration_invalid');
    END IF;
    v_payment := COALESCE(v_payment, v_cfg.payment_method_id);
    IF v_payment IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'outcome', 'payment_method_missing');
    END IF;
    UPDATE public.organization_sms_auto_replenishment
    SET status = 'enabled',
        authorized_plan_key = v_plan_key,
        authorized_package_key = v_package_key,
        authorized_package_segments = v_package_segments,
        authorized_package_price_cents = v_package_price,
        authorization_text_version = v_version,
        payment_method_id = v_payment,
        enabled_by = p_actor_user_id,
        enabled_at = now()
    WHERE organization_id = p_organization_id;
    v_next := 'enabled';
    v_event_action := 'reauthorized';
    p_threshold_segments := v_cfg.low_balance_threshold_segments;
    p_max_auto_spend_cents := v_cfg.max_auto_spend_cents;
  ELSIF p_action = 'threshold_changed' THEN
    IF NOT v_cfg_found THEN
      RETURN jsonb_build_object('ok', false, 'outcome', 'not_enabled');
    END IF;
    IF p_threshold_segments IS NULL
      OR p_threshold_segments < 1
      OR p_threshold_segments >= v_package_segments THEN
      RETURN jsonb_build_object('ok', false, 'outcome', 'configuration_invalid');
    END IF;
    UPDATE public.organization_sms_auto_replenishment
    SET low_balance_threshold_segments = p_threshold_segments
    WHERE organization_id = p_organization_id;
    v_next := v_cfg.status;
    v_event_action := 'threshold_changed';
    v_payment := v_cfg.payment_method_id;
    p_max_auto_spend_cents := v_cfg.max_auto_spend_cents;
  ELSIF p_action = 'spending_cap_changed' THEN
    IF NOT v_cfg_found THEN
      RETURN jsonb_build_object('ok', false, 'outcome', 'not_enabled');
    END IF;
    IF p_max_auto_spend_cents IS NULL
      OR p_max_auto_spend_cents < v_package_price
      OR p_max_auto_spend_cents > 50000 THEN
      RETURN jsonb_build_object('ok', false, 'outcome', 'configuration_invalid');
    END IF;
    UPDATE public.organization_sms_auto_replenishment
    SET max_auto_spend_cents = p_max_auto_spend_cents
    WHERE organization_id = p_organization_id;
    v_next := v_cfg.status;
    v_event_action := 'spending_cap_changed';
    v_payment := v_cfg.payment_method_id;
    p_threshold_segments := v_cfg.low_balance_threshold_segments;
  ELSE
    RETURN jsonb_build_object('ok', false, 'outcome', 'configuration_invalid');
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
    payment_method_id
  )
  VALUES (
    p_organization_id,
    p_actor_user_id,
    v_event_action,
    v_previous,
    v_next,
    p_threshold_segments,
    p_max_auto_spend_cents,
    CASE WHEN p_action IN ('enable', 'reauthorize') THEN v_plan_key ELSE v_cfg.authorized_plan_key END,
    CASE WHEN p_action IN ('enable', 'reauthorize') THEN v_package_key ELSE v_cfg.authorized_package_key END,
    CASE WHEN p_action IN ('enable', 'reauthorize') THEN v_package_segments ELSE v_cfg.authorized_package_segments END,
    CASE WHEN p_action IN ('enable', 'reauthorize') THEN v_package_price ELSE v_cfg.authorized_package_price_cents END,
    CASE WHEN p_action IN ('enable', 'reauthorize') THEN v_version ELSE v_cfg.authorization_text_version END,
    v_payment
  );

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', v_event_action,
    'status', v_next,
    'plan_key', v_plan_key,
    'package_key', v_package_key,
    'package_segments', v_package_segments,
    'package_price_cents', v_package_price
  );
END;
$$;

REVOKE ALL ON FUNCTION public.configure_application_sms_auto_replenishment(uuid, uuid, text, integer, integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.configure_application_sms_auto_replenishment(uuid, uuid, text, integer, integer, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.configure_application_sms_auto_replenishment(uuid, uuid, text, integer, integer, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.configure_application_sms_auto_replenishment(uuid, uuid, text, integer, integer, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- Automatic grant. Called only after a trusted payment success.
-- amount_cents is the package price and must match the attempt.
-- tax_cents is stored separately and may be zero. It is not added into
-- amount_cents.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_automatic_application_sms_replenishment(
  p_attempt_id uuid,
  p_provider_payment_id text,
  p_amount_cents integer,
  p_tax_cents integer,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt public.organization_sms_replenishment_attempts%ROWTYPE;
  v_txn public.billing_transactions%ROWTYPE;
  v_ledger public.organization_sms_credit_ledger%ROWTYPE;
  v_balance public.organization_sms_credit_balances%ROWTYPE;
  v_payment text;
  v_metadata jsonb;
  v_txn_found boolean := false;
  v_ledger_found boolean := false;
  v_txn_id uuid;
  v_ledger_id uuid;
  v_existing_balance integer := 0;
  v_existing_reserved integer := 0;
  v_included_used integer := 0;
BEGIN
  IF p_attempt_id IS NULL THEN
    RAISE EXCEPTION 'automatic SMS replenishment requires an attempt';
  END IF;
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'automatic SMS replenishment requires a positive amount';
  END IF;
  IF p_tax_cents IS NULL OR p_tax_cents < 0 THEN
    RAISE EXCEPTION 'automatic SMS replenishment tax cannot be negative';
  END IF;

  v_payment := NULLIF(btrim(COALESCE(p_provider_payment_id, '')), '');
  IF v_payment IS NULL OR char_length(v_payment) > 255 THEN
    RAISE EXCEPTION 'automatic SMS replenishment provider payment id is invalid';
  END IF;

  IF p_metadata IS NULL THEN
    v_metadata := '{}'::jsonb;
  ELSIF jsonb_typeof(p_metadata) <> 'object' THEN
    RAISE EXCEPTION 'automatic SMS replenishment metadata must be a JSON object';
  ELSE
    v_metadata := p_metadata;
  END IF;

  IF v_metadata ?| ARRAY[
    'card', 'card_number', 'pan', 'cvc', 'cvv',
    'payment_method', 'bank_account', 'account_number', 'secret', 'client_secret'
  ] THEN
    RAISE EXCEPTION 'automatic SMS replenishment metadata contains a sensitive key';
  END IF;

  SELECT *
  INTO v_attempt
  FROM public.organization_sms_replenishment_attempts
  WHERE id = p_attempt_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'missing', 'duplicate', false);
  END IF;

  PERFORM public.application_sms_capacity_lock(v_attempt.organization_id);

  SELECT *
  INTO v_attempt
  FROM public.organization_sms_replenishment_attempts
  WHERE id = p_attempt_id
  FOR UPDATE;

  SELECT *
  INTO v_txn
  FROM public.billing_transactions
  WHERE organization_id = v_attempt.organization_id
    AND idempotency_key = v_attempt.idempotency_key;
  v_txn_found := FOUND;

  SELECT *
  INTO v_ledger
  FROM public.organization_sms_credit_ledger
  WHERE organization_id = v_attempt.organization_id
    AND idempotency_key = v_attempt.idempotency_key;
  v_ledger_found := FOUND;

  SELECT balance, reserved
  INTO v_existing_balance, v_existing_reserved
  FROM public.organization_sms_credit_balances
  WHERE organization_id = v_attempt.organization_id;
  IF FOUND THEN
    v_existing_balance := COALESCE(v_existing_balance, 0);
    v_existing_reserved := COALESCE(v_existing_reserved, 0);
  ELSE
    v_existing_balance := 0;
    v_existing_reserved := 0;
  END IF;

  IF v_txn_found OR v_ledger_found OR v_attempt.status = 'succeeded' THEN
    IF NOT v_txn_found OR NOT v_ledger_found
      OR v_attempt.status IS DISTINCT FROM 'succeeded'
      OR v_ledger.related_transaction_id IS DISTINCT FROM v_txn.id
      OR v_attempt.billing_transaction_id IS DISTINCT FROM v_txn.id
      OR v_attempt.credit_ledger_id IS DISTINCT FROM v_ledger.id THEN
      RETURN jsonb_build_object(
        'ok', false,
        'outcome', 'reconciliation_required',
        'duplicate', false,
        'attempt_id', v_attempt.id,
        'transaction_id', CASE WHEN v_txn_found THEN v_txn.id ELSE NULL END,
        'ledger_id', CASE WHEN v_ledger_found THEN v_ledger.id ELSE NULL END
      );
    END IF;

    IF v_txn.transaction_type IS DISTINCT FROM 'sms_block'
      OR v_txn.status IS DISTINCT FROM 'succeeded'
      OR v_txn.amount_cents IS DISTINCT FROM p_amount_cents
      OR v_txn.tax_cents IS DISTINCT FROM p_tax_cents
      OR v_txn.amount_cents IS DISTINCT FROM v_attempt.expected_amount_cents
      OR v_ledger.reason IS DISTINCT FROM 'auto_replenish'
      OR v_ledger.delta IS DISTINCT FROM v_attempt.package_segments
      OR v_attempt.provider_payment_id IS DISTINCT FROM v_payment
      OR v_txn.provider_payment_id IS DISTINCT FROM v_payment THEN
      RETURN jsonb_build_object(
        'ok', false,
        'outcome', 'idempotency_mismatch',
        'duplicate', true,
        'attempt_id', v_attempt.id,
        'transaction_id', v_txn.id,
        'ledger_id', v_ledger.id,
        'balance', v_existing_balance,
        'credited_segments', v_ledger.delta
      );
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'duplicate',
      'duplicate', true,
      'attempt_id', v_attempt.id,
      'transaction_id', v_txn.id,
      'ledger_id', v_ledger.id,
      'balance', v_existing_balance,
      'reserved', v_existing_reserved,
      'credited_segments', v_ledger.delta,
      'amount_cents', v_txn.amount_cents,
      'tax_cents', v_txn.tax_cents
    );
  END IF;

  IF v_attempt.status NOT IN ('charging', 'payment_pending') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'invalid_state',
      'duplicate', false,
      'attempt_id', v_attempt.id,
      'status', v_attempt.status
    );
  END IF;

  IF p_amount_cents IS DISTINCT FROM v_attempt.expected_amount_cents
    OR (
      v_attempt.provider_payment_id IS NOT NULL
      AND v_attempt.provider_payment_id IS DISTINCT FROM v_payment
    ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'idempotency_mismatch',
      'duplicate', false,
      'attempt_id', v_attempt.id
    );
  END IF;

  INSERT INTO public.organization_sms_credit_balances (organization_id)
  VALUES (v_attempt.organization_id)
  ON CONFLICT (organization_id) DO NOTHING;

  SELECT *
  INTO v_balance
  FROM public.organization_sms_credit_balances
  WHERE organization_id = v_attempt.organization_id
  FOR UPDATE;

  SELECT COALESCE(su.quantity_used, 0)::integer
  INTO v_included_used
  FROM public.subscription_usage su
  JOIN public.organization_subscriptions s ON s.id = su.subscription_id
  JOIN public.features f ON f.id = su.feature_id
  WHERE s.organization_id = v_attempt.organization_id
    AND f.feature_key = 'messaging.sms.monthly_segment_limit'
    AND su.period_start = v_attempt.subscription_period_start
    AND su.period_end = v_attempt.subscription_period_end
  LIMIT 1;
  IF NOT FOUND THEN
    v_included_used := 0;
  END IF;

  v_metadata := v_metadata || jsonb_build_object(
    'sms_auto_replenishment', true,
    'attempt_id', v_attempt.id,
    'package_key', v_attempt.package_key,
    'plan_key', v_attempt.plan_key
  );

  INSERT INTO public.billing_transactions (
    organization_id,
    invoice_id,
    transaction_type,
    status,
    currency,
    amount_cents,
    tax_cents,
    billing_provider,
    provider_payment_id,
    idempotency_key,
    description,
    metadata
  )
  VALUES (
    v_attempt.organization_id,
    NULL,
    'sms_block',
    'succeeded',
    'USD',
    v_attempt.expected_amount_cents,
    p_tax_cents,
    'stripe',
    v_payment,
    v_attempt.idempotency_key,
    'Automatic SMS credit replenishment',
    v_metadata
  )
  RETURNING id INTO v_txn_id;

  INSERT INTO public.organization_sms_credit_ledger (
    organization_id,
    delta,
    reason,
    idempotency_key,
    related_transaction_id,
    metadata
  )
  VALUES (
    v_attempt.organization_id,
    v_attempt.package_segments,
    'auto_replenish',
    v_attempt.idempotency_key,
    v_txn_id,
    v_metadata
  )
  RETURNING id INTO v_ledger_id;

  UPDATE public.organization_sms_credit_balances
  SET balance = balance + v_attempt.package_segments
  WHERE organization_id = v_attempt.organization_id;

  UPDATE public.organization_sms_replenishment_attempts
  SET status = 'succeeded',
      provider_payment_id = v_payment,
      tax_cents = p_tax_cents,
      billing_transaction_id = v_txn_id,
      credit_ledger_id = v_ledger_id,
      succeeded_at = now()
  WHERE id = v_attempt.id;

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', 'recorded',
    'duplicate', false,
    'attempt_id', v_attempt.id,
    'transaction_id', v_txn_id,
    'ledger_id', v_ledger_id,
    'organization_id', v_attempt.organization_id,
    'balance', v_balance.balance + v_attempt.package_segments,
    'reserved', v_balance.reserved,
    'credited_segments', v_attempt.package_segments,
    'amount_cents', v_attempt.expected_amount_cents,
    'tax_cents', p_tax_cents,
    'included_used_unchanged', v_included_used,
    'provider_payment_id', v_payment
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_automatic_application_sms_replenishment(uuid, text, integer, integer, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_automatic_application_sms_replenishment(uuid, text, integer, integer, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.record_automatic_application_sms_replenishment(uuid, text, integer, integer, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_automatic_application_sms_replenishment(uuid, text, integer, integer, jsonb) TO service_role;

COMMENT ON FUNCTION public.record_automatic_application_sms_replenishment(uuid, text, integer, integer, jsonb) IS
  'Service-role grant of one paid automatic application SMS package. Ledger reason auto_replenish. Does not call Stripe. Does not change included usage.';

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

ALTER TABLE public.organization_sms_auto_replenishment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_sms_auto_replenishment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_sms_replenishment_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organization_sms_auto_replenishment_select
  ON public.organization_sms_auto_replenishment;
CREATE POLICY organization_sms_auto_replenishment_select
  ON public.organization_sms_auto_replenishment
  FOR SELECT TO authenticated
  USING (public.can_view_organization_billing(organization_id));

DROP POLICY IF EXISTS organization_sms_auto_replenishment_events_select
  ON public.organization_sms_auto_replenishment_events;
CREATE POLICY organization_sms_auto_replenishment_events_select
  ON public.organization_sms_auto_replenishment_events
  FOR SELECT TO authenticated
  USING (public.can_view_organization_billing(organization_id));

DROP POLICY IF EXISTS organization_sms_replenishment_attempts_select
  ON public.organization_sms_replenishment_attempts;
CREATE POLICY organization_sms_replenishment_attempts_select
  ON public.organization_sms_replenishment_attempts
  FOR SELECT TO authenticated
  USING (public.can_view_organization_billing(organization_id));

REVOKE INSERT, UPDATE, DELETE ON public.organization_sms_auto_replenishment FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.organization_sms_auto_replenishment_events FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.organization_sms_replenishment_attempts FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.organization_sms_auto_replenishment FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.organization_sms_auto_replenishment_events FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.organization_sms_replenishment_attempts FROM anon;

GRANT SELECT ON public.organization_sms_auto_replenishment TO authenticated;
GRANT SELECT ON public.organization_sms_auto_replenishment_events TO authenticated;
GRANT SELECT ON public.organization_sms_replenishment_attempts TO authenticated;

GRANT ALL ON public.organization_sms_auto_replenishment TO service_role;
GRANT ALL ON public.organization_sms_auto_replenishment_events TO service_role;
GRANT ALL ON public.organization_sms_replenishment_attempts TO service_role;
