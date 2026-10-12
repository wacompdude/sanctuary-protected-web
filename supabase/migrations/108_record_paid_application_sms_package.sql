-- =============================================================================
-- 108_record_paid_application_sms_package.sql
-- Atomic paid application SMS package record:
-- one sms_block billing transaction, one manual_purchase ledger row,
-- and one purchased-balance increase.
-- Does not apply until reviewed. Do not run supabase db push from this change.
-- Does not change migration 106, migration 107, or SMS-A functions.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.record_paid_application_sms_package(
  p_organization_id uuid,
  p_segments integer,
  p_amount_cents integer,
  p_idempotency_key text,
  p_tax_cents integer DEFAULT 0,
  p_provider_payment_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_payment text;
  v_metadata jsonb;
  v_txn public.billing_transactions%ROWTYPE;
  v_ledger public.organization_sms_credit_ledger%ROWTYPE;
  v_balance public.organization_sms_credit_balances%ROWTYPE;
  v_balance_found boolean := false;
  v_existing_balance integer := 0;
  v_existing_reserved integer := 0;
  v_txn_id uuid;
  v_ledger_id uuid;
  v_txn_found boolean := false;
  v_ledger_found boolean := false;
  v_payment_not_recorded boolean := false;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'paid application SMS package requires an organization';
  END IF;

  IF p_segments IS NULL OR p_segments <= 0 OR p_segments > 100000 THEN
    RAISE EXCEPTION 'paid application SMS package requires a positive segment count';
  END IF;

  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'paid application SMS package requires a positive amount';
  END IF;

  IF p_tax_cents IS NULL OR p_tax_cents < 0 THEN
    RAISE EXCEPTION 'paid application SMS package tax cannot be negative';
  END IF;

  v_key := btrim(COALESCE(p_idempotency_key, ''));
  IF v_key = '' OR char_length(v_key) > 200 THEN
    RAISE EXCEPTION 'paid application SMS package requires an idempotency key';
  END IF;

  IF p_provider_payment_id IS NULL THEN
    v_payment := NULL;
  ELSE
    v_payment := btrim(p_provider_payment_id);
    IF v_payment = '' OR char_length(v_payment) > 255 THEN
      RAISE EXCEPTION 'paid application SMS package provider payment id is invalid';
    END IF;
  END IF;

  IF p_metadata IS NULL THEN
    v_metadata := '{}'::jsonb;
  ELSIF jsonb_typeof(p_metadata) <> 'object' THEN
    RAISE EXCEPTION 'paid application SMS package metadata must be a JSON object';
  ELSE
    v_metadata := p_metadata;
  END IF;

  PERFORM public.application_sms_capacity_lock(p_organization_id);

  SELECT *
  INTO v_txn
  FROM public.billing_transactions
  WHERE organization_id = p_organization_id
    AND idempotency_key = v_key;
  v_txn_found := FOUND;

  SELECT *
  INTO v_ledger
  FROM public.organization_sms_credit_ledger
  WHERE organization_id = p_organization_id
    AND idempotency_key = v_key;
  v_ledger_found := FOUND;

  SELECT *
  INTO v_balance
  FROM public.organization_sms_credit_balances
  WHERE organization_id = p_organization_id;
  v_balance_found := FOUND;
  IF v_balance_found THEN
    v_existing_balance := v_balance.balance;
    v_existing_reserved := v_balance.reserved;
  END IF;

  IF v_txn_found OR v_ledger_found THEN
    IF NOT v_txn_found OR NOT v_ledger_found
      OR v_ledger.related_transaction_id IS DISTINCT FROM v_txn.id THEN
      RETURN jsonb_build_object(
        'ok', false,
        'outcome', 'reconciliation_required',
        'duplicate', false,
        'transaction_id', CASE WHEN v_txn_found THEN v_txn.id ELSE NULL END,
        'ledger_id', CASE WHEN v_ledger_found THEN v_ledger.id ELSE NULL END,
        'balance', v_existing_balance,
        'reserved', v_existing_reserved,
        'available', v_existing_balance - v_existing_reserved,
        'credited_segments', CASE WHEN v_ledger_found THEN v_ledger.delta ELSE 0 END,
        'amount_cents', CASE WHEN v_txn_found THEN v_txn.amount_cents ELSE NULL END,
        'tax_cents', CASE WHEN v_txn_found THEN v_txn.tax_cents ELSE NULL END,
        'provider_payment_id', CASE WHEN v_txn_found THEN v_txn.provider_payment_id ELSE NULL END,
        'provider_payment_id_not_recorded', false
      );
    END IF;

    IF v_txn.transaction_type IS DISTINCT FROM 'sms_block'
      OR v_txn.status IS DISTINCT FROM 'succeeded'
      OR v_txn.currency IS DISTINCT FROM 'USD'
      OR v_txn.billing_provider IS DISTINCT FROM 'stripe'
      OR v_txn.amount_cents IS DISTINCT FROM p_amount_cents
      OR v_txn.tax_cents IS DISTINCT FROM p_tax_cents
      OR v_txn.invoice_id IS NOT NULL
      OR v_ledger.reason IS DISTINCT FROM 'manual_purchase'
      OR v_ledger.delta IS DISTINCT FROM p_segments
      OR (
        v_txn.provider_payment_id IS NOT NULL
        AND v_payment IS NOT NULL
        AND v_txn.provider_payment_id IS DISTINCT FROM v_payment
      ) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'outcome', 'idempotency_mismatch',
        'duplicate', true,
        'transaction_id', v_txn.id,
        'ledger_id', v_ledger.id,
        'balance', v_existing_balance,
        'reserved', v_existing_reserved,
        'available', v_existing_balance - v_existing_reserved,
        'credited_segments', v_ledger.delta,
        'amount_cents', v_txn.amount_cents,
        'tax_cents', v_txn.tax_cents,
        'provider_payment_id', v_txn.provider_payment_id,
        'provider_payment_id_not_recorded', false
      );
    END IF;

    v_payment_not_recorded :=
      v_txn.provider_payment_id IS NULL AND v_payment IS NOT NULL;

    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'duplicate',
      'duplicate', true,
      'transaction_id', v_txn.id,
      'ledger_id', v_ledger.id,
      'balance', v_existing_balance,
      'reserved', v_existing_reserved,
      'available', v_existing_balance - v_existing_reserved,
      'credited_segments', v_ledger.delta,
      'amount_cents', v_txn.amount_cents,
      'tax_cents', v_txn.tax_cents,
      'provider_payment_id', v_txn.provider_payment_id,
      'provider_payment_id_not_recorded', v_payment_not_recorded
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
    RAISE EXCEPTION 'paid application SMS package could not lock the balance';
  END IF;

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
    p_organization_id,
    NULL,
    'sms_block',
    'succeeded',
    'USD',
    p_amount_cents,
    p_tax_cents,
    'stripe',
    v_payment,
    v_key,
    'Application SMS credit purchase',
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
    p_organization_id,
    p_segments,
    'manual_purchase',
    v_key,
    v_txn_id,
    v_metadata
  )
  RETURNING id INTO v_ledger_id;

  UPDATE public.organization_sms_credit_balances
  SET balance = balance + p_segments,
      updated_at = now()
  WHERE organization_id = p_organization_id;

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', 'recorded',
    'duplicate', false,
    'transaction_id', v_txn_id,
    'ledger_id', v_ledger_id,
    'balance', v_balance.balance + p_segments,
    'reserved', v_balance.reserved,
    'available', v_balance.balance + p_segments - v_balance.reserved,
    'credited_segments', p_segments,
    'amount_cents', p_amount_cents,
    'tax_cents', p_tax_cents,
    'provider_payment_id', v_payment,
    'provider_payment_id_not_recorded', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_paid_application_sms_package(uuid, integer, integer, text, integer, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_paid_application_sms_package(uuid, integer, integer, text, integer, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.record_paid_application_sms_package(uuid, integer, integer, text, integer, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_paid_application_sms_package(uuid, integer, integer, text, integer, text, jsonb) TO service_role;

COMMENT ON FUNCTION public.record_paid_application_sms_package(uuid, integer, integer, text, integer, text, jsonb) IS
  'Server-only atomic record of one paid application SMS package: sms_block transaction, manual_purchase ledger, and purchased balance. Does not call Stripe.';
