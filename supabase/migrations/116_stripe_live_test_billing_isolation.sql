-- Phase 5D / Pre-launch Item #2 Stage 2B
-- Additive Live/Test billing-state isolation columns.
-- Does not delete historical rows or tighten uniqueness constraints.

-- ---------------------------------------------------------------------------
-- organization_subscriptions
-- ---------------------------------------------------------------------------
ALTER TABLE public.organization_subscriptions
  ADD COLUMN IF NOT EXISTS provider_mode text;

ALTER TABLE public.organization_subscriptions
  ADD COLUMN IF NOT EXISTS stripe_account_id text;

ALTER TABLE public.organization_subscriptions
  DROP CONSTRAINT IF EXISTS organization_subscriptions_provider_mode_check;

ALTER TABLE public.organization_subscriptions
  ADD CONSTRAINT organization_subscriptions_provider_mode_check
  CHECK (provider_mode IS NULL OR provider_mode IN ('live', 'test'));

CREATE INDEX IF NOT EXISTS organization_subscriptions_org_mode_status_idx
  ON public.organization_subscriptions (organization_id, provider_mode, status);

COMMENT ON COLUMN public.organization_subscriptions.provider_mode IS
  'Stripe object mode: live | test. NULL = local/non-Stripe or unclassified UNKNOWN.';

COMMENT ON COLUMN public.organization_subscriptions.stripe_account_id IS
  'Stripe account id (acct_…) when known. NULL when unclassified or non-Stripe.';

-- ---------------------------------------------------------------------------
-- organization_billing_profiles
-- ---------------------------------------------------------------------------
ALTER TABLE public.organization_billing_profiles
  ADD COLUMN IF NOT EXISTS provider_mode text;

ALTER TABLE public.organization_billing_profiles
  ADD COLUMN IF NOT EXISTS stripe_account_id text;

ALTER TABLE public.organization_billing_profiles
  DROP CONSTRAINT IF EXISTS organization_billing_profiles_provider_mode_check;

ALTER TABLE public.organization_billing_profiles
  ADD CONSTRAINT organization_billing_profiles_provider_mode_check
  CHECK (provider_mode IS NULL OR provider_mode IN ('live', 'test'));

CREATE INDEX IF NOT EXISTS organization_billing_profiles_mode_idx
  ON public.organization_billing_profiles (billing_provider, provider_mode);

-- ---------------------------------------------------------------------------
-- billing_customers
-- ---------------------------------------------------------------------------
ALTER TABLE public.billing_customers
  ADD COLUMN IF NOT EXISTS provider_mode text;

ALTER TABLE public.billing_customers
  ADD COLUMN IF NOT EXISTS stripe_account_id text;

ALTER TABLE public.billing_customers
  DROP CONSTRAINT IF EXISTS billing_customers_provider_mode_check;

ALTER TABLE public.billing_customers
  ADD CONSTRAINT billing_customers_provider_mode_check
  CHECK (provider_mode IS NULL OR provider_mode IN ('live', 'test'));

CREATE INDEX IF NOT EXISTS billing_customers_mode_idx
  ON public.billing_customers (organization_id, billing_provider, provider_mode);

-- ---------------------------------------------------------------------------
-- billing_invoices
-- ---------------------------------------------------------------------------
ALTER TABLE public.billing_invoices
  ADD COLUMN IF NOT EXISTS provider_mode text;

ALTER TABLE public.billing_invoices
  ADD COLUMN IF NOT EXISTS stripe_account_id text;

ALTER TABLE public.billing_invoices
  DROP CONSTRAINT IF EXISTS billing_invoices_provider_mode_check;

ALTER TABLE public.billing_invoices
  ADD CONSTRAINT billing_invoices_provider_mode_check
  CHECK (provider_mode IS NULL OR provider_mode IN ('live', 'test'));

CREATE INDEX IF NOT EXISTS billing_invoices_org_mode_created_idx
  ON public.billing_invoices (organization_id, provider_mode, created_at DESC);

-- ---------------------------------------------------------------------------
-- billing_transactions
-- ---------------------------------------------------------------------------
ALTER TABLE public.billing_transactions
  ADD COLUMN IF NOT EXISTS provider_mode text;

ALTER TABLE public.billing_transactions
  ADD COLUMN IF NOT EXISTS stripe_account_id text;

ALTER TABLE public.billing_transactions
  DROP CONSTRAINT IF EXISTS billing_transactions_provider_mode_check;

ALTER TABLE public.billing_transactions
  ADD CONSTRAINT billing_transactions_provider_mode_check
  CHECK (provider_mode IS NULL OR provider_mode IN ('live', 'test'));

CREATE INDEX IF NOT EXISTS billing_transactions_org_mode_created_idx
  ON public.billing_transactions (organization_id, provider_mode, created_at DESC);

-- ---------------------------------------------------------------------------
-- billing_events
-- ---------------------------------------------------------------------------
ALTER TABLE public.billing_events
  ADD COLUMN IF NOT EXISTS provider_mode text;

ALTER TABLE public.billing_events
  ADD COLUMN IF NOT EXISTS stripe_account_id text;

ALTER TABLE public.billing_events
  DROP CONSTRAINT IF EXISTS billing_events_provider_mode_check;

ALTER TABLE public.billing_events
  ADD CONSTRAINT billing_events_provider_mode_check
  CHECK (provider_mode IS NULL OR provider_mode IN ('live', 'test'));

CREATE INDEX IF NOT EXISTS billing_events_mode_created_idx
  ON public.billing_events (provider_mode, created_at DESC);

-- ---------------------------------------------------------------------------
-- SMS payment-origin history (balance itself remains mode-agnostic)
-- ---------------------------------------------------------------------------
ALTER TABLE public.organization_sms_credit_ledger
  ADD COLUMN IF NOT EXISTS provider_mode text;

ALTER TABLE public.organization_sms_credit_ledger
  DROP CONSTRAINT IF EXISTS organization_sms_credit_ledger_provider_mode_check;

ALTER TABLE public.organization_sms_credit_ledger
  ADD CONSTRAINT organization_sms_credit_ledger_provider_mode_check
  CHECK (provider_mode IS NULL OR provider_mode IN ('live', 'test'));

ALTER TABLE public.organization_sms_replenishment_attempts
  ADD COLUMN IF NOT EXISTS provider_mode text;

ALTER TABLE public.organization_sms_replenishment_attempts
  DROP CONSTRAINT IF EXISTS organization_sms_replenishment_attempts_provider_mode_check;

ALTER TABLE public.organization_sms_replenishment_attempts
  ADD CONSTRAINT organization_sms_replenishment_attempts_provider_mode_check
  CHECK (provider_mode IS NULL OR provider_mode IN ('live', 'test'));
