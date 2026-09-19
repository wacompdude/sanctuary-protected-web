-- =============================================================================
-- 100_billing_foundation.sql
-- Phase 3: Billing database foundation (versioned prices, profiles, extras,
-- invoices/transactions, SMS credit ledger scaffolding, permissions, RLS).
-- Additive / non-destructive. Safe to re-run where seeded with ON CONFLICT.
-- Does NOT install Stripe SDK or create live Stripe Price IDs.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.billing_price_status AS ENUM (
    'draft',
    'active',
    'retired'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.billing_extra_item_kind AS ENUM (
    'sms_block',
    'seat_pack',
    'campus_pack',
    'storage_pack',
    'generic'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.billing_transaction_type AS ENUM (
    'subscription_charge',
    'sms_block',
    'extra_charge',
    'discount',
    'tax',
    'payment',
    'failed_payment',
    'refund',
    'credit',
    'adjustment'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.billing_transaction_status AS ENUM (
    'pending',
    'succeeded',
    'failed',
    'canceled',
    'refunded',
    'partially_refunded'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.billing_invoice_status AS ENUM (
    'draft',
    'open',
    'paid',
    'void',
    'uncollectible'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.billing_payment_status AS ENUM (
    'ok',
    'failed',
    'action_required',
    'unknown'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.sms_credit_ledger_reason AS ENUM (
    'monthly_allocation',
    'auto_replenish',
    'manual_purchase',
    'admin_adjustment',
    'consume',
    'reserve',
    'release_reserve',
    'refund',
    'grace',
    'period_reset'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 2. billing_settings (platform singleton)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.billing_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  trial_enabled boolean NOT NULL DEFAULT true,
  trial_days integer NOT NULL DEFAULT 7
    CHECK (trial_days >= 0 AND trial_days <= 365),
  trial_plan_key text NOT NULL DEFAULT 'servant_standard',
  trial_requires_payment_method boolean NOT NULL DEFAULT false,
  grace_days_after_past_due integer NOT NULL DEFAULT 7
    CHECK (grace_days_after_past_due >= 0 AND grace_days_after_past_due <= 90),
  default_currency text NOT NULL DEFAULT 'USD'
    CHECK (default_currency ~ '^[A-Z]{3}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.billing_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.billing_settings IS
  'Platform-wide billing configuration (singleton row id=1).';

-- ---------------------------------------------------------------------------
-- 3. billing_plan_prices (versioned list prices)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.billing_plan_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.subscription_plans (id) ON DELETE CASCADE,
  currency text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  billing_interval public.subscription_billing_interval NOT NULL DEFAULT 'month',
  unit_amount_cents integer NOT NULL CHECK (unit_amount_cents >= 0),
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  is_current_for_new_signups boolean NOT NULL DEFAULT false,
  allows_grandfathering boolean NOT NULL DEFAULT true,
  billing_provider text NOT NULL DEFAULT 'stripe',
  billing_provider_product_id text,
  billing_provider_price_id text,
  status public.billing_price_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_plan_prices_effective_order_check
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS billing_plan_prices_one_current_uidx
  ON public.billing_plan_prices (plan_id, billing_interval)
  WHERE is_current_for_new_signups = true AND status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS billing_plan_prices_provider_price_uidx
  ON public.billing_plan_prices (billing_provider, billing_provider_price_id)
  WHERE billing_provider_price_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS billing_plan_prices_plan_idx
  ON public.billing_plan_prices (plan_id, status);

COMMENT ON TABLE public.billing_plan_prices IS
  'Versioned subscription list prices. Stripe Price IDs filled in sandbox/live setup; never overwrite amounts in place.';

-- Seed initial monthly prices (Stripe IDs intentionally null)
INSERT INTO public.billing_plan_prices (
  plan_id,
  currency,
  billing_interval,
  unit_amount_cents,
  is_current_for_new_signups,
  allows_grandfathering,
  status
)
SELECT p.id, 'USD', 'month'::public.subscription_billing_interval, v.amount, true, true,
  'active'::public.billing_price_status
FROM public.subscription_plans p
JOIN (
  VALUES
    ('servant_standard', 2995),
    ('steward_pro', 3995),
    ('shepherd_plus', 5995),
    ('omni_enterprise', 15000)
) AS v(plan_key, amount) ON v.plan_key = p.plan_key
WHERE NOT EXISTS (
  SELECT 1
  FROM public.billing_plan_prices bpp
  WHERE bpp.plan_id = p.id
    AND bpp.billing_interval = 'month'
    AND bpp.is_current_for_new_signups = true
);

-- Denormalize current monthly cents onto subscription_plans for existing UI
UPDATE public.subscription_plans sp
SET
  monthly_price_cents = bpp.unit_amount_cents,
  currency = bpp.currency,
  updated_at = now()
FROM public.billing_plan_prices bpp
WHERE bpp.plan_id = sp.id
  AND bpp.billing_interval = 'month'
  AND bpp.is_current_for_new_signups = true
  AND bpp.status = 'active';

-- ---------------------------------------------------------------------------
-- 4. organization_billing_profiles
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.organization_billing_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE
    REFERENCES public.organizations (id) ON DELETE CASCADE,
  billing_provider text NOT NULL DEFAULT 'stripe',
  provider_customer_id text,
  billing_email text,
  billing_contact_name text,
  billing_address jsonb NOT NULL DEFAULT '{}'::jsonb,
  tax_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  billing_enabled boolean NOT NULL DEFAULT true,
  is_complimentary boolean NOT NULL DEFAULT false,
  complimentary_reason text,
  complimentary_set_at timestamptz,
  complimentary_set_by_platform_account_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_billing_profiles_complimentary_reason_check
    CHECK (
      is_complimentary = false
      OR (complimentary_reason IS NOT NULL AND char_length(trim(complimentary_reason)) >= 3)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS organization_billing_profiles_provider_customer_uidx
  ON public.organization_billing_profiles (billing_provider, provider_customer_id)
  WHERE provider_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS organization_billing_profiles_flags_idx
  ON public.organization_billing_profiles (billing_enabled, is_complimentary);

COMMENT ON TABLE public.organization_billing_profiles IS
  'Per-organization billing profile: Stripe customer mapping, tax address, complimentary/billing_enabled flags.';

-- Backfill one profile per organization
INSERT INTO public.organization_billing_profiles (
  organization_id,
  billing_provider,
  provider_customer_id,
  billing_email,
  metadata
)
SELECT
  o.id,
  COALESCE(bc.billing_provider, 'stripe'),
  bc.provider_customer_id,
  COALESCE(bc.email, o.primary_email),
  COALESCE(bc.metadata, '{}'::jsonb)
FROM public.organizations o
LEFT JOIN LATERAL (
  SELECT *
  FROM public.billing_customers c
  WHERE c.organization_id = o.id
  ORDER BY c.created_at ASC
  LIMIT 1
) bc ON true
ON CONFLICT (organization_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Enrich organization_subscriptions
-- ---------------------------------------------------------------------------

ALTER TABLE public.organization_subscriptions
  ADD COLUMN IF NOT EXISTS billing_plan_price_id uuid
    REFERENCES public.billing_plan_prices (id) ON DELETE SET NULL;

ALTER TABLE public.organization_subscriptions
  ADD COLUMN IF NOT EXISTS payment_status public.billing_payment_status
    NOT NULL DEFAULT 'unknown';

ALTER TABLE public.organization_subscriptions
  ADD COLUMN IF NOT EXISTS provider_latest_invoice_id text;

CREATE INDEX IF NOT EXISTS organization_subscriptions_price_idx
  ON public.organization_subscriptions (billing_plan_price_id);

-- Backfill price FK from current monthly price of each plan
UPDATE public.organization_subscriptions os
SET billing_plan_price_id = bpp.id
FROM public.billing_plan_prices bpp
WHERE os.billing_plan_price_id IS NULL
  AND bpp.plan_id = os.plan_id
  AND bpp.billing_interval = os.billing_interval
  AND bpp.is_current_for_new_signups = true
  AND bpp.status = 'active';

-- ---------------------------------------------------------------------------
-- 6. Extra billable items (SMS blocks + future add-ons)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.billing_extra_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  description text,
  item_kind public.billing_extra_item_kind NOT NULL DEFAULT 'generic',
  is_active boolean NOT NULL DEFAULT true,
  customer_purchasable boolean NOT NULL DEFAULT false,
  auto_purchase_allowed boolean NOT NULL DEFAULT true,
  unit_label text NOT NULL DEFAULT 'unit',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_extra_items_key_check
    CHECK (item_key ~ '^[a-z][a-z0-9_]*$')
);

CREATE TABLE IF NOT EXISTS public.billing_extra_item_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  extra_item_id uuid NOT NULL
    REFERENCES public.billing_extra_items (id) ON DELETE CASCADE,
  currency text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  unit_amount_cents integer NOT NULL CHECK (unit_amount_cents >= 0),
  cost_amount_cents integer CHECK (cost_amount_cents IS NULL OR cost_amount_cents >= 0),
  quantity_units integer NOT NULL DEFAULT 1 CHECK (quantity_units > 0),
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  is_current_for_new_purchases boolean NOT NULL DEFAULT false,
  billing_provider text NOT NULL DEFAULT 'stripe',
  billing_provider_product_id text,
  billing_provider_price_id text,
  status public.billing_price_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_extra_item_prices_effective_order_check
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS billing_extra_item_prices_one_current_uidx
  ON public.billing_extra_item_prices (extra_item_id)
  WHERE is_current_for_new_purchases = true AND status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS billing_extra_item_prices_provider_price_uidx
  ON public.billing_extra_item_prices (billing_provider, billing_provider_price_id)
  WHERE billing_provider_price_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.billing_plan_extra_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.subscription_plans (id) ON DELETE CASCADE,
  extra_item_id uuid NOT NULL REFERENCES public.billing_extra_items (id) ON DELETE CASCADE,
  is_default_for_plan boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, extra_item_id)
);

-- Seed SMS block catalog
INSERT INTO public.billing_extra_items (
  item_key, display_name, description, item_kind,
  customer_purchasable, auto_purchase_allowed, unit_label
) VALUES
  ('sms_block_50', 'SMS block (50)', '50 SMS overage credits', 'sms_block', false, true, 'sms'),
  ('sms_block_100', 'SMS block (100)', '100 SMS overage credits', 'sms_block', false, true, 'sms'),
  ('sms_block_200', 'SMS block (200)', '200 SMS overage credits', 'sms_block', false, true, 'sms'),
  ('sms_block_500', 'SMS block (500)', '500 SMS overage credits', 'sms_block', false, true, 'sms')
ON CONFLICT (item_key) DO NOTHING;

INSERT INTO public.billing_extra_item_prices (
  extra_item_id, unit_amount_cents, cost_amount_cents, quantity_units,
  is_current_for_new_purchases, status
)
SELECT e.id, v.price_cents, v.cost_cents, v.qty, true, 'active'::public.billing_price_status
FROM public.billing_extra_items e
JOIN (
  VALUES
    ('sms_block_50', 500, 200, 50),
    ('sms_block_100', 1000, 400, 100),
    ('sms_block_200', 2000, 800, 200),
    ('sms_block_500', 4000, 2000, 500)
) AS v(item_key, price_cents, cost_cents, qty) ON v.item_key = e.item_key
WHERE NOT EXISTS (
  SELECT 1 FROM public.billing_extra_item_prices p
  WHERE p.extra_item_id = e.id AND p.is_current_for_new_purchases = true
);

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
ON CONFLICT (plan_id, extra_item_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7. Invoices + transactions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.billing_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  billing_provider text NOT NULL DEFAULT 'stripe',
  provider_invoice_id text,
  status public.billing_invoice_status NOT NULL DEFAULT 'draft',
  currency text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  subtotal_cents integer NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0),
  tax_cents integer NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  total_cents integer NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  amount_paid_cents integer NOT NULL DEFAULT 0 CHECK (amount_paid_cents >= 0),
  amount_due_cents integer NOT NULL DEFAULT 0 CHECK (amount_due_cents >= 0),
  period_start timestamptz,
  period_end timestamptz,
  hosted_invoice_url text,
  invoice_pdf_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS billing_invoices_provider_invoice_uidx
  ON public.billing_invoices (billing_provider, provider_invoice_id)
  WHERE provider_invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS billing_invoices_org_idx
  ON public.billing_invoices (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.billing_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.billing_invoices (id) ON DELETE SET NULL,
  transaction_type public.billing_transaction_type NOT NULL,
  status public.billing_transaction_status NOT NULL DEFAULT 'pending',
  currency text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  tax_cents integer NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  billing_provider text NOT NULL DEFAULT 'stripe',
  provider_payment_id text,
  provider_refund_id text,
  provider_invoice_id text,
  idempotency_key text,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_by_platform_account_id uuid
);

CREATE UNIQUE INDEX IF NOT EXISTS billing_transactions_idempotency_uidx
  ON public.billing_transactions (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS billing_transactions_org_idx
  ON public.billing_transactions (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS billing_transactions_type_idx
  ON public.billing_transactions (transaction_type, created_at DESC);

COMMENT ON TABLE public.billing_transactions IS
  'Append-oriented financial event mirror. Prefer inserts over updates for auditability.';

-- ---------------------------------------------------------------------------
-- 8. SMS credit ledger scaffolding (Phase 9 will use; schema ready now)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.organization_sms_credit_balances (
  organization_id uuid PRIMARY KEY
    REFERENCES public.organizations (id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0,
  reserved integer NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  low_balance_threshold integer NOT NULL DEFAULT 25 CHECK (low_balance_threshold >= 0),
  auto_replenish_enabled boolean NOT NULL DEFAULT true,
  max_auto_blocks_per_period integer NOT NULL DEFAULT 10
    CHECK (max_auto_blocks_per_period >= 0 AND max_auto_blocks_per_period <= 1000),
  auto_blocks_used_this_period integer NOT NULL DEFAULT 0 CHECK (auto_blocks_used_this_period >= 0),
  grace_credits_remaining integer NOT NULL DEFAULT 0 CHECK (grace_credits_remaining >= 0),
  period_start timestamptz,
  period_end timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_sms_credit_balances_available_check
    CHECK (balance >= reserved)
);

CREATE TABLE IF NOT EXISTS public.organization_sms_credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations (id) ON DELETE CASCADE,
  delta integer NOT NULL,
  reason public.sms_credit_ledger_reason NOT NULL,
  idempotency_key text,
  related_extra_item_price_id uuid
    REFERENCES public.billing_extra_item_prices (id) ON DELETE SET NULL,
  related_transaction_id uuid
    REFERENCES public.billing_transactions (id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  actor_platform_account_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS organization_sms_credit_ledger_idempotency_uidx
  ON public.organization_sms_credit_ledger (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS organization_sms_credit_ledger_org_idx
  ON public.organization_sms_credit_ledger (organization_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 9. billing_events enrichment
-- ---------------------------------------------------------------------------

ALTER TABLE public.billing_events
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0
    CHECK (retry_count >= 0);

ALTER TABLE public.billing_events
  ADD COLUMN IF NOT EXISTS safe_error_summary text;

-- ---------------------------------------------------------------------------
-- 10. updated_at triggers
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'set_updated_at'
  ) THEN
    DROP TRIGGER IF EXISTS billing_settings_set_updated_at ON public.billing_settings;
    CREATE TRIGGER billing_settings_set_updated_at
      BEFORE UPDATE ON public.billing_settings
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

    DROP TRIGGER IF EXISTS billing_plan_prices_set_updated_at ON public.billing_plan_prices;
    CREATE TRIGGER billing_plan_prices_set_updated_at
      BEFORE UPDATE ON public.billing_plan_prices
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

    DROP TRIGGER IF EXISTS organization_billing_profiles_set_updated_at
      ON public.organization_billing_profiles;
    CREATE TRIGGER organization_billing_profiles_set_updated_at
      BEFORE UPDATE ON public.organization_billing_profiles
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

    DROP TRIGGER IF EXISTS billing_extra_items_set_updated_at ON public.billing_extra_items;
    CREATE TRIGGER billing_extra_items_set_updated_at
      BEFORE UPDATE ON public.billing_extra_items
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

    DROP TRIGGER IF EXISTS billing_extra_item_prices_set_updated_at
      ON public.billing_extra_item_prices;
    CREATE TRIGGER billing_extra_item_prices_set_updated_at
      BEFORE UPDATE ON public.billing_extra_item_prices
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

    DROP TRIGGER IF EXISTS billing_invoices_set_updated_at ON public.billing_invoices;
    CREATE TRIGGER billing_invoices_set_updated_at
      BEFORE UPDATE ON public.billing_invoices
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

    DROP TRIGGER IF EXISTS organization_sms_credit_balances_set_updated_at
      ON public.organization_sms_credit_balances;
    CREATE TRIGGER organization_sms_credit_balances_set_updated_at
      BEFORE UPDATE ON public.organization_sms_credit_balances
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 11. Helper: ensure billing profile exists
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_organization_billing_profile(
  p_organization_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.organization_billing_profiles (organization_id)
  VALUES (p_organization_id)
  ON CONFLICT (organization_id) DO UPDATE
    SET updated_at = public.organization_billing_profiles.updated_at
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id
    FROM public.organization_billing_profiles
    WHERE organization_id = p_organization_id;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_organization_billing_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_organization_billing_profile(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_billing_trial_days()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT trial_days FROM public.billing_settings WHERE id = 1
$$;

REVOKE ALL ON FUNCTION public.get_billing_trial_days() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_billing_trial_days() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_billing_trial_days() TO service_role;

-- ---------------------------------------------------------------------------
-- 12. Organization permission definitions + role templates
-- ---------------------------------------------------------------------------

INSERT INTO public.permission_definitions (
  permission_key, category, display_name, description, risk_level, minimum_tier, supports_campus_scope
) VALUES
  ('billing.read', 'billing', 'View Billing', 'View subscription, usage, and billing status', 'low', 'servant_standard', false),
  ('billing.manage', 'billing', 'Manage Billing', 'Manage subscription Checkout and billing settings', 'high', 'servant_standard', false),
  ('billing.payment_method.manage', 'billing', 'Manage Payment Methods', 'Open Stripe Customer Portal for payment methods', 'high', 'servant_standard', false),
  ('billing.subscription.manage', 'billing', 'Manage Subscription', 'Change or cancel the organization subscription', 'high', 'servant_standard', false),
  ('billing.invoices.read', 'billing', 'View Invoices', 'View invoice history', 'low', 'servant_standard', false),
  ('billing.transactions.read', 'billing', 'View Transactions', 'View billing transaction history', 'low', 'servant_standard', false),
  ('billing.sms_replenishment.manage', 'billing', 'Manage SMS Replenishment', 'Configure SMS auto-replenishment', 'medium', 'steward_pro', false),
  ('billing.discount.apply', 'billing', 'Apply Discount Codes', 'Apply promotion codes at Checkout', 'medium', 'servant_standard', false)
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO public.role_permission_templates (role_kind, role_key, permission_key)
SELECT 'church'::public.role_template_kind, v.role_key, v.permission_key
FROM (
  VALUES
    ('owner', 'billing.read'),
    ('owner', 'billing.manage'),
    ('owner', 'billing.payment_method.manage'),
    ('owner', 'billing.subscription.manage'),
    ('owner', 'billing.invoices.read'),
    ('owner', 'billing.transactions.read'),
    ('owner', 'billing.sms_replenishment.manage'),
    ('owner', 'billing.discount.apply'),
    ('co_owner', 'billing.read'),
    ('co_owner', 'billing.manage'),
    ('co_owner', 'billing.payment_method.manage'),
    ('co_owner', 'billing.subscription.manage'),
    ('co_owner', 'billing.invoices.read'),
    ('co_owner', 'billing.transactions.read'),
    ('co_owner', 'billing.sms_replenishment.manage'),
    ('co_owner', 'billing.discount.apply'),
    ('administrator', 'billing.read'),
    ('administrator', 'billing.invoices.read'),
    ('administrator', 'billing.transactions.read')
) AS v(role_key, permission_key)
WHERE EXISTS (
  SELECT 1 FROM public.permission_definitions pd WHERE pd.permission_key = v.permission_key
)
AND NOT EXISTS (
  SELECT 1 FROM public.role_permission_templates t
  WHERE t.role_kind = 'church'
    AND t.role_key = v.role_key
    AND t.permission_key = v.permission_key
);

-- ---------------------------------------------------------------------------
-- 13. Platform billing permissions
-- ---------------------------------------------------------------------------

SELECT public.seed_platform_permission(
  'billing.plans.manage', 'Manage billing plans',
  'Activate or deactivate subscription plans for billing.', 'billing');
SELECT public.seed_platform_permission(
  'billing.prices.read', 'Read billing prices',
  'View versioned plan and extra-item prices.', 'billing');
SELECT public.seed_platform_permission(
  'billing.prices.manage', 'Manage billing prices',
  'Create and retire versioned prices (no silent overwrites).', 'billing');
SELECT public.seed_platform_permission(
  'billing.transactions.read', 'Read billing transactions',
  'View mirrored billing transactions across organizations.', 'billing');
SELECT public.seed_platform_permission(
  'billing.refunds.create', 'Create refunds',
  'Issue authorized Stripe refunds via platform tools.', 'billing');
SELECT public.seed_platform_permission(
  'billing.discounts.manage', 'Manage discount codes',
  'Create and manage promotion/discount codes.', 'billing');
SELECT public.seed_platform_permission(
  'billing.organizations.read', 'Read organization billing',
  'Inspect organization billing profiles and subscription state.', 'billing');
SELECT public.seed_platform_permission(
  'billing.organizations.manage', 'Manage organization billing',
  'Enable/disable billing and complimentary status for organizations.', 'billing');
SELECT public.seed_platform_permission(
  'billing.overrides.manage', 'Manage billing overrides',
  'Apply platform billing overrides with audit reasons.', 'billing');
SELECT public.seed_platform_permission(
  'billing.reports.read', 'Read billing reports',
  'View billing and revenue reporting surfaces.', 'billing');

-- Grant new billing permissions to super_admin (all active) + billing_admin subset
SELECT public.seed_platform_role_permission('super_admin', p.permission_key)
FROM public.platform_permissions p
WHERE p.permission_key LIKE 'billing.%'
  AND p.status = 'active';

SELECT public.seed_platform_role_permission('billing_admin', v.permission_key)
FROM (
  VALUES
    ('billing.plans.manage'),
    ('billing.prices.read'),
    ('billing.prices.manage'),
    ('billing.transactions.read'),
    ('billing.refunds.create'),
    ('billing.discounts.manage'),
    ('billing.organizations.read'),
    ('billing.organizations.manage'),
    ('billing.overrides.manage'),
    ('billing.reports.read')
) AS v(permission_key);

SELECT public.seed_platform_role_permission('platform_admin', 'billing.prices.read');
SELECT public.seed_platform_role_permission('platform_admin', 'billing.organizations.read');
SELECT public.seed_platform_role_permission('platform_admin', 'billing.transactions.read');
SELECT public.seed_platform_role_permission('auditor', 'billing.prices.read');
SELECT public.seed_platform_role_permission('auditor', 'billing.organizations.read');
SELECT public.seed_platform_role_permission('auditor', 'billing.transactions.read');
SELECT public.seed_platform_role_permission('auditor', 'billing.reports.read');

-- ---------------------------------------------------------------------------
-- 14. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_plan_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_billing_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_extra_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_extra_item_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_plan_extra_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_sms_credit_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_sms_credit_ledger ENABLE ROW LEVEL SECURITY;

-- Catalog reads (authenticated)
DROP POLICY IF EXISTS billing_settings_read ON public.billing_settings;
CREATE POLICY billing_settings_read ON public.billing_settings
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS billing_plan_prices_read ON public.billing_plan_prices;
CREATE POLICY billing_plan_prices_read ON public.billing_plan_prices
  FOR SELECT TO authenticated
  USING (status IN ('active', 'retired'));

DROP POLICY IF EXISTS billing_extra_items_read ON public.billing_extra_items;
CREATE POLICY billing_extra_items_read ON public.billing_extra_items
  FOR SELECT TO authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS billing_extra_item_prices_read ON public.billing_extra_item_prices;
CREATE POLICY billing_extra_item_prices_read ON public.billing_extra_item_prices
  FOR SELECT TO authenticated
  USING (status IN ('active', 'retired'));

DROP POLICY IF EXISTS billing_plan_extra_items_read ON public.billing_plan_extra_items;
CREATE POLICY billing_plan_extra_items_read ON public.billing_plan_extra_items
  FOR SELECT TO authenticated
  USING (true);

-- Org-scoped billing tables: owners/co-owners (existing helper) may read
DROP POLICY IF EXISTS organization_billing_profiles_select ON public.organization_billing_profiles;
CREATE POLICY organization_billing_profiles_select
  ON public.organization_billing_profiles
  FOR SELECT TO authenticated
  USING (public.can_manage_organization_billing(organization_id));

DROP POLICY IF EXISTS billing_invoices_select ON public.billing_invoices;
CREATE POLICY billing_invoices_select
  ON public.billing_invoices
  FOR SELECT TO authenticated
  USING (public.can_manage_organization_billing(organization_id));

DROP POLICY IF EXISTS billing_transactions_select ON public.billing_transactions;
CREATE POLICY billing_transactions_select
  ON public.billing_transactions
  FOR SELECT TO authenticated
  USING (public.can_manage_organization_billing(organization_id));

DROP POLICY IF EXISTS organization_sms_credit_balances_select
  ON public.organization_sms_credit_balances;
CREATE POLICY organization_sms_credit_balances_select
  ON public.organization_sms_credit_balances
  FOR SELECT TO authenticated
  USING (
    public.can_manage_organization_billing(organization_id)
    OR public.has_active_organization_membership(organization_id)
  );

DROP POLICY IF EXISTS organization_sms_credit_ledger_select
  ON public.organization_sms_credit_ledger;
CREATE POLICY organization_sms_credit_ledger_select
  ON public.organization_sms_credit_ledger
  FOR SELECT TO authenticated
  USING (public.can_manage_organization_billing(organization_id));

-- No authenticated INSERT/UPDATE/DELETE on financial tables (service_role only)
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

GRANT SELECT ON public.billing_settings TO authenticated;
GRANT SELECT ON public.billing_plan_prices TO authenticated;
GRANT SELECT ON public.organization_billing_profiles TO authenticated;
GRANT SELECT ON public.billing_extra_items TO authenticated;
GRANT SELECT ON public.billing_extra_item_prices TO authenticated;
GRANT SELECT ON public.billing_plan_extra_items TO authenticated;
GRANT SELECT ON public.billing_invoices TO authenticated;
GRANT SELECT ON public.billing_transactions TO authenticated;
GRANT SELECT ON public.organization_sms_credit_balances TO authenticated;
GRANT SELECT ON public.organization_sms_credit_ledger TO authenticated;

GRANT ALL ON public.billing_settings TO service_role;
GRANT ALL ON public.billing_plan_prices TO service_role;
GRANT ALL ON public.organization_billing_profiles TO service_role;
GRANT ALL ON public.billing_extra_items TO service_role;
GRANT ALL ON public.billing_extra_item_prices TO service_role;
GRANT ALL ON public.billing_plan_extra_items TO service_role;
GRANT ALL ON public.billing_invoices TO service_role;
GRANT ALL ON public.billing_transactions TO service_role;
GRANT ALL ON public.organization_sms_credit_balances TO service_role;
GRANT ALL ON public.organization_sms_credit_ledger TO service_role;
