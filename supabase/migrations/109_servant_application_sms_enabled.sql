-- =============================================================================
-- 109_servant_application_sms_enabled.sql
-- Servant Standard supports application SMS. Included monthly segments stay 0.
-- Sets messaging.sms.enabled true for servant_standard only.
-- Does not change monthly limits, other plans, organizations, consent,
-- purchased balances, usage, allocations, or subscriptions.
-- Do not apply until reviewed. Do not edit migration 042.
-- =============================================================================

DO $$
DECLARE
  v_enabled_rows integer;
  v_limit_rows integer;
  v_limit integer;
BEGIN
  SELECT count(*)
  INTO v_enabled_rows
  FROM public.plan_features pf
  JOIN public.subscription_plans p ON p.id = pf.plan_id
  JOIN public.features f ON f.id = pf.feature_id
  WHERE p.plan_key = 'servant_standard'
    AND f.feature_key = 'messaging.sms.enabled';

  IF v_enabled_rows <> 1 THEN
    RAISE EXCEPTION
      'expected exactly one Servant messaging.sms.enabled plan feature, found %',
      v_enabled_rows;
  END IF;

  SELECT count(*), min(pf.integer_value)
  INTO v_limit_rows, v_limit
  FROM public.plan_features pf
  JOIN public.subscription_plans p ON p.id = pf.plan_id
  JOIN public.features f ON f.id = pf.feature_id
  WHERE p.plan_key = 'servant_standard'
    AND f.feature_key = 'messaging.sms.monthly_segment_limit';

  IF v_limit_rows <> 1 OR v_limit IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION
      'Servant messaging.sms.monthly_segment_limit must remain exactly one row at 0, found % rows value %',
      v_limit_rows,
      v_limit;
  END IF;

  UPDATE public.plan_features pf
  SET
    boolean_value = true,
    updated_at = now()
  FROM public.subscription_plans p
  JOIN public.features f ON f.feature_key = 'messaging.sms.enabled'
  WHERE pf.plan_id = p.id
    AND pf.feature_id = f.id
    AND p.plan_key = 'servant_standard'
    AND pf.boolean_value IS DISTINCT FROM true;

  SELECT count(*)
  INTO v_enabled_rows
  FROM public.plan_features pf
  JOIN public.subscription_plans p ON p.id = pf.plan_id
  JOIN public.features f ON f.id = pf.feature_id
  WHERE p.plan_key = 'servant_standard'
    AND f.feature_key = 'messaging.sms.enabled'
    AND pf.boolean_value IS TRUE;

  IF v_enabled_rows <> 1 THEN
    RAISE EXCEPTION
      'Servant messaging.sms.enabled was not left exactly true, found % true rows',
      v_enabled_rows;
  END IF;
END $$;
