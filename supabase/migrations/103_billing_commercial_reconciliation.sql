-- =============================================================================
-- 103_billing_commercial_reconciliation.sql
-- Phase 4A: Reconcile commercial plan limits, prices, Stripe lookup-key
-- mappings, SMS package eligibility metadata, and Administrator billing
-- read access. Additive / non-destructive. Does NOT call Stripe or mutate
-- organization plan assignments.
-- DO NOT apply until reviewed.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Provider lookup-key columns on versioned price catalogs
-- ---------------------------------------------------------------------------

ALTER TABLE public.billing_plan_prices
  ADD COLUMN IF NOT EXISTS provider_lookup_key text;

ALTER TABLE public.billing_extra_item_prices
  ADD COLUMN IF NOT EXISTS provider_lookup_key text;

ALTER TABLE public.billing_extra_items
  ADD COLUMN IF NOT EXISTS suggested_low_balance_threshold integer
    CHECK (
      suggested_low_balance_threshold IS NULL
      OR suggested_low_balance_threshold >= 0
    );

COMMENT ON COLUMN public.billing_plan_prices.provider_lookup_key IS
  'Stable billing-provider lookup key (e.g. Stripe Price lookup_key). Not a Stripe price id.';

COMMENT ON COLUMN public.billing_extra_item_prices.provider_lookup_key IS
  'Stable billing-provider lookup key for extra/SMS packages. Not a Stripe price id.';

COMMENT ON COLUMN public.billing_extra_items.suggested_low_balance_threshold IS
  'Suggested per-org low_balance_threshold (~20% of SMS block) for future auto-replenish defaults.';

CREATE UNIQUE INDEX IF NOT EXISTS billing_plan_prices_provider_lookup_uidx
  ON public.billing_plan_prices (billing_provider, provider_lookup_key)
  WHERE provider_lookup_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS billing_extra_item_prices_provider_lookup_uidx
  ON public.billing_extra_item_prices (billing_provider, provider_lookup_key)
  WHERE provider_lookup_key IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Correct plan entitlement limits to approved commercial model
--    Unlimited integer limits use NULL (existing architecture).
-- ---------------------------------------------------------------------------

-- Steward Pro: users 35 -> 20
UPDATE public.plan_features pf
SET
  integer_value = 20,
  updated_at = now()
FROM public.subscription_plans p
JOIN public.features f ON f.feature_key = 'users.active.limit'
WHERE pf.plan_id = p.id
  AND pf.feature_id = f.id
  AND p.plan_key = 'steward_pro'
  AND (pf.integer_value IS DISTINCT FROM 20);

-- Omni Enterprise: users 35 -> unlimited (NULL)
UPDATE public.plan_features pf
SET
  integer_value = NULL,
  updated_at = now()
FROM public.subscription_plans p
JOIN public.features f ON f.feature_key = 'users.active.limit'
WHERE pf.plan_id = p.id
  AND pf.feature_id = f.id
  AND p.plan_key = 'omni_enterprise'
  AND pf.integer_value IS DISTINCT FROM NULL;

-- Ensure monthly SMS allowances match the approved commercial model.
-- Production Shepherd Plus is already 500; this is a no-op when already correct.
-- Do NOT set Shepherd Plus to 1000.
UPDATE public.plan_features pf
SET
  integer_value = v.sms_limit,
  updated_at = now()
FROM public.subscription_plans p
JOIN public.features f ON f.feature_key = 'messaging.sms.monthly_segment_limit'
JOIN (
  VALUES
    ('servant_standard', 0),
    ('steward_pro', 250),
    ('shepherd_plus', 500),
    ('omni_enterprise', 1000)
) AS v(plan_key, sms_limit) ON v.plan_key = p.plan_key
WHERE pf.plan_id = p.id
  AND pf.feature_id = f.id
  AND (pf.integer_value IS DISTINCT FROM v.sms_limit);

-- Ensure Servant / Shepherd user limits match approved model
UPDATE public.plan_features pf
SET
  integer_value = v.user_limit,
  updated_at = now()
FROM public.subscription_plans p
JOIN public.features f ON f.feature_key = 'users.active.limit'
JOIN (
  VALUES
    ('servant_standard', 10),
    ('shepherd_plus', 35)
) AS v(plan_key, user_limit) ON v.plan_key = p.plan_key
WHERE pf.plan_id = p.id
  AND pf.feature_id = f.id
  AND (pf.integer_value IS DISTINCT FROM v.user_limit);

-- ---------------------------------------------------------------------------
-- 3. Reconcile current monthly plan list prices (cents) + lookup keys
--    Does not overwrite retired/historical price rows.
-- ---------------------------------------------------------------------------

UPDATE public.billing_plan_prices bpp
SET
  unit_amount_cents = v.amount_cents,
  provider_lookup_key = v.lookup_key,
  updated_at = now()
FROM public.subscription_plans p
JOIN (
  VALUES
    ('servant_standard', 2995, 'servant_standard_monthly'),
    ('steward_pro', 3995, 'steward_pro_monthly'),
    ('shepherd_plus', 5995, 'shepherd_plus_monthly'),
    ('omni_enterprise', 15000, 'omni_enterprise_monthly')
) AS v(plan_key, amount_cents, lookup_key) ON v.plan_key = p.plan_key
WHERE bpp.plan_id = p.id
  AND bpp.billing_interval = 'month'
  AND bpp.is_current_for_new_signups = true
  AND bpp.status = 'active'
  AND (
    bpp.unit_amount_cents IS DISTINCT FROM v.amount_cents
    OR bpp.provider_lookup_key IS DISTINCT FROM v.lookup_key
  );

-- Keep denormalized subscription_plans.monthly_price_cents in sync
UPDATE public.subscription_plans sp
SET
  monthly_price_cents = bpp.unit_amount_cents,
  currency = bpp.currency,
  updated_at = now()
FROM public.billing_plan_prices bpp
WHERE bpp.plan_id = sp.id
  AND bpp.billing_interval = 'month'
  AND bpp.is_current_for_new_signups = true
  AND bpp.status = 'active'
  AND (
    sp.monthly_price_cents IS DISTINCT FROM bpp.unit_amount_cents
    OR sp.currency IS DISTINCT FROM bpp.currency
  );

-- ---------------------------------------------------------------------------
-- 4. Reconcile SMS package prices, lookup keys, replenish suggestions,
--    and plan eligibility (internal item keys preserved)
-- ---------------------------------------------------------------------------

UPDATE public.billing_extra_items e
SET
  suggested_low_balance_threshold = v.threshold,
  updated_at = now()
FROM (
  VALUES
    ('sms_block_50', 10),
    ('sms_block_100', 20),
    ('sms_block_200', 40),
    ('sms_block_500', 100)
) AS v(item_key, threshold)
WHERE e.item_key = v.item_key
  AND e.suggested_low_balance_threshold IS DISTINCT FROM v.threshold;

UPDATE public.billing_extra_item_prices p
SET
  unit_amount_cents = v.price_cents,
  quantity_units = v.qty,
  provider_lookup_key = v.lookup_key,
  updated_at = now()
FROM public.billing_extra_items e
JOIN (
  VALUES
    ('sms_block_50', 500, 50, 'servant_standard_sms_50'),
    ('sms_block_100', 1000, 100, 'steward_pro_sms_100'),
    ('sms_block_200', 2000, 200, 'shepherd_plus_sms_200'),
    ('sms_block_500', 4000, 500, 'omni_enterprise_sms_500')
) AS v(item_key, price_cents, qty, lookup_key) ON v.item_key = e.item_key
WHERE p.extra_item_id = e.id
  AND p.is_current_for_new_purchases = true
  AND p.status = 'active'
  AND (
    p.unit_amount_cents IS DISTINCT FROM v.price_cents
    OR p.quantity_units IS DISTINCT FROM v.qty
    OR p.provider_lookup_key IS DISTINCT FROM v.lookup_key
  );

-- Ensure plan ↔ SMS package eligibility rows exist (and only the approved ones)
INSERT INTO public.billing_plan_extra_items (plan_id, extra_item_id, is_default_for_plan)
SELECT p.id, e.id, true
FROM public.subscription_plans p
JOIN (
  VALUES
    ('servant_standard', 'sms_block_50'),
    ('steward_pro', 'sms_block_100'),
    ('shepherd_plus', 'sms_block_200'),
    ('omni_enterprise', 'sms_block_500')
) AS v(plan_key, item_key) ON v.plan_key = p.plan_key
JOIN public.billing_extra_items e ON e.item_key = v.item_key
ON CONFLICT (plan_id, extra_item_id) DO UPDATE
  SET is_default_for_plan = true;

-- Remove non-approved plan↔SMS package links so future checkout cannot
-- resolve another plan's package via catalog join alone.
DELETE FROM public.billing_plan_extra_items bpe
USING public.subscription_plans p, public.billing_extra_items e
WHERE bpe.plan_id = p.id
  AND bpe.extra_item_id = e.id
  AND e.item_kind = 'sms_block'
  AND NOT (
    (p.plan_key = 'servant_standard' AND e.item_key = 'sms_block_50')
    OR (p.plan_key = 'steward_pro' AND e.item_key = 'sms_block_100')
    OR (p.plan_key = 'shepherd_plus' AND e.item_key = 'sms_block_200')
    OR (p.plan_key = 'omni_enterprise' AND e.item_key = 'sms_block_500')
  );

-- ---------------------------------------------------------------------------
-- 5. Preserve trial settings (7 days, no card required)
-- ---------------------------------------------------------------------------

UPDATE public.billing_settings
SET
  trial_enabled = true,
  trial_days = 7,
  trial_plan_key = 'servant_standard',
  trial_requires_payment_method = false,
  updated_at = now()
WHERE id = 1
  AND (
    trial_enabled IS DISTINCT FROM true
    OR trial_days IS DISTINCT FROM 7
    OR trial_plan_key IS DISTINCT FROM 'servant_standard'
    OR trial_requires_payment_method IS DISTINCT FROM false
  );

-- ---------------------------------------------------------------------------
-- 6. Administrator read-only billing SELECT helper + policies
--    Writes remain service_role only. Manage remains owner/co_owner.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_view_organization_billing(
  requested_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_memberships m
    WHERE m.user_id = auth.uid()
      AND m.organization_id = requested_organization_id
      AND m.status = 'active'::public.membership_status
      AND m.role IN (
        'owner'::public.membership_role,
        'co_owner'::public.membership_role,
        'administrator'::public.membership_role
      )
  );
$$;

COMMENT ON FUNCTION public.can_view_organization_billing(uuid) IS
  'Owner, co-owner, or administrator may SELECT org billing read surfaces.';

REVOKE ALL ON FUNCTION public.can_view_organization_billing(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_organization_billing(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_organization_billing(uuid) TO service_role;

-- Keep manage helper as owner/co_owner only (reaffirm definition)
CREATE OR REPLACE FUNCTION public.can_manage_organization_billing(
  requested_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_memberships m
    WHERE m.user_id = auth.uid()
      AND m.organization_id = requested_organization_id
      AND m.status = 'active'::public.membership_status
      AND m.role IN (
        'owner'::public.membership_role,
        'co_owner'::public.membership_role
      )
  );
$$;

COMMENT ON FUNCTION public.can_manage_organization_billing(uuid) IS
  'Owner or co-owner may manage org billing (Checkout, portal, plan changes).';

REVOKE ALL ON FUNCTION public.can_manage_organization_billing(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_organization_billing(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_organization_billing(uuid) TO service_role;

-- Widen SELECT policies to can_view; financial writes stay revoked for authenticated
DROP POLICY IF EXISTS organization_billing_profiles_select ON public.organization_billing_profiles;
CREATE POLICY organization_billing_profiles_select
  ON public.organization_billing_profiles
  FOR SELECT TO authenticated
  USING (public.can_view_organization_billing(organization_id));

DROP POLICY IF EXISTS billing_invoices_select ON public.billing_invoices;
CREATE POLICY billing_invoices_select
  ON public.billing_invoices
  FOR SELECT TO authenticated
  USING (public.can_view_organization_billing(organization_id));

DROP POLICY IF EXISTS billing_transactions_select ON public.billing_transactions;
CREATE POLICY billing_transactions_select
  ON public.billing_transactions
  FOR SELECT TO authenticated
  USING (public.can_view_organization_billing(organization_id));

DROP POLICY IF EXISTS organization_sms_credit_ledger_select
  ON public.organization_sms_credit_ledger;
CREATE POLICY organization_sms_credit_ledger_select
  ON public.organization_sms_credit_ledger
  FOR SELECT TO authenticated
  USING (public.can_view_organization_billing(organization_id));

DROP POLICY IF EXISTS organization_sms_credit_balances_select
  ON public.organization_sms_credit_balances;
CREATE POLICY organization_sms_credit_balances_select
  ON public.organization_sms_credit_balances
  FOR SELECT TO authenticated
  USING (
    public.can_view_organization_billing(organization_id)
    OR public.has_active_organization_membership(organization_id)
  );

-- Older billing scaffolding tables (if present)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'billing_customers'
  ) THEN
    EXECUTE $pol$
      DROP POLICY IF EXISTS "Billing customers viewable by billing managers"
        ON public.billing_customers;
      CREATE POLICY billing_customers_select_view
        ON public.billing_customers
        FOR SELECT TO authenticated
        USING (public.can_view_organization_billing(organization_id));
    $pol$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'billing_events'
  ) THEN
    EXECUTE $pol$
      DROP POLICY IF EXISTS "Billing events viewable by billing managers"
        ON public.billing_events;
      CREATE POLICY billing_events_select_view
        ON public.billing_events
        FOR SELECT TO authenticated
        USING (
          organization_id IS NOT NULL
          AND public.can_view_organization_billing(organization_id)
        );
    $pol$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'subscription_change_history'
  ) THEN
    EXECUTE $pol$
      DROP POLICY IF EXISTS "Subscription history viewable by billing managers"
        ON public.subscription_change_history;
      CREATE POLICY subscription_change_history_select_view
        ON public.subscription_change_history
        FOR SELECT TO authenticated
        USING (public.can_view_organization_billing(organization_id));
    $pol$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'subscription_usage_events'
  ) THEN
    EXECUTE $pol$
      DROP POLICY IF EXISTS "Subscription usage events viewable by billing managers"
        ON public.subscription_usage_events;
      CREATE POLICY subscription_usage_events_select_view
        ON public.subscription_usage_events
        FOR SELECT TO authenticated
        USING (public.can_view_organization_billing(organization_id));
    $pol$;
  END IF;
END;
$$;

-- Reaffirm: no authenticated writes on financial tables
REVOKE INSERT, UPDATE, DELETE ON public.billing_settings FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.billing_plan_prices FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.organization_billing_profiles FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.billing_extra_items FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.billing_extra_item_prices FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.billing_plan_extra_items FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.billing_invoices FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.billing_transactions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.organization_sms_credit_balances FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.organization_sms_credit_ledger FROM authenticated;
