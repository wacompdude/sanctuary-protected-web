-- =============================================================================
-- 114_adjust_application_sms_purchased_credits.sql
-- Atomic, idempotent administrative adjustment of PURCHASED Application SMS
-- credits. Uses existing ledger reason admin_adjustment.
-- Does not send SMS, create Stripe objects, or invoke auto-replenishment.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.adjust_application_sms_purchased_credits(
  p_organization_id uuid,
  p_delta_segments integer,
  p_idempotency_key text,
  p_note text DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL,
  p_actor_platform_account_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_note text;
  v_existing public.organization_sms_credit_ledger%ROWTYPE;
  v_balance public.organization_sms_credit_balances%ROWTYPE;
  v_metadata jsonb;
  v_new_balance integer;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'application SMS admin adjustment requires an organization';
  END IF;

  IF p_delta_segments IS NULL OR p_delta_segments = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'zero_adjustment',
      'duplicate', false
    );
  END IF;

  IF abs(p_delta_segments) > 100000 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'adjustment_out_of_range',
      'duplicate', false
    );
  END IF;

  v_key := btrim(COALESCE(p_idempotency_key, ''));
  IF v_key = '' OR char_length(v_key) > 200 THEN
    RAISE EXCEPTION 'application SMS admin adjustment requires an idempotency key';
  END IF;

  v_note := NULLIF(btrim(COALESCE(p_note, '')), '');
  IF v_note IS NOT NULL AND char_length(v_note) > 500 THEN
    RAISE EXCEPTION 'application SMS admin adjustment note is too long';
  END IF;

  IF p_metadata IS NULL THEN
    v_metadata := '{}'::jsonb;
  ELSIF jsonb_typeof(p_metadata) <> 'object' THEN
    RAISE EXCEPTION 'application SMS admin adjustment metadata must be a JSON object';
  ELSE
    v_metadata := p_metadata;
  END IF;

  IF v_note IS NOT NULL THEN
    v_metadata := v_metadata || jsonb_build_object('administrative_note', v_note);
  END IF;
  v_metadata := v_metadata || jsonb_build_object(
    'adjustment_kind', 'admin_adjustment',
    'delta_segments', p_delta_segments
  );

  -- Same organization lock used by reserve/commit/purchase/replenishment.
  PERFORM public.application_sms_capacity_lock(p_organization_id);

  SELECT *
  INTO v_existing
  FROM public.organization_sms_credit_ledger
  WHERE organization_id = p_organization_id
    AND idempotency_key = v_key;

  IF FOUND THEN
    SELECT *
    INTO v_balance
    FROM public.organization_sms_credit_balances
    WHERE organization_id = p_organization_id;

    IF v_existing.reason IS DISTINCT FROM 'admin_adjustment'
      OR v_existing.delta IS DISTINCT FROM p_delta_segments THEN
      RETURN jsonb_build_object(
        'ok', false,
        'outcome', 'idempotency_mismatch',
        'duplicate', true,
        'balance', COALESCE(v_balance.balance, 0),
        'reserved', COALESCE(v_balance.reserved, 0),
        'available', COALESCE(v_balance.balance, 0) - COALESCE(v_balance.reserved, 0),
        'adjusted_segments', v_existing.delta,
        'ledger_id', v_existing.id
      );
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'duplicate',
      'duplicate', true,
      'balance', COALESCE(v_balance.balance, 0),
      'reserved', COALESCE(v_balance.reserved, 0),
      'available', COALESCE(v_balance.balance, 0) - COALESCE(v_balance.reserved, 0),
      'adjusted_segments', v_existing.delta,
      'ledger_id', v_existing.id
    );
  END IF;

  IF p_delta_segments > 0 THEN
    INSERT INTO public.organization_sms_credit_balances (organization_id)
    VALUES (p_organization_id)
    ON CONFLICT (organization_id) DO NOTHING;
  END IF;

  SELECT *
  INTO v_balance
  FROM public.organization_sms_credit_balances
  WHERE organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Debit with no balance row cannot succeed without going negative.
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'insufficient_purchased_balance',
      'duplicate', false,
      'balance', 0,
      'reserved', 0,
      'available', 0,
      'adjusted_segments', 0
    );
  END IF;

  v_new_balance := v_balance.balance + p_delta_segments;

  IF v_new_balance < 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'insufficient_purchased_balance',
      'duplicate', false,
      'balance', v_balance.balance,
      'reserved', v_balance.reserved,
      'available', v_balance.balance - v_balance.reserved,
      'adjusted_segments', 0
    );
  END IF;

  -- Preserve CHECK (balance >= reserved): purchased reserved must remain covered.
  IF v_new_balance < v_balance.reserved THEN
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'reserved_invariant_violation',
      'duplicate', false,
      'balance', v_balance.balance,
      'reserved', v_balance.reserved,
      'available', v_balance.balance - v_balance.reserved,
      'adjusted_segments', 0
    );
  END IF;

  -- Claim the ledger key before mutating balance so a duplicate key aborts
  -- the transaction and cannot leave a balance-only update.
  INSERT INTO public.organization_sms_credit_ledger (
    organization_id,
    delta,
    reason,
    idempotency_key,
    actor_user_id,
    actor_platform_account_id,
    metadata
  )
  VALUES (
    p_organization_id,
    p_delta_segments,
    'admin_adjustment',
    v_key,
    p_actor_user_id,
    p_actor_platform_account_id,
    v_metadata
  )
  RETURNING * INTO v_existing;

  UPDATE public.organization_sms_credit_balances
  SET balance = v_new_balance,
      updated_at = now()
  WHERE organization_id = p_organization_id;

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', 'adjusted',
    'duplicate', false,
    'balance', v_new_balance,
    'reserved', v_balance.reserved,
    'available', v_new_balance - v_balance.reserved,
    'adjusted_segments', p_delta_segments,
    'ledger_id', v_existing.id
  );
END;
$$;

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

COMMENT ON FUNCTION public.adjust_application_sms_purchased_credits(
  uuid, integer, text, text, uuid, uuid, jsonb
) IS
  'Server-only atomic admin adjustment of purchased Application SMS credits. Positive credits, negative debits. Does not create Stripe objects, SMS deliveries, or automatic replenishment. Browser roles cannot execute this function.';
