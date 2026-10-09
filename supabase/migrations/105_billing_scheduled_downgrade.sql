-- =============================================================================
-- 105_billing_scheduled_downgrade.sql
-- Mirror a Stripe Subscription Schedule on the organization subscription.
-- These columns do not change plan_id, entitlements, or organization status.
-- Do not apply until reviewed.
-- =============================================================================

ALTER TABLE public.organization_subscriptions
  ADD COLUMN IF NOT EXISTS provider_schedule_id text,
  ADD COLUMN IF NOT EXISTS scheduled_plan_id uuid,
  ADD COLUMN IF NOT EXISTS scheduled_effective_at timestamptz,
  ADD COLUMN IF NOT EXISTS schedule_status text,
  ADD COLUMN IF NOT EXISTS schedule_requested_by uuid,
  ADD COLUMN IF NOT EXISTS schedule_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS schedule_released_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organization_subscriptions_scheduled_plan_id_fkey'
  ) THEN
    ALTER TABLE public.organization_subscriptions
      ADD CONSTRAINT organization_subscriptions_scheduled_plan_id_fkey
      FOREIGN KEY (scheduled_plan_id)
      REFERENCES public.subscription_plans (id)
      ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organization_subscriptions_schedule_requested_by_fkey'
  ) THEN
    ALTER TABLE public.organization_subscriptions
      ADD CONSTRAINT organization_subscriptions_schedule_requested_by_fkey
      FOREIGN KEY (schedule_requested_by)
      REFERENCES auth.users (id)
      ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.organization_subscriptions
  DROP CONSTRAINT IF EXISTS organization_subscriptions_schedule_status_check;

ALTER TABLE public.organization_subscriptions
  ADD CONSTRAINT organization_subscriptions_schedule_status_check
  CHECK (
    schedule_status IS NULL
    OR schedule_status IN (
      'scheduled',
      'released',
      'canceled',
      'completed',
      'aborted'
    )
  );

ALTER TABLE public.organization_subscriptions
  DROP CONSTRAINT IF EXISTS organization_subscriptions_scheduled_downgrade_complete_check;

ALTER TABLE public.organization_subscriptions
  ADD CONSTRAINT organization_subscriptions_scheduled_downgrade_complete_check
  CHECK (
    schedule_status IS DISTINCT FROM 'scheduled'
    OR (
      provider_schedule_id IS NOT NULL
      AND scheduled_plan_id IS NOT NULL
      AND scheduled_effective_at IS NOT NULL
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS organization_subscriptions_one_scheduled_downgrade_uidx
  ON public.organization_subscriptions (organization_id)
  WHERE schedule_status = 'scheduled';

CREATE UNIQUE INDEX IF NOT EXISTS organization_subscriptions_provider_schedule_id_uidx
  ON public.organization_subscriptions (provider_schedule_id)
  WHERE provider_schedule_id IS NOT NULL;
