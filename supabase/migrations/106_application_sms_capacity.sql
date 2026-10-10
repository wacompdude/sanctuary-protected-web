-- =============================================================================
-- 106_application_sms_capacity.sql
-- Atomic reserve / commit / release for application SMS segments.
-- Included monthly allowance is consumed first. Purchased credits are second.
-- Purchased balances are organization-scoped and are not reset by period.
-- Do not apply until reviewed. Do not run supabase db push from this change.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.organization_sms_segment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations (id) ON DELETE CASCADE,
  delivery_id text NOT NULL,
  subscription_id uuid NOT NULL
    REFERENCES public.organization_subscriptions (id) ON DELETE RESTRICT,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  requested_segments integer NOT NULL CHECK (requested_segments > 0),
  included_segments integer NOT NULL CHECK (included_segments >= 0),
  purchased_segments integer NOT NULL CHECK (purchased_segments >= 0),
  generation integer NOT NULL DEFAULT 1 CHECK (generation > 0),
  state text NOT NULL CHECK (state IN ('reserved', 'committed', 'released')),
  send_started_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_sms_segment_allocations_split_check
    CHECK (included_segments + purchased_segments = requested_segments),
  CONSTRAINT organization_sms_segment_allocations_period_check
    CHECK (period_end >= period_start),
  CONSTRAINT organization_sms_segment_allocations_delivery_unique
    UNIQUE (organization_id, delivery_id)
);

CREATE INDEX IF NOT EXISTS organization_sms_segment_allocations_open_idx
  ON public.organization_sms_segment_allocations (organization_id, created_at)
  WHERE state = 'reserved';

-- Unknown Bird outcome: reserved after the send was marked, still not committed.
-- Age is not proof of rejection. Do not use this index to auto-release.
CREATE INDEX IF NOT EXISTS organization_sms_segment_allocations_send_started_idx
  ON public.organization_sms_segment_allocations (send_started_at, organization_id)
  WHERE state = 'reserved' AND send_started_at IS NOT NULL;

COMMENT ON TABLE public.organization_sms_segment_allocations IS
  'One application-SMS funding decision per notification delivery. Reserved holds are not consumed usage. send_started_at marks a Bird attempt that must not be repeated until reconciliation.';

ALTER TABLE public.organization_sms_segment_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.organization_sms_segment_allocations FROM PUBLIC;
REVOKE ALL ON public.organization_sms_segment_allocations FROM anon;
REVOKE ALL ON public.organization_sms_segment_allocations FROM authenticated;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.application_sms_capacity_lock(
  p_organization_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Serializes every capacity change for one organization across Vercel instances.
  -- The lock is released at transaction end. It does not depend on a Node process.
  PERFORM pg_advisory_xact_lock(
    hashtext('application-sms:' || p_organization_id::text)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.application_sms_allocation_metadata(
  p_delivery_id text,
  p_requested integer,
  p_included integer,
  p_purchased integer,
  p_subscription_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'delivery_id', p_delivery_id,
    'segment_quantity', p_requested,
    'included_segments', p_included,
    'purchased_segments', p_purchased,
    'subscription_id', p_subscription_id,
    'period_start', p_period_start,
    'period_end', p_period_end
  );
$$;

-- ---------------------------------------------------------------------------
-- Reserve the entire message or reserve nothing.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reserve_application_sms_segments(
  p_organization_id uuid,
  p_delivery_id text,
  p_segments integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.organization_subscriptions%ROWTYPE;
  v_feature_id uuid;
  v_limit integer := 0;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_anchor timestamptz;
  v_guard integer := 0;
  v_usage_id uuid;
  v_used numeric := 0;
  v_reserved_now numeric := 0;
  v_balance public.organization_sms_credit_balances%ROWTYPE;
  v_alloc public.organization_sms_segment_allocations%ROWTYPE;
  v_included_left integer;
  v_purchased_left integer;
  v_included integer;
  v_purchased integer;
  v_generation integer;
  v_metadata jsonb;
  v_has_balance boolean := false;
BEGIN
  IF p_organization_id IS NULL OR btrim(COALESCE(p_delivery_id, '')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'conflict', 'requested_segments', COALESCE(p_segments, 0), 'included_segments', 0, 'purchased_segments', 0, 'duplicate', false);
  END IF;
  IF p_segments IS NULL OR p_segments <= 0 OR p_segments > 100 THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'conflict', 'requested_segments', COALESCE(p_segments, 0), 'included_segments', 0, 'purchased_segments', 0, 'duplicate', false);
  END IF;

  PERFORM public.application_sms_capacity_lock(p_organization_id);

  SELECT *
  INTO v_sub
  FROM public.organization_subscriptions
  WHERE organization_id = p_organization_id
    AND status IN ('trialing', 'active', 'past_due', 'grace_period')
  ORDER BY started_at DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'ineligible', 'requested_segments', p_segments, 'included_segments', 0, 'purchased_segments', 0, 'duplicate', false);
  END IF;

  SELECT *
  INTO v_alloc
  FROM public.organization_sms_segment_allocations
  WHERE organization_id = p_organization_id
    AND delivery_id = p_delivery_id
  FOR UPDATE;

  IF FOUND AND v_alloc.state = 'committed' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'committed',
      'requested_segments', v_alloc.requested_segments,
      'included_segments', v_alloc.included_segments,
      'purchased_segments', v_alloc.purchased_segments,
      'duplicate', true
    );
  END IF;

  IF FOUND AND v_alloc.state = 'reserved' THEN
    IF v_alloc.requested_segments <> p_segments THEN
      RETURN jsonb_build_object('ok', false, 'outcome', 'conflict', 'requested_segments', p_segments, 'included_segments', 0, 'purchased_segments', 0, 'duplicate', false);
    END IF;
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'reserved',
      'requested_segments', v_alloc.requested_segments,
      'included_segments', v_alloc.included_segments,
      'purchased_segments', v_alloc.purchased_segments,
      'duplicate', true
    );
  END IF;

  SELECT id INTO v_feature_id
  FROM public.features
  WHERE feature_key = 'messaging.sms.monthly_segment_limit';

  IF v_feature_id IS NOT NULL THEN
    SELECT COALESCE(integer_value, 0)
    INTO v_limit
    FROM public.plan_features
    WHERE plan_id = v_sub.plan_id
      AND feature_id = v_feature_id;
    IF NOT FOUND OR v_limit IS NULL OR v_limit < 0 THEN
      v_limit := 0;
    END IF;
  END IF;

  v_period_start := v_sub.current_period_start;
  v_period_end := v_sub.current_period_end;
  IF v_period_start IS NULL OR v_period_end IS NULL THEN
    v_anchor := COALESCE(v_sub.started_at, now());
    v_period_start := v_anchor;
    v_period_end := v_anchor + interval '30 days';
    WHILE now() > v_period_end AND v_guard < 120 LOOP
      v_period_start := v_period_end + interval '1 millisecond';
      v_period_end := v_period_start + interval '30 days';
      v_guard := v_guard + 1;
    END LOOP;
  END IF;

  IF v_feature_id IS NOT NULL THEN
    SELECT id, quantity_used, quantity_reserved
    INTO v_usage_id, v_used, v_reserved_now
    FROM public.subscription_usage
    WHERE subscription_id = v_sub.id
      AND feature_id = v_feature_id
      AND period_start = v_period_start
      AND period_end = v_period_end
    FOR UPDATE;
    v_used := COALESCE(v_used, 0);
    v_reserved_now := COALESCE(v_reserved_now, 0);
  END IF;

  SELECT *
  INTO v_balance
  FROM public.organization_sms_credit_balances
  WHERE organization_id = p_organization_id
  FOR UPDATE;
  v_has_balance := FOUND;

  v_included_left := GREATEST(
    0,
    v_limit - v_used::integer - v_reserved_now::integer
  );
  v_purchased_left := CASE
    WHEN v_has_balance THEN v_balance.balance - v_balance.reserved
    ELSE 0
  END;

  IF v_included_left + v_purchased_left < p_segments THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'insufficient', 'requested_segments', p_segments, 'included_segments', 0, 'purchased_segments', 0, 'duplicate', false);
  END IF;

  v_included := LEAST(v_included_left, p_segments);
  v_purchased := p_segments - v_included;
  v_generation := CASE WHEN v_alloc.id IS NULL THEN 1 ELSE v_alloc.generation + 1 END;
  v_metadata := public.application_sms_allocation_metadata(
    p_delivery_id,
    p_segments,
    v_included,
    v_purchased,
    v_sub.id,
    v_period_start,
    v_period_end
  );

  IF v_included > 0 THEN
    INSERT INTO public.subscription_usage (
      organization_id,
      subscription_id,
      feature_id,
      period_start,
      period_end,
      quantity_used,
      quantity_reserved
    )
    VALUES (
      p_organization_id,
      v_sub.id,
      v_feature_id,
      v_period_start,
      v_period_end,
      0,
      0
    )
    ON CONFLICT (subscription_id, feature_id, period_start, period_end) DO NOTHING;

    SELECT id
    INTO v_usage_id
    FROM public.subscription_usage
    WHERE subscription_id = v_sub.id
      AND feature_id = v_feature_id
      AND period_start = v_period_start
      AND period_end = v_period_end
    FOR UPDATE;

    UPDATE public.subscription_usage
    SET quantity_reserved = quantity_reserved + v_included,
        last_calculated_at = now(),
        updated_at = now()
    WHERE id = v_usage_id
      AND quantity_used + quantity_reserved + v_included <= v_limit;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'application SMS included reservation lost the capacity check';
    END IF;

    INSERT INTO public.subscription_usage_events (
      organization_id,
      subscription_id,
      feature_id,
      usage_key,
      quantity,
      event_type,
      source_type,
      source_id,
      billing_period_start,
      billing_period_end,
      metadata
    )
    VALUES (
      p_organization_id,
      v_sub.id,
      v_feature_id,
      'sms:reserve:delivery:' || p_delivery_id || ':g:' || v_generation::text,
      v_included,
      'reserve',
      'notification_delivery',
      p_delivery_id,
      v_period_start,
      v_period_end,
      v_metadata
    );
  END IF;

  IF v_purchased > 0 THEN
    UPDATE public.organization_sms_credit_balances
    SET reserved = reserved + v_purchased,
        updated_at = now()
    WHERE organization_id = p_organization_id
      AND balance - reserved >= v_purchased;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'application SMS purchased reservation lost the capacity check';
    END IF;

    INSERT INTO public.organization_sms_credit_ledger (
      organization_id,
      delta,
      reason,
      idempotency_key,
      metadata
    )
    VALUES (
      p_organization_id,
      0,
      'reserve',
      'sms:reserve:delivery:' || p_delivery_id || ':g:' || v_generation::text,
      v_metadata
    );
  END IF;

  IF v_alloc.id IS NULL THEN
    INSERT INTO public.organization_sms_segment_allocations (
      organization_id,
      delivery_id,
      subscription_id,
      period_start,
      period_end,
      requested_segments,
      included_segments,
      purchased_segments,
      generation,
      state
    )
    VALUES (
      p_organization_id,
      p_delivery_id,
      v_sub.id,
      v_period_start,
      v_period_end,
      p_segments,
      v_included,
      v_purchased,
      v_generation,
      'reserved'
    );
  ELSE
    UPDATE public.organization_sms_segment_allocations
    SET subscription_id = v_sub.id,
        period_start = v_period_start,
        period_end = v_period_end,
        requested_segments = p_segments,
        included_segments = v_included,
        purchased_segments = v_purchased,
        generation = v_generation,
        state = 'reserved',
        send_started_at = NULL,
        updated_at = now()
    WHERE id = v_alloc.id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', 'reserved',
    'requested_segments', p_segments,
    'included_segments', v_included,
    'purchased_segments', v_purchased,
    'duplicate', false
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Commit a Bird-accepted reservation exactly once.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.commit_application_sms_segments(
  p_organization_id uuid,
  p_delivery_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alloc public.organization_sms_segment_allocations%ROWTYPE;
  v_feature_id uuid;
  v_metadata jsonb;
BEGIN
  IF p_organization_id IS NULL OR btrim(COALESCE(p_delivery_id, '')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'conflict', 'requested_segments', 0, 'included_segments', 0, 'purchased_segments', 0, 'duplicate', false);
  END IF;

  PERFORM public.application_sms_capacity_lock(p_organization_id);

  SELECT *
  INTO v_alloc
  FROM public.organization_sms_segment_allocations
  WHERE organization_id = p_organization_id
    AND delivery_id = p_delivery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'missing', 'requested_segments', 0, 'included_segments', 0, 'purchased_segments', 0, 'duplicate', false);
  END IF;

  IF v_alloc.state = 'committed' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'committed',
      'requested_segments', v_alloc.requested_segments,
      'included_segments', v_alloc.included_segments,
      'purchased_segments', v_alloc.purchased_segments,
      'duplicate', true
    );
  END IF;

  IF v_alloc.state <> 'reserved' THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'conflict', 'requested_segments', v_alloc.requested_segments, 'included_segments', 0, 'purchased_segments', 0, 'duplicate', false);
  END IF;

  v_metadata := public.application_sms_allocation_metadata(
    p_delivery_id,
    v_alloc.requested_segments,
    v_alloc.included_segments,
    v_alloc.purchased_segments,
    v_alloc.subscription_id,
    v_alloc.period_start,
    v_alloc.period_end
  );

  IF v_alloc.included_segments > 0 THEN
    SELECT id INTO v_feature_id
    FROM public.features
    WHERE feature_key = 'messaging.sms.monthly_segment_limit';

    UPDATE public.subscription_usage
    SET quantity_reserved = quantity_reserved - v_alloc.included_segments,
        quantity_used = quantity_used + v_alloc.included_segments,
        last_calculated_at = now(),
        updated_at = now()
    WHERE organization_id = p_organization_id
      AND subscription_id = v_alloc.subscription_id
      AND feature_id = v_feature_id
      AND period_start = v_alloc.period_start
      AND period_end = v_alloc.period_end
      AND quantity_reserved >= v_alloc.included_segments;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'application SMS commit could not move the included reservation';
    END IF;

    INSERT INTO public.subscription_usage_events (
      organization_id,
      subscription_id,
      feature_id,
      usage_key,
      quantity,
      event_type,
      source_type,
      source_id,
      billing_period_start,
      billing_period_end,
      metadata
    )
    VALUES
    (
      p_organization_id,
      v_alloc.subscription_id,
      v_feature_id,
      'sms:release:delivery:' || p_delivery_id || ':g:' || v_alloc.generation::text,
      v_alloc.included_segments,
      'release',
      'notification_delivery',
      p_delivery_id,
      v_alloc.period_start,
      v_alloc.period_end,
      v_metadata
    ),
    (
      p_organization_id,
      v_alloc.subscription_id,
      v_feature_id,
      'sms:consume:delivery:' || p_delivery_id,
      v_alloc.included_segments,
      'consume',
      'notification_delivery',
      p_delivery_id,
      v_alloc.period_start,
      v_alloc.period_end,
      v_metadata
    );
  END IF;

  IF v_alloc.purchased_segments > 0 THEN
    UPDATE public.organization_sms_credit_balances
    SET reserved = reserved - v_alloc.purchased_segments,
        balance = balance - v_alloc.purchased_segments,
        updated_at = now()
    WHERE organization_id = p_organization_id
      AND reserved >= v_alloc.purchased_segments
      AND balance >= v_alloc.purchased_segments;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'application SMS commit could not move the purchased reservation';
    END IF;

    INSERT INTO public.organization_sms_credit_ledger (
      organization_id,
      delta,
      reason,
      idempotency_key,
      metadata
    )
    VALUES (
      p_organization_id,
      -v_alloc.purchased_segments,
      'consume',
      'sms:consume:delivery:' || p_delivery_id,
      v_metadata
    );
  END IF;

  UPDATE public.organization_sms_segment_allocations
  SET state = 'committed',
      updated_at = now()
  WHERE id = v_alloc.id;

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', 'committed',
    'requested_segments', v_alloc.requested_segments,
    'included_segments', v_alloc.included_segments,
    'purchased_segments', v_alloc.purchased_segments,
    'duplicate', false
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Release a reservation that Bird did not accept. Committed usage stays.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.release_application_sms_segments(
  p_organization_id uuid,
  p_delivery_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alloc public.organization_sms_segment_allocations%ROWTYPE;
  v_feature_id uuid;
  v_metadata jsonb;
BEGIN
  IF p_organization_id IS NULL OR btrim(COALESCE(p_delivery_id, '')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'conflict', 'requested_segments', 0, 'included_segments', 0, 'purchased_segments', 0, 'duplicate', false);
  END IF;

  PERFORM public.application_sms_capacity_lock(p_organization_id);

  SELECT *
  INTO v_alloc
  FROM public.organization_sms_segment_allocations
  WHERE organization_id = p_organization_id
    AND delivery_id = p_delivery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'outcome', 'released', 'requested_segments', 0, 'included_segments', 0, 'purchased_segments', 0, 'duplicate', true);
  END IF;

  IF v_alloc.state = 'released' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'released',
      'requested_segments', v_alloc.requested_segments,
      'included_segments', v_alloc.included_segments,
      'purchased_segments', v_alloc.purchased_segments,
      'duplicate', true
    );
  END IF;

  IF v_alloc.state = 'committed' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'committed',
      'requested_segments', v_alloc.requested_segments,
      'included_segments', v_alloc.included_segments,
      'purchased_segments', v_alloc.purchased_segments,
      'duplicate', true
    );
  END IF;

  v_metadata := public.application_sms_allocation_metadata(
    p_delivery_id,
    v_alloc.requested_segments,
    v_alloc.included_segments,
    v_alloc.purchased_segments,
    v_alloc.subscription_id,
    v_alloc.period_start,
    v_alloc.period_end
  );

  IF v_alloc.included_segments > 0 THEN
    SELECT id INTO v_feature_id
    FROM public.features
    WHERE feature_key = 'messaging.sms.monthly_segment_limit';

    UPDATE public.subscription_usage
    SET quantity_reserved = quantity_reserved - v_alloc.included_segments,
        last_calculated_at = now(),
        updated_at = now()
    WHERE organization_id = p_organization_id
      AND subscription_id = v_alloc.subscription_id
      AND feature_id = v_feature_id
      AND period_start = v_alloc.period_start
      AND period_end = v_alloc.period_end
      AND quantity_reserved >= v_alloc.included_segments;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'application SMS release could not return the included reservation';
    END IF;

    INSERT INTO public.subscription_usage_events (
      organization_id,
      subscription_id,
      feature_id,
      usage_key,
      quantity,
      event_type,
      source_type,
      source_id,
      billing_period_start,
      billing_period_end,
      metadata
    )
    VALUES (
      p_organization_id,
      v_alloc.subscription_id,
      v_feature_id,
      'sms:release:delivery:' || p_delivery_id || ':g:' || v_alloc.generation::text,
      v_alloc.included_segments,
      'release',
      'notification_delivery',
      p_delivery_id,
      v_alloc.period_start,
      v_alloc.period_end,
      v_metadata
    );
  END IF;

  IF v_alloc.purchased_segments > 0 THEN
    UPDATE public.organization_sms_credit_balances
    SET reserved = reserved - v_alloc.purchased_segments,
        updated_at = now()
    WHERE organization_id = p_organization_id
      AND reserved >= v_alloc.purchased_segments;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'application SMS release could not return the purchased reservation';
    END IF;

    INSERT INTO public.organization_sms_credit_ledger (
      organization_id,
      delta,
      reason,
      idempotency_key,
      metadata
    )
    VALUES (
      p_organization_id,
      0,
      'release_reserve',
      'sms:release:delivery:' || p_delivery_id || ':g:' || v_alloc.generation::text,
      v_metadata
    );
  END IF;

  UPDATE public.organization_sms_segment_allocations
  SET state = 'released',
      send_started_at = NULL,
      updated_at = now()
  WHERE id = v_alloc.id;

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', 'released',
    'requested_segments', v_alloc.requested_segments,
    'included_segments', v_alloc.included_segments,
    'purchased_segments', v_alloc.purchased_segments,
    'duplicate', false
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Mark the Bird attempt so a crashed worker cannot send the same hold twice.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_application_sms_send_started(
  p_organization_id uuid,
  p_delivery_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alloc public.organization_sms_segment_allocations%ROWTYPE;
BEGIN
  PERFORM public.application_sms_capacity_lock(p_organization_id);

  SELECT *
  INTO v_alloc
  FROM public.organization_sms_segment_allocations
  WHERE organization_id = p_organization_id
    AND delivery_id = p_delivery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'missing', 'requested_segments', 0, 'included_segments', 0, 'purchased_segments', 0, 'duplicate', false, 'send_allowed', false);
  END IF;

  IF v_alloc.state = 'committed' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'committed',
      'requested_segments', v_alloc.requested_segments,
      'included_segments', v_alloc.included_segments,
      'purchased_segments', v_alloc.purchased_segments,
      'duplicate', true,
      'send_allowed', false
    );
  END IF;

  IF v_alloc.state <> 'reserved' THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'conflict', 'requested_segments', v_alloc.requested_segments, 'included_segments', 0, 'purchased_segments', 0, 'duplicate', false, 'send_allowed', false);
  END IF;

  IF v_alloc.send_started_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'stranded',
      'requested_segments', v_alloc.requested_segments,
      'included_segments', v_alloc.included_segments,
      'purchased_segments', v_alloc.purchased_segments,
      'duplicate', true,
      'send_allowed', false
    );
  END IF;

  UPDATE public.organization_sms_segment_allocations
  SET send_started_at = now(),
      updated_at = now()
  WHERE id = v_alloc.id;

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', 'reserved',
    'requested_segments', v_alloc.requested_segments,
    'included_segments', v_alloc.included_segments,
    'purchased_segments', v_alloc.purchased_segments,
    'duplicate', false,
    'send_allowed', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.application_sms_capacity_lock(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.application_sms_allocation_metadata(text, integer, integer, integer, uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_application_sms_segments(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commit_application_sms_segments(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_application_sms_segments(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_application_sms_send_started(uuid, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.reserve_application_sms_segments(uuid, text, integer) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.commit_application_sms_segments(uuid, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.release_application_sms_segments(uuid, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_application_sms_send_started(uuid, text) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reserve_application_sms_segments(uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.commit_application_sms_segments(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_application_sms_segments(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_application_sms_send_started(uuid, text) TO service_role;
