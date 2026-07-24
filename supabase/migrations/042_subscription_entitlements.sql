-- =============================================================================
-- 042_subscription_entitlements.sql
-- Subscription plans, feature registry, plan assignments, church subscriptions,
-- usage metering tables, billing scaffolding, and initial seed data.
-- Additive / non-destructive. Safe to re-run.
-- Review before applying to production Supabase.
--
-- Architecture:
--   subscription_plans → plan_features → features
--   church_subscriptions (one current subscription per church)
--   subscription_usage / subscription_usage_events (period metering)
--   subscription_change_history (auditable plan/status changes)
--   billing_customers / billing_events (provider scaffolding; no secrets)
--
-- Application code MUST resolve entitlements by feature_key, never by plan name.
-- Campuses share the church subscription (no campus-level subscriptions).
--
-- Seed policy:
--   Plans/features/assignments insert when missing (ON CONFLICT DO NOTHING).
--   Manual plan-feature edits are not overwritten on re-run.
--   Existing churches are NOT auto-assigned here (see Phase 4 migration helper).
--
-- Campus limit decision (Shepherd Plus / Omni Enterprise):
--   campuses.multiple.enabled = true
--   campuses.maximum_count = NULL  → unlimited until product sets a numeric cap
--
-- Pending invitations: do NOT count toward users.active.limit until accepted
--   (enforce in app Phase 5; documented here for consistency).
--
-- Downgrade policy (app-enforced; data preserved):
--   - Never auto-delete inventory, policies, campuses, photos, or integrations
--   - Block new writes to unavailable features
--   - Prefer read-only access to historical data where commercially appropriate
--   - evaluateSubscriptionDowngrade() (Phase 5+) surfaces blockers before change
--
-- Billing provider strategy:
--   No provider is integrated yet. billing_* columns + billing_events store
--   provider references only. Secrets stay in server env. Webhooks (Phase 7)
--   update church_subscriptions via trusted server code / service role.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.subscription_plan_status AS ENUM (
    'draft',
    'active',
    'inactive',
    'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.subscription_billing_interval AS ENUM (
    'month',
    'year'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.church_subscription_status AS ENUM (
    'trialing',
    'active',
    'past_due',
    'grace_period',
    'cancelled',
    'expired',
    'suspended',
    'incomplete'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.feature_value_type AS ENUM (
    'boolean',
    'integer',
    'decimal',
    'text',
    'json'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.feature_category AS ENUM (
    'membership',
    'incidents',
    'notifications',
    'scheduling',
    'medical',
    'hardware',
    'policies',
    'analytics',
    'campuses',
    'cameras',
    'sensors',
    'storage',
    'billing'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.feature_definition_status AS ENUM (
    'active',
    'inactive',
    'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.subscription_usage_event_type AS ENUM (
    'reserve',
    'consume',
    'release',
    'adjust',
    'reverse'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- subscription_plans
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_key text NOT NULL,
  display_name text NOT NULL,
  description text,
  status public.subscription_plan_status NOT NULL DEFAULT 'draft',
  billing_interval public.subscription_billing_interval NOT NULL DEFAULT 'month',
  billing_provider text,
  billing_provider_product_id text,
  billing_provider_price_id text,
  monthly_price_cents integer,
  currency text NOT NULL DEFAULT 'USD',
  sort_order integer NOT NULL DEFAULT 100,
  is_public boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  is_custom boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT subscription_plans_plan_key_format_check
    CHECK (plan_key ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT subscription_plans_currency_check
    CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT subscription_plans_price_nonnegative_check
    CHECK (monthly_price_cents IS NULL OR monthly_price_cents >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS subscription_plans_plan_key_uidx
  ON public.subscription_plans (plan_key);

CREATE UNIQUE INDEX IF NOT EXISTS subscription_plans_one_default_uidx
  ON public.subscription_plans (is_default)
  WHERE is_default = true;

CREATE INDEX IF NOT EXISTS subscription_plans_status_sort_idx
  ON public.subscription_plans (status, sort_order);

-- ---------------------------------------------------------------------------
-- features
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key text NOT NULL,
  display_name text NOT NULL,
  description text,
  category public.feature_category NOT NULL,
  value_type public.feature_value_type NOT NULL,
  default_boolean_value boolean,
  default_numeric_value numeric,
  default_text_value text,
  unit text,
  status public.feature_definition_status NOT NULL DEFAULT 'active',
  is_customer_visible boolean NOT NULL DEFAULT true,
  marketing_title text,
  marketing_description text,
  comparison_group text,
  comparison_order integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT features_feature_key_format_check
    CHECK (feature_key ~ '^[a-z][a-z0-9_.]*$')
);

CREATE UNIQUE INDEX IF NOT EXISTS features_feature_key_uidx
  ON public.features (feature_key);

CREATE INDEX IF NOT EXISTS features_category_status_idx
  ON public.features (category, status);

-- ---------------------------------------------------------------------------
-- plan_features (effective values per plan; no runtime inheritance recursion)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.plan_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.subscription_plans (id) ON DELETE CASCADE,
  feature_id uuid NOT NULL REFERENCES public.features (id) ON DELETE CASCADE,
  boolean_value boolean,
  integer_value integer,
  decimal_value numeric,
  text_value text,
  json_value jsonb,
  is_inherited boolean NOT NULL DEFAULT false,
  source_plan_id uuid REFERENCES public.subscription_plans (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plan_features_unique_assignment UNIQUE (plan_id, feature_id)
);

CREATE INDEX IF NOT EXISTS plan_features_plan_id_idx
  ON public.plan_features (plan_id);

CREATE INDEX IF NOT EXISTS plan_features_feature_id_idx
  ON public.plan_features (feature_id);

-- ---------------------------------------------------------------------------
-- church_subscriptions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.church_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.subscription_plans (id),
  status public.church_subscription_status NOT NULL DEFAULT 'incomplete',
  billing_interval public.subscription_billing_interval NOT NULL DEFAULT 'month',
  billing_provider text,
  billing_customer_id text,
  billing_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  cancelled_at timestamptz,
  trial_start timestamptz,
  trial_end timestamptz,
  grace_period_end timestamptz,
  started_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT church_subscriptions_period_order_check
    CHECK (
      current_period_start IS NULL
      OR current_period_end IS NULL
      OR current_period_end >= current_period_start
    )
);

-- At most one "current" subscription per church (billing lifecycle states).
CREATE UNIQUE INDEX IF NOT EXISTS church_subscriptions_one_current_uidx
  ON public.church_subscriptions (church_id)
  WHERE status IN (
    'trialing',
    'active',
    'past_due',
    'grace_period',
    'incomplete'
  );

CREATE INDEX IF NOT EXISTS church_subscriptions_church_id_idx
  ON public.church_subscriptions (church_id);

CREATE INDEX IF NOT EXISTS church_subscriptions_plan_id_idx
  ON public.church_subscriptions (plan_id);

CREATE INDEX IF NOT EXISTS church_subscriptions_status_idx
  ON public.church_subscriptions (status);

CREATE INDEX IF NOT EXISTS church_subscriptions_period_end_idx
  ON public.church_subscriptions (current_period_end);

-- ---------------------------------------------------------------------------
-- subscription_change_history
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.subscription_change_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.church_subscriptions (id) ON DELETE SET NULL,
  old_plan_id uuid REFERENCES public.subscription_plans (id) ON DELETE SET NULL,
  new_plan_id uuid REFERENCES public.subscription_plans (id) ON DELETE SET NULL,
  old_status public.church_subscription_status,
  new_status public.church_subscription_status,
  change_type text NOT NULL,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  changed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscription_change_history_type_check
    CHECK (change_type ~ '^[a-z][a-z0-9_]*$')
);

CREATE INDEX IF NOT EXISTS subscription_change_history_church_idx
  ON public.subscription_change_history (church_id, created_at DESC);

CREATE INDEX IF NOT EXISTS subscription_change_history_subscription_idx
  ON public.subscription_change_history (subscription_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- subscription_usage (period aggregates)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.subscription_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.church_subscriptions (id) ON DELETE CASCADE,
  feature_id uuid NOT NULL REFERENCES public.features (id) ON DELETE CASCADE,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  quantity_used numeric NOT NULL DEFAULT 0,
  quantity_reserved numeric NOT NULL DEFAULT 0,
  last_calculated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscription_usage_period_order_check
    CHECK (period_end >= period_start),
  CONSTRAINT subscription_usage_quantities_nonnegative_check
    CHECK (quantity_used >= 0 AND quantity_reserved >= 0),
  CONSTRAINT subscription_usage_period_unique
    UNIQUE (subscription_id, feature_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS subscription_usage_church_period_idx
  ON public.subscription_usage (church_id, period_start, period_end);

CREATE INDEX IF NOT EXISTS subscription_usage_feature_idx
  ON public.subscription_usage (feature_id);

-- ---------------------------------------------------------------------------
-- subscription_usage_events (idempotent ledger)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.subscription_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.church_subscriptions (id) ON DELETE CASCADE,
  feature_id uuid NOT NULL REFERENCES public.features (id) ON DELETE CASCADE,
  usage_key text NOT NULL,
  quantity numeric NOT NULL,
  event_type public.subscription_usage_event_type NOT NULL,
  source_type text,
  source_id text,
  billing_period_start timestamptz NOT NULL,
  billing_period_end timestamptz NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscription_usage_events_quantity_nonzero_check
    CHECK (quantity <> 0),
  CONSTRAINT subscription_usage_events_period_order_check
    CHECK (billing_period_end >= billing_period_start)
);

CREATE UNIQUE INDEX IF NOT EXISTS subscription_usage_events_usage_key_uidx
  ON public.subscription_usage_events (church_id, usage_key);

CREATE INDEX IF NOT EXISTS subscription_usage_events_subscription_period_idx
  ON public.subscription_usage_events (
    subscription_id,
    billing_period_start,
    billing_period_end
  );

CREATE INDEX IF NOT EXISTS subscription_usage_events_feature_idx
  ON public.subscription_usage_events (feature_id, occurred_at DESC);

-- ---------------------------------------------------------------------------
-- billing_customers (provider customer mapping; no secrets)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.billing_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  billing_provider text NOT NULL,
  provider_customer_id text NOT NULL,
  email text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_customers_provider_customer_unique
    UNIQUE (billing_provider, provider_customer_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS billing_customers_church_provider_uidx
  ON public.billing_customers (church_id, billing_provider);

-- ---------------------------------------------------------------------------
-- billing_events (webhook / provider event log; sanitized metadata only)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid REFERENCES public.churches (id) ON DELETE SET NULL,
  billing_provider text NOT NULL,
  provider_event_id text,
  event_type text NOT NULL,
  processed_at timestamptz,
  processing_status text NOT NULL DEFAULT 'received',
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_events_status_check
    CHECK (
      processing_status IN (
        'received',
        'processed',
        'ignored',
        'rejected',
        'failed'
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS billing_events_provider_event_uidx
  ON public.billing_events (billing_provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS billing_events_church_idx
  ON public.billing_events (church_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'set_updated_at'
  ) THEN
    DROP TRIGGER IF EXISTS subscription_plans_set_updated_at ON public.subscription_plans;
    CREATE TRIGGER subscription_plans_set_updated_at
      BEFORE UPDATE ON public.subscription_plans
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

    DROP TRIGGER IF EXISTS features_set_updated_at ON public.features;
    CREATE TRIGGER features_set_updated_at
      BEFORE UPDATE ON public.features
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

    DROP TRIGGER IF EXISTS plan_features_set_updated_at ON public.plan_features;
    CREATE TRIGGER plan_features_set_updated_at
      BEFORE UPDATE ON public.plan_features
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

    DROP TRIGGER IF EXISTS church_subscriptions_set_updated_at ON public.church_subscriptions;
    CREATE TRIGGER church_subscriptions_set_updated_at
      BEFORE UPDATE ON public.church_subscriptions
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

    DROP TRIGGER IF EXISTS subscription_usage_set_updated_at ON public.subscription_usage;
    CREATE TRIGGER subscription_usage_set_updated_at
      BEFORE UPDATE ON public.subscription_usage
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

    DROP TRIGGER IF EXISTS billing_customers_set_updated_at ON public.billing_customers;
    CREATE TRIGGER billing_customers_set_updated_at
      BEFORE UPDATE ON public.billing_customers
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Billing permission helper (owners / co-owners)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_manage_church_billing(requested_church_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.church_memberships m
    WHERE m.user_id = auth.uid()
      AND m.church_id = requested_church_id
      AND m.status = 'active'::public.membership_status
      AND m.role IN (
        'owner'::public.membership_role,
        'co_owner'::public.membership_role
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_manage_church_billing(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_church_billing(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Catalog tables: readable by authenticated members; not writable by clients.
-- Church-scoped tables: church isolation; writes via service role / trusted RPCs.
-- ---------------------------------------------------------------------------

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.church_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_change_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

-- subscription_plans
DROP POLICY IF EXISTS "Subscription plans readable by authenticated"
  ON public.subscription_plans;
CREATE POLICY "Subscription plans readable by authenticated"
  ON public.subscription_plans
  FOR SELECT
  TO authenticated
  USING (
    status IN (
      'active'::public.subscription_plan_status,
      'inactive'::public.subscription_plan_status,
      'archived'::public.subscription_plan_status
    )
  );

-- features
DROP POLICY IF EXISTS "Features readable by authenticated"
  ON public.features;
CREATE POLICY "Features readable by authenticated"
  ON public.features
  FOR SELECT
  TO authenticated
  USING (
    status IN (
      'active'::public.feature_definition_status,
      'inactive'::public.feature_definition_status
    )
  );

-- plan_features
DROP POLICY IF EXISTS "Plan features readable by authenticated"
  ON public.plan_features;
CREATE POLICY "Plan features readable by authenticated"
  ON public.plan_features
  FOR SELECT
  TO authenticated
  USING (true);

-- church_subscriptions
DROP POLICY IF EXISTS "Church subscriptions viewable by church members"
  ON public.church_subscriptions;
CREATE POLICY "Church subscriptions viewable by church members"
  ON public.church_subscriptions
  FOR SELECT
  TO authenticated
  USING (
    public.is_active_church_member(church_id)
    OR public.is_church_owner(church_id)
  );

-- subscription_change_history
DROP POLICY IF EXISTS "Subscription history viewable by billing managers"
  ON public.subscription_change_history;
CREATE POLICY "Subscription history viewable by billing managers"
  ON public.subscription_change_history
  FOR SELECT
  TO authenticated
  USING (public.can_manage_church_billing(church_id));

-- subscription_usage
DROP POLICY IF EXISTS "Subscription usage viewable by church members"
  ON public.subscription_usage;
CREATE POLICY "Subscription usage viewable by church members"
  ON public.subscription_usage
  FOR SELECT
  TO authenticated
  USING (
    public.is_active_church_member(church_id)
    OR public.is_church_owner(church_id)
  );

-- subscription_usage_events
DROP POLICY IF EXISTS "Subscription usage events viewable by billing managers"
  ON public.subscription_usage_events;
CREATE POLICY "Subscription usage events viewable by billing managers"
  ON public.subscription_usage_events
  FOR SELECT
  TO authenticated
  USING (public.can_manage_church_billing(church_id));

-- billing_customers
DROP POLICY IF EXISTS "Billing customers viewable by billing managers"
  ON public.billing_customers;
CREATE POLICY "Billing customers viewable by billing managers"
  ON public.billing_customers
  FOR SELECT
  TO authenticated
  USING (public.can_manage_church_billing(church_id));

-- billing_events
DROP POLICY IF EXISTS "Billing events viewable by billing managers"
  ON public.billing_events;
CREATE POLICY "Billing events viewable by billing managers"
  ON public.billing_events
  FOR SELECT
  TO authenticated
  USING (
    church_id IS NOT NULL
    AND public.can_manage_church_billing(church_id)
  );

-- ---------------------------------------------------------------------------
-- Grants (SELECT for authenticated; writes reserved for service_role)
-- ---------------------------------------------------------------------------

GRANT SELECT ON public.subscription_plans TO authenticated;
GRANT SELECT ON public.features TO authenticated;
GRANT SELECT ON public.plan_features TO authenticated;
GRANT SELECT ON public.church_subscriptions TO authenticated;
GRANT SELECT ON public.subscription_change_history TO authenticated;
GRANT SELECT ON public.subscription_usage TO authenticated;
GRANT SELECT ON public.subscription_usage_events TO authenticated;
GRANT SELECT ON public.billing_customers TO authenticated;
GRANT SELECT ON public.billing_events TO authenticated;

GRANT ALL ON public.subscription_plans TO service_role;
GRANT ALL ON public.features TO service_role;
GRANT ALL ON public.plan_features TO service_role;
GRANT ALL ON public.church_subscriptions TO service_role;
GRANT ALL ON public.subscription_change_history TO service_role;
GRANT ALL ON public.subscription_usage TO service_role;
GRANT ALL ON public.subscription_usage_events TO service_role;
GRANT ALL ON public.billing_customers TO service_role;
GRANT ALL ON public.billing_events TO service_role;

REVOKE INSERT, UPDATE, DELETE ON public.subscription_plans FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.features FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.plan_features FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.church_subscriptions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.subscription_change_history FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.subscription_usage FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.subscription_usage_events FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.billing_customers FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.billing_events FROM authenticated;

-- ---------------------------------------------------------------------------
-- Seed: plans (prices intentionally NULL until approved)
-- Provider price IDs left null; map later via env / admin update.
-- ---------------------------------------------------------------------------

INSERT INTO public.subscription_plans (
  plan_key,
  display_name,
  description,
  status,
  billing_interval,
  sort_order,
  is_public,
  is_default,
  is_custom,
  monthly_price_cents,
  currency
)
VALUES
  (
    'servant_standard',
    'Servant Standard',
    'Core incident logging, group email, and team scheduling for small teams.',
    'active',
    'month',
    10,
    true,
    true,
    false,
    NULL,
    'USD'
  ),
  (
    'steward_pro',
    'Steward Pro',
    'Adds medical and hardware inventory, incident photos, and SMS messaging.',
    'active',
    'month',
    20,
    true,
    false,
    false,
    NULL,
    'USD'
  ),
  (
    'shepherd_plus',
    'Shepherd Plus',
    'Adds policies, advanced analytics, multi-campus, and higher SMS allowance.',
    'active',
    'month',
    30,
    true,
    false,
    false,
    NULL,
    'USD'
  ),
  (
    'omni_enterprise',
    'Omni Enterprise',
    'Full platform including camera and sensor integrations.',
    'active',
    'month',
    40,
    true,
    false,
    false,
    NULL,
    'USD'
  )
ON CONFLICT (plan_key) DO NOTHING;

-- Ensure exactly one default if seed raced; prefer servant_standard.
UPDATE public.subscription_plans
SET is_default = (plan_key = 'servant_standard')
WHERE plan_key IN (
  'servant_standard',
  'steward_pro',
  'shepherd_plus',
  'omni_enterprise'
)
AND NOT EXISTS (
  SELECT 1 FROM public.subscription_plans WHERE is_default = true
);

-- ---------------------------------------------------------------------------
-- Seed: features
-- ---------------------------------------------------------------------------

INSERT INTO public.features (
  feature_key,
  display_name,
  description,
  category,
  value_type,
  default_boolean_value,
  default_numeric_value,
  unit,
  is_customer_visible,
  marketing_title,
  comparison_group,
  comparison_order
)
VALUES
  ('users.active.limit', 'Active user limit', 'Maximum active church memberships that count toward plan seats. Pending invitations do not count until accepted.', 'membership', 'integer', NULL, 10, 'users', true, 'Active users', 'membership', 10),

  ('incidents.logging.enabled', 'Incident logging', 'Create and manage security incidents.', 'incidents', 'boolean', true, NULL, NULL, true, 'Incident logging', 'incidents', 10),
  ('incidents.photos.enabled', 'Incident photos', 'Upload photos on incidents.', 'incidents', 'boolean', false, NULL, NULL, true, 'Incident photos', 'incidents', 20),
  ('incidents.photos.max_count_per_incident', 'Photos per incident', 'Maximum photos allowed on a single incident.', 'incidents', 'integer', NULL, 0, 'photos', true, 'Photos per incident', 'incidents', 30),
  ('incidents.photos.max_size_mb', 'Photo size limit', 'Maximum size of each incident photo in megabytes.', 'incidents', 'integer', NULL, 0, 'MB', true, 'Photo size', 'incidents', 40),

  ('messaging.group_email.enabled', 'Group email messaging', 'Send email through notification groups.', 'notifications', 'boolean', true, NULL, NULL, true, 'Group email', 'messaging', 10),
  ('messaging.email.enabled', 'Email messaging', 'Email delivery channel.', 'notifications', 'boolean', true, NULL, NULL, true, 'Email', 'messaging', 20),
  ('messaging.sms.enabled', 'SMS messaging', 'SMS delivery channel (provider required).', 'notifications', 'boolean', false, NULL, NULL, true, 'SMS', 'messaging', 30),
  ('messaging.sms.monthly_segment_limit', 'SMS monthly segments', 'Provider-billable SMS segments per subscription billing period.', 'notifications', 'integer', NULL, 0, 'segments', true, 'SMS segments / period', 'messaging', 40),

  ('scheduling.team.enabled', 'Team scheduling', 'Calendar, shifts, and assignments.', 'scheduling', 'boolean', true, NULL, NULL, true, 'Team scheduling', 'scheduling', 10),

  ('medical.inventory.enabled', 'Medical inventory', 'Manage medical supplies stock.', 'medical', 'boolean', false, NULL, NULL, true, 'Medical inventory', 'medical', 10),
  ('medical.incident_usage.enabled', 'Medical incident usage', 'Record medical supplies used on incidents.', 'medical', 'boolean', false, NULL, NULL, true, 'Medical use on incidents', 'medical', 20),

  ('hardware.inventory.enabled', 'Hardware inventory', 'Manage security equipment inventory.', 'hardware', 'boolean', false, NULL, NULL, true, 'Hardware inventory', 'hardware', 10),
  ('hardware.photos.enabled', 'Hardware photos', 'Upload photos on hardware equipment.', 'hardware', 'boolean', false, NULL, NULL, true, 'Hardware photos', 'hardware', 20),

  ('policies.enabled', 'Policies and procedures', 'Policy documents, acknowledgments, and workflows.', 'policies', 'boolean', false, NULL, NULL, true, 'Policies & procedures', 'policies', 10),

  ('analytics.standard.enabled', 'Standard analytics', 'Basic operational dashboard metrics.', 'analytics', 'boolean', true, NULL, NULL, true, 'Standard analytics', 'analytics', 10),
  ('analytics.advanced.enabled', 'Advanced analytics', 'Trends, comparisons, and extended reporting.', 'analytics', 'boolean', false, NULL, NULL, true, 'Advanced analytics', 'analytics', 20),

  ('campuses.multiple.enabled', 'Multi-campus', 'Create and manage more than one campus.', 'campuses', 'boolean', false, NULL, NULL, true, 'Multi-campus', 'campuses', 10),
  ('campuses.maximum_count', 'Campus maximum', 'Maximum active campuses. NULL means unlimited when multi-campus is enabled.', 'campuses', 'integer', NULL, 1, 'campuses', true, 'Campus limit', 'campuses', 20),

  ('cameras.enabled', 'Cameras', 'Camera access and integrations.', 'cameras', 'boolean', false, NULL, NULL, true, 'Cameras', 'integrations', 10),
  ('sensors.enabled', 'Sensors', 'Sensor integrations.', 'sensors', 'boolean', false, NULL, NULL, true, 'Sensors', 'integrations', 20),
  ('sensor_alarms.enabled', 'Sensor alarms', 'Sensor alarm event handling.', 'sensors', 'boolean', false, NULL, NULL, true, 'Sensor alarms', 'integrations', 30)
ON CONFLICT (feature_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Seed helpers: assign plan feature values without overwriting existing rows
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.seed_plan_feature_boolean(
  p_plan_key text,
  p_feature_key text,
  p_value boolean,
  p_inherited boolean DEFAULT false,
  p_source_plan_key text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id uuid;
  v_feature_id uuid;
  v_source_plan_id uuid;
BEGIN
  SELECT id INTO v_plan_id FROM public.subscription_plans WHERE plan_key = p_plan_key;
  SELECT id INTO v_feature_id FROM public.features WHERE feature_key = p_feature_key;
  IF v_plan_id IS NULL OR v_feature_id IS NULL THEN
    RAISE EXCEPTION 'Missing plan % or feature %', p_plan_key, p_feature_key;
  END IF;
  IF p_source_plan_key IS NOT NULL THEN
    SELECT id INTO v_source_plan_id FROM public.subscription_plans WHERE plan_key = p_source_plan_key;
  END IF;

  INSERT INTO public.plan_features (
    plan_id, feature_id, boolean_value, is_inherited, source_plan_id
  )
  VALUES (v_plan_id, v_feature_id, p_value, p_inherited, v_source_plan_id)
  ON CONFLICT (plan_id, feature_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_plan_feature_integer(
  p_plan_key text,
  p_feature_key text,
  p_value integer,
  p_inherited boolean DEFAULT false,
  p_source_plan_key text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id uuid;
  v_feature_id uuid;
  v_source_plan_id uuid;
BEGIN
  SELECT id INTO v_plan_id FROM public.subscription_plans WHERE plan_key = p_plan_key;
  SELECT id INTO v_feature_id FROM public.features WHERE feature_key = p_feature_key;
  IF v_plan_id IS NULL OR v_feature_id IS NULL THEN
    RAISE EXCEPTION 'Missing plan % or feature %', p_plan_key, p_feature_key;
  END IF;
  IF p_source_plan_key IS NOT NULL THEN
    SELECT id INTO v_source_plan_id FROM public.subscription_plans WHERE plan_key = p_source_plan_key;
  END IF;

  INSERT INTO public.plan_features (
    plan_id, feature_id, integer_value, is_inherited, source_plan_id
  )
  VALUES (v_plan_id, v_feature_id, p_value, p_inherited, v_source_plan_id)
  ON CONFLICT (plan_id, feature_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_plan_feature_boolean(text, text, boolean, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seed_plan_feature_integer(text, text, integer, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_plan_feature_boolean(text, text, boolean, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_plan_feature_integer(text, text, integer, boolean, text) TO service_role;

-- Servant Standard
SELECT public.seed_plan_feature_integer('servant_standard', 'users.active.limit', 10, false, NULL);
SELECT public.seed_plan_feature_boolean('servant_standard', 'incidents.logging.enabled', true, false, NULL);
SELECT public.seed_plan_feature_boolean('servant_standard', 'incidents.photos.enabled', false, false, NULL);
SELECT public.seed_plan_feature_integer('servant_standard', 'incidents.photos.max_count_per_incident', 0, false, NULL);
SELECT public.seed_plan_feature_integer('servant_standard', 'incidents.photos.max_size_mb', 0, false, NULL);
SELECT public.seed_plan_feature_boolean('servant_standard', 'messaging.group_email.enabled', true, false, NULL);
SELECT public.seed_plan_feature_boolean('servant_standard', 'messaging.email.enabled', true, false, NULL);
SELECT public.seed_plan_feature_boolean('servant_standard', 'messaging.sms.enabled', false, false, NULL);
SELECT public.seed_plan_feature_integer('servant_standard', 'messaging.sms.monthly_segment_limit', 0, false, NULL);
SELECT public.seed_plan_feature_boolean('servant_standard', 'scheduling.team.enabled', true, false, NULL);
SELECT public.seed_plan_feature_boolean('servant_standard', 'medical.inventory.enabled', false, false, NULL);
SELECT public.seed_plan_feature_boolean('servant_standard', 'medical.incident_usage.enabled', false, false, NULL);
SELECT public.seed_plan_feature_boolean('servant_standard', 'hardware.inventory.enabled', false, false, NULL);
SELECT public.seed_plan_feature_boolean('servant_standard', 'hardware.photos.enabled', false, false, NULL);
SELECT public.seed_plan_feature_boolean('servant_standard', 'policies.enabled', false, false, NULL);
SELECT public.seed_plan_feature_boolean('servant_standard', 'analytics.standard.enabled', true, false, NULL);
SELECT public.seed_plan_feature_boolean('servant_standard', 'analytics.advanced.enabled', false, false, NULL);
SELECT public.seed_plan_feature_boolean('servant_standard', 'campuses.multiple.enabled', false, false, NULL);
SELECT public.seed_plan_feature_integer('servant_standard', 'campuses.maximum_count', 1, false, NULL);
SELECT public.seed_plan_feature_boolean('servant_standard', 'cameras.enabled', false, false, NULL);
SELECT public.seed_plan_feature_boolean('servant_standard', 'sensors.enabled', false, false, NULL);
SELECT public.seed_plan_feature_boolean('servant_standard', 'sensor_alarms.enabled', false, false, NULL);

-- Steward Pro (effective values stored; is_inherited marks admin convenience only)
SELECT public.seed_plan_feature_integer('steward_pro', 'users.active.limit', 35, false, NULL);
SELECT public.seed_plan_feature_boolean('steward_pro', 'incidents.logging.enabled', true, true, 'servant_standard');
SELECT public.seed_plan_feature_boolean('steward_pro', 'incidents.photos.enabled', true, false, NULL);
SELECT public.seed_plan_feature_integer('steward_pro', 'incidents.photos.max_count_per_incident', 2, false, NULL);
SELECT public.seed_plan_feature_integer('steward_pro', 'incidents.photos.max_size_mb', 10, false, NULL);
SELECT public.seed_plan_feature_boolean('steward_pro', 'messaging.group_email.enabled', true, true, 'servant_standard');
SELECT public.seed_plan_feature_boolean('steward_pro', 'messaging.email.enabled', true, true, 'servant_standard');
SELECT public.seed_plan_feature_boolean('steward_pro', 'messaging.sms.enabled', true, false, NULL);
SELECT public.seed_plan_feature_integer('steward_pro', 'messaging.sms.monthly_segment_limit', 250, false, NULL);
SELECT public.seed_plan_feature_boolean('steward_pro', 'scheduling.team.enabled', true, true, 'servant_standard');
SELECT public.seed_plan_feature_boolean('steward_pro', 'medical.inventory.enabled', true, false, NULL);
SELECT public.seed_plan_feature_boolean('steward_pro', 'medical.incident_usage.enabled', true, false, NULL);
SELECT public.seed_plan_feature_boolean('steward_pro', 'hardware.inventory.enabled', true, false, NULL);
SELECT public.seed_plan_feature_boolean('steward_pro', 'hardware.photos.enabled', false, false, NULL);
SELECT public.seed_plan_feature_boolean('steward_pro', 'policies.enabled', false, false, NULL);
SELECT public.seed_plan_feature_boolean('steward_pro', 'analytics.standard.enabled', true, true, 'servant_standard');
SELECT public.seed_plan_feature_boolean('steward_pro', 'analytics.advanced.enabled', false, false, NULL);
SELECT public.seed_plan_feature_boolean('steward_pro', 'campuses.multiple.enabled', false, false, NULL);
SELECT public.seed_plan_feature_integer('steward_pro', 'campuses.maximum_count', 1, false, NULL);
SELECT public.seed_plan_feature_boolean('steward_pro', 'cameras.enabled', false, false, NULL);
SELECT public.seed_plan_feature_boolean('steward_pro', 'sensors.enabled', false, false, NULL);
SELECT public.seed_plan_feature_boolean('steward_pro', 'sensor_alarms.enabled', false, false, NULL);

-- Shepherd Plus
SELECT public.seed_plan_feature_integer('shepherd_plus', 'users.active.limit', 35, true, 'steward_pro');
SELECT public.seed_plan_feature_boolean('shepherd_plus', 'incidents.logging.enabled', true, true, 'steward_pro');
SELECT public.seed_plan_feature_boolean('shepherd_plus', 'incidents.photos.enabled', true, true, 'steward_pro');
SELECT public.seed_plan_feature_integer('shepherd_plus', 'incidents.photos.max_count_per_incident', 2, true, 'steward_pro');
SELECT public.seed_plan_feature_integer('shepherd_plus', 'incidents.photos.max_size_mb', 10, true, 'steward_pro');
SELECT public.seed_plan_feature_boolean('shepherd_plus', 'messaging.group_email.enabled', true, true, 'steward_pro');
SELECT public.seed_plan_feature_boolean('shepherd_plus', 'messaging.email.enabled', true, true, 'steward_pro');
SELECT public.seed_plan_feature_boolean('shepherd_plus', 'messaging.sms.enabled', true, true, 'steward_pro');
SELECT public.seed_plan_feature_integer('shepherd_plus', 'messaging.sms.monthly_segment_limit', 1000, false, NULL);
SELECT public.seed_plan_feature_boolean('shepherd_plus', 'scheduling.team.enabled', true, true, 'steward_pro');
SELECT public.seed_plan_feature_boolean('shepherd_plus', 'medical.inventory.enabled', true, true, 'steward_pro');
SELECT public.seed_plan_feature_boolean('shepherd_plus', 'medical.incident_usage.enabled', true, true, 'steward_pro');
SELECT public.seed_plan_feature_boolean('shepherd_plus', 'hardware.inventory.enabled', true, true, 'steward_pro');
SELECT public.seed_plan_feature_boolean('shepherd_plus', 'hardware.photos.enabled', false, true, 'steward_pro');
SELECT public.seed_plan_feature_boolean('shepherd_plus', 'policies.enabled', true, false, NULL);
SELECT public.seed_plan_feature_boolean('shepherd_plus', 'analytics.standard.enabled', true, true, 'steward_pro');
SELECT public.seed_plan_feature_boolean('shepherd_plus', 'analytics.advanced.enabled', true, false, NULL);
SELECT public.seed_plan_feature_boolean('shepherd_plus', 'campuses.multiple.enabled', true, false, NULL);
-- campuses.maximum_count NULL = unlimited while multi-campus is enabled
INSERT INTO public.plan_features (plan_id, feature_id, integer_value, is_inherited, source_plan_id)
SELECT p.id, f.id, NULL, false, NULL
FROM public.subscription_plans p
CROSS JOIN public.features f
WHERE p.plan_key = 'shepherd_plus'
  AND f.feature_key = 'campuses.maximum_count'
ON CONFLICT (plan_id, feature_id) DO NOTHING;
SELECT public.seed_plan_feature_boolean('shepherd_plus', 'cameras.enabled', false, false, NULL);
SELECT public.seed_plan_feature_boolean('shepherd_plus', 'sensors.enabled', false, false, NULL);
SELECT public.seed_plan_feature_boolean('shepherd_plus', 'sensor_alarms.enabled', false, false, NULL);

-- Omni Enterprise
SELECT public.seed_plan_feature_integer('omni_enterprise', 'users.active.limit', 35, true, 'shepherd_plus');
SELECT public.seed_plan_feature_boolean('omni_enterprise', 'incidents.logging.enabled', true, true, 'shepherd_plus');
SELECT public.seed_plan_feature_boolean('omni_enterprise', 'incidents.photos.enabled', true, true, 'shepherd_plus');
SELECT public.seed_plan_feature_integer('omni_enterprise', 'incidents.photos.max_count_per_incident', 2, true, 'shepherd_plus');
SELECT public.seed_plan_feature_integer('omni_enterprise', 'incidents.photos.max_size_mb', 10, true, 'shepherd_plus');
SELECT public.seed_plan_feature_boolean('omni_enterprise', 'messaging.group_email.enabled', true, true, 'shepherd_plus');
SELECT public.seed_plan_feature_boolean('omni_enterprise', 'messaging.email.enabled', true, true, 'shepherd_plus');
SELECT public.seed_plan_feature_boolean('omni_enterprise', 'messaging.sms.enabled', true, true, 'shepherd_plus');
SELECT public.seed_plan_feature_integer('omni_enterprise', 'messaging.sms.monthly_segment_limit', 1000, true, 'shepherd_plus');
SELECT public.seed_plan_feature_boolean('omni_enterprise', 'scheduling.team.enabled', true, true, 'shepherd_plus');
SELECT public.seed_plan_feature_boolean('omni_enterprise', 'medical.inventory.enabled', true, true, 'shepherd_plus');
SELECT public.seed_plan_feature_boolean('omni_enterprise', 'medical.incident_usage.enabled', true, true, 'shepherd_plus');
SELECT public.seed_plan_feature_boolean('omni_enterprise', 'hardware.inventory.enabled', true, true, 'shepherd_plus');
SELECT public.seed_plan_feature_boolean('omni_enterprise', 'hardware.photos.enabled', false, true, 'shepherd_plus');
SELECT public.seed_plan_feature_boolean('omni_enterprise', 'policies.enabled', true, true, 'shepherd_plus');
SELECT public.seed_plan_feature_boolean('omni_enterprise', 'analytics.standard.enabled', true, true, 'shepherd_plus');
SELECT public.seed_plan_feature_boolean('omni_enterprise', 'analytics.advanced.enabled', true, true, 'shepherd_plus');
SELECT public.seed_plan_feature_boolean('omni_enterprise', 'campuses.multiple.enabled', true, true, 'shepherd_plus');
INSERT INTO public.plan_features (plan_id, feature_id, integer_value, is_inherited, source_plan_id)
SELECT p.id, f.id, NULL, true, sp.id
FROM public.subscription_plans p
CROSS JOIN public.features f
JOIN public.subscription_plans sp ON sp.plan_key = 'shepherd_plus'
WHERE p.plan_key = 'omni_enterprise'
  AND f.feature_key = 'campuses.maximum_count'
ON CONFLICT (plan_id, feature_id) DO NOTHING;
SELECT public.seed_plan_feature_boolean('omni_enterprise', 'cameras.enabled', true, false, NULL);
SELECT public.seed_plan_feature_boolean('omni_enterprise', 'sensors.enabled', true, false, NULL);
SELECT public.seed_plan_feature_boolean('omni_enterprise', 'sensor_alarms.enabled', true, false, NULL);

-- ---------------------------------------------------------------------------
-- Phase 4 helper (not auto-run): assign default plan to a church
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assign_default_church_subscription(
  p_church_id uuid,
  p_status public.church_subscription_status DEFAULT 'trialing',
  p_period_days integer DEFAULT 30
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id uuid;
  v_subscription_id uuid;
  v_start timestamptz := now();
  v_end timestamptz;
BEGIN
  IF p_period_days IS NULL OR p_period_days < 1 THEN
    RAISE EXCEPTION 'period days must be >= 1';
  END IF;
  v_end := v_start + make_interval(days => p_period_days);

  SELECT id INTO v_plan_id
  FROM public.subscription_plans
  WHERE is_default = true AND status = 'active'::public.subscription_plan_status
  ORDER BY sort_order
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    SELECT id INTO v_plan_id
    FROM public.subscription_plans
    WHERE plan_key = 'servant_standard'
    LIMIT 1;
  END IF;

  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'Default subscription plan is not configured';
  END IF;

  -- Skip if church already has a current subscription.
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
    LIMIT 1;
    RETURN v_subscription_id;
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
    'Default subscription assignment',
    jsonb_build_object('source', 'assign_default_church_subscription')
  );

  RETURN v_subscription_id;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_default_church_subscription(uuid, public.church_subscription_status, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_default_church_subscription(uuid, public.church_subscription_status, integer) TO service_role;

COMMENT ON FUNCTION public.assign_default_church_subscription(uuid, public.church_subscription_status, integer) IS
  'Phase 4 helper: assigns Servant Standard (default plan) to a church if no current subscription exists. Not invoked automatically by this migration.';

-- ---------------------------------------------------------------------------
-- Notes for operators
-- ---------------------------------------------------------------------------
-- 1. Apply this migration in Supabase SQL Editor after review.
-- 2. Price IDs / monthly_price_cents remain NULL until business approval.
-- 3. Do not run mass church assignment until Phase 4 reviews existing feature use.
-- 4. Application entitlement resolver (Phase 3) reads plan_features effective rows.
-- 5. Client users cannot INSERT/UPDATE subscription or usage rows (service_role only).
