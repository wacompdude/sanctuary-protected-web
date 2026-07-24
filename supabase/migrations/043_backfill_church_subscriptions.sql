-- =============================================================================
-- 043_backfill_church_subscriptions.sql
-- Safe backfill: assign church_subscriptions for churches missing a current row.
-- Recommends Steward/Shepherd from existing usage; never downgrades.
-- Additive / non-destructive. Safe to re-run.
-- Review before applying to production Supabase.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper: recommend plan key from existing church data
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.recommend_church_plan_key(p_church_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campus_count integer := 0;
  v_policies integer := 0;
  v_medical integer := 0;
  v_hardware integer := 0;
  v_photos integer := 0;
BEGIN
  SELECT count(*)::integer INTO v_campus_count
  FROM public.campuses c
  WHERE c.church_id = p_church_id
    AND c.status = 'active'::public.campus_status;

  IF to_regclass('public.policy_documents') IS NOT NULL THEN
    EXECUTE
      'SELECT count(*)::integer FROM public.policy_documents WHERE church_id = $1'
      INTO v_policies
      USING p_church_id;
  END IF;

  IF to_regclass('public.medical_supplies') IS NOT NULL THEN
    EXECUTE
      'SELECT count(*)::integer FROM public.medical_supplies WHERE church_id = $1'
      INTO v_medical
      USING p_church_id;
  END IF;

  IF to_regclass('public.security_equipment') IS NOT NULL THEN
    EXECUTE
      'SELECT count(*)::integer FROM public.security_equipment WHERE church_id = $1'
      INTO v_hardware
      USING p_church_id;
  END IF;

  IF to_regclass('public.incident_attachments') IS NOT NULL THEN
    EXECUTE
      'SELECT count(*)::integer FROM public.incident_attachments WHERE church_id = $1'
      INTO v_photos
      USING p_church_id;
  END IF;

  IF v_campus_count > 1 OR v_policies > 0 THEN
    RETURN 'shepherd_plus';
  END IF;

  IF v_medical > 0 OR v_hardware > 0 OR v_photos > 0 THEN
    RETURN 'steward_pro';
  END IF;

  RETURN 'servant_standard';
END;
$$;

REVOKE ALL ON FUNCTION public.recommend_church_plan_key(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recommend_church_plan_key(uuid) TO service_role;

COMMENT ON FUNCTION public.recommend_church_plan_key(uuid) IS
  'Phase 4 helper: recommend servant/steward/shepherd from church usage. Never returns omni_enterprise.';

-- ---------------------------------------------------------------------------
-- Helper: assign a plan when the church has no current subscription
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assign_church_subscription(
  p_church_id uuid,
  p_plan_key text DEFAULT NULL,
  p_status public.church_subscription_status DEFAULT 'active',
  p_period_days integer DEFAULT 30
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_key text;
  v_plan_id uuid;
  v_plan_display_name text;
  v_subscription_id uuid;
  v_start timestamptz := now();
  v_end timestamptz;
BEGIN
  IF p_period_days IS NULL OR p_period_days < 1 THEN
    RAISE EXCEPTION 'period days must be >= 1';
  END IF;
  v_end := v_start + make_interval(days => p_period_days);

  -- Skip if church already has a current subscription (never overwrite / downgrade).
  IF EXISTS (
    SELECT 1
    FROM public.church_subscriptions cs
    WHERE cs.church_id = p_church_id
      AND cs.status IN (
        'trialing',
        'active',
        'past_due',
        'grace_period',
        'incomplete'
      )
  ) THEN
    SELECT id INTO v_subscription_id
    FROM public.church_subscriptions cs
    WHERE cs.church_id = p_church_id
      AND cs.status IN (
        'trialing',
        'active',
        'past_due',
        'grace_period',
        'incomplete'
      )
    ORDER BY cs.started_at DESC
    LIMIT 1;
    RETURN v_subscription_id;
  END IF;

  v_plan_key := COALESCE(NULLIF(trim(p_plan_key), ''), public.recommend_church_plan_key(p_church_id));

  SELECT id, display_name
  INTO v_plan_id, v_plan_display_name
  FROM public.subscription_plans
  WHERE plan_key = v_plan_key
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    SELECT id, display_name
    INTO v_plan_id, v_plan_display_name
    FROM public.subscription_plans
    WHERE is_default = true
      AND status = 'active'::public.subscription_plan_status
    ORDER BY sort_order
    LIMIT 1;
    v_plan_key := 'servant_standard';
  END IF;

  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'Subscription plan % is not configured', v_plan_key;
  END IF;

  INSERT INTO public.church_subscriptions (
    church_id,
    plan_id,
    status,
    billing_interval,
    current_period_start,
    current_period_end,
    trial_start,
    trial_end,
    started_at
  )
  VALUES (
    p_church_id,
    v_plan_id,
    p_status,
    'month',
    v_start,
    v_end,
    CASE WHEN p_status = 'trialing' THEN v_start ELSE NULL END,
    CASE WHEN p_status = 'trialing' THEN v_end ELSE NULL END,
    v_start
  )
  RETURNING id INTO v_subscription_id;

  INSERT INTO public.subscription_change_history (
    church_id,
    subscription_id,
    new_plan_id,
    new_status,
    change_type,
    reason,
    metadata
  )
  VALUES (
    p_church_id,
    v_subscription_id,
    v_plan_id,
    p_status,
    'subscription_created',
    'Safe church subscription backfill',
    jsonb_build_object(
      'source', 'assign_church_subscription',
      'plan_key', v_plan_key
    )
  );

  UPDATE public.churches
  SET
    plan_name = v_plan_display_name,
    trial_ends_at = CASE
      WHEN p_status = 'trialing' THEN v_end
      ELSE NULL
    END
  WHERE id = p_church_id;

  RETURN v_subscription_id;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_church_subscription(uuid, text, public.church_subscription_status, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_church_subscription(uuid, text, public.church_subscription_status, integer) TO service_role;

COMMENT ON FUNCTION public.assign_church_subscription(uuid, text, public.church_subscription_status, integer) IS
  'Phase 4 helper: assign a church subscription when missing. Uses recommended plan when p_plan_key is null. Never overwrites an existing current subscription.';

-- ---------------------------------------------------------------------------
-- Backfill all churches missing a current subscription
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.id AS church_id
    FROM public.churches c
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.church_subscriptions cs
      WHERE cs.church_id = c.id
        AND cs.status IN (
          'trialing',
          'active',
          'past_due',
          'grace_period',
          'incomplete'
        )
    )
  LOOP
    PERFORM public.assign_church_subscription(r.church_id, NULL, 'active', 30);
  END LOOP;
END;
$$;
