-- =============================================================================
-- 107_credit_purchased_application_sms.sql
-- Atomic, idempotent credit of purchased application SMS segments.
-- Does not apply until reviewed. Do not run supabase db push from this change.
-- Does not change SMS-A reserve, commit, release, or send-started behavior.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.credit_purchased_application_sms_segments(
  p_organization_id uuid,
  p_segments integer,
  p_idempotency_key text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_existing public.organization_sms_credit_ledger%ROWTYPE;
  v_balance public.organization_sms_credit_balances%ROWTYPE;
  v_metadata jsonb;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'application SMS purchase credit requires an organization';
  END IF;

  IF p_segments IS NULL OR p_segments <= 0 OR p_segments > 100000 THEN
    RAISE EXCEPTION 'application SMS purchase credit requires a positive segment count';
  END IF;

  v_key := btrim(COALESCE(p_idempotency_key, ''));
  IF v_key = '' OR char_length(v_key) > 200 THEN
    RAISE EXCEPTION 'application SMS purchase credit requires an idempotency key';
  END IF;

  IF p_metadata IS NULL THEN
    v_metadata := '{}'::jsonb;
  ELSIF jsonb_typeof(p_metadata) <> 'object' THEN
    RAISE EXCEPTION 'application SMS purchase credit metadata must be a JSON object';
  ELSE
    v_metadata := p_metadata;
  END IF;

  -- Same organization lock SMS-A uses, so a purchase cannot race a reserve,
  -- commit, or release of purchased credits.
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

    IF v_existing.reason IS DISTINCT FROM 'manual_purchase'
      OR v_existing.delta IS DISTINCT FROM p_segments THEN
      RETURN jsonb_build_object(
        'ok', false,
        'outcome', 'idempotency_mismatch',
        'duplicate', true,
        'balance', COALESCE(v_balance.balance, 0),
        'reserved', COALESCE(v_balance.reserved, 0),
        'available', COALESCE(v_balance.balance, 0) - COALESCE(v_balance.reserved, 0),
        'credited_segments', v_existing.delta
      );
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'duplicate',
      'duplicate', true,
      'balance', COALESCE(v_balance.balance, 0),
      'reserved', COALESCE(v_balance.reserved, 0),
      'available', COALESCE(v_balance.balance, 0) - COALESCE(v_balance.reserved, 0),
      'credited_segments', v_existing.delta
    );
  END IF;

  INSERT INTO public.organization_sms_credit_balances (
    organization_id
  )
  VALUES (
    p_organization_id
  )
  ON CONFLICT (organization_id) DO NOTHING;

  SELECT *
  INTO v_balance
  FROM public.organization_sms_credit_balances
  WHERE organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'application SMS purchase credit could not lock the balance';
  END IF;

  -- Claim the ledger key before changing the balance. A duplicate key aborts
  -- this transaction, so the balance update below cannot commit alone.
  INSERT INTO public.organization_sms_credit_ledger (
    organization_id,
    delta,
    reason,
    idempotency_key,
    metadata
  )
  VALUES (
    p_organization_id,
    p_segments,
    'manual_purchase',
    v_key,
    v_metadata
  );

  UPDATE public.organization_sms_credit_balances
  SET balance = balance + p_segments,
      updated_at = now()
  WHERE organization_id = p_organization_id;

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', 'credited',
    'duplicate', false,
    'balance', v_balance.balance + p_segments,
    'reserved', v_balance.reserved,
    'available', v_balance.balance + p_segments - v_balance.reserved,
    'credited_segments', p_segments
  );
END;
$$;

REVOKE ALL ON FUNCTION public.credit_purchased_application_sms_segments(uuid, integer, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.credit_purchased_application_sms_segments(uuid, integer, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.credit_purchased_application_sms_segments(uuid, integer, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.credit_purchased_application_sms_segments(uuid, integer, text, jsonb) TO service_role;

COMMENT ON FUNCTION public.credit_purchased_application_sms_segments(uuid, integer, text, jsonb) IS
  'Server-only atomic credit of purchased application SMS segments. Duplicate idempotency keys do not credit again. Browser roles cannot execute this function.';
