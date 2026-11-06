-- =============================================================================
-- 118_organization_checkout_approvals.sql
-- Stage 3D: Organization-scoped Live Checkout pilot allowlist.
-- Additive. Default-deny. No rows seeded. No Checkout gate changes.
--
-- Live subscription Checkout requires BOTH:
--   1) STRIPE_LIVE_CHECKOUT_ENABLED === "true"
--   2) An active, unexpired approval row for the organization
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.organization_checkout_approvals (
  organization_id uuid PRIMARY KEY
    REFERENCES public.organizations (id) ON DELETE CASCADE,
  status text NOT NULL
    CHECK (status IN ('active', 'inactive', 'revoked')),
  approved_at timestamptz,
  approved_by_platform_account_id uuid
    REFERENCES public.platform_accounts (id) ON DELETE SET NULL,
  expires_at timestamptz,
  notes text
    CHECK (notes IS NULL OR char_length(notes) <= 2000),
  revoked_at timestamptz,
  revoked_by_platform_account_id uuid
    REFERENCES public.platform_accounts (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_checkout_approvals_active_requires_approved_at
    CHECK (status <> 'active' OR approved_at IS NOT NULL)
);

COMMENT ON TABLE public.organization_checkout_approvals IS
  'Platform-operated Live Checkout pilot allowlist. Missing row = deny. Org owners cannot write.';

CREATE INDEX IF NOT EXISTS organization_checkout_approvals_status_idx
  ON public.organization_checkout_approvals (status);

CREATE INDEX IF NOT EXISTS organization_checkout_approvals_expires_at_idx
  ON public.organization_checkout_approvals (expires_at)
  WHERE status = 'active' AND expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.organization_checkout_approval_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations (id) ON DELETE CASCADE,
  event_type text NOT NULL
    CHECK (event_type IN ('approved', 'revoked', 'updated', 'inactivated')),
  actor_platform_account_id uuid
    REFERENCES public.platform_accounts (id) ON DELETE SET NULL,
  reason text
    CHECK (reason IS NULL OR char_length(reason) <= 2000),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.organization_checkout_approval_events IS
  'Append-only history for Checkout pilot approval changes.';

CREATE INDEX IF NOT EXISTS organization_checkout_approval_events_org_created_idx
  ON public.organization_checkout_approval_events (organization_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS: default deny for JWT roles. App uses service-role after platform auth.
-- ---------------------------------------------------------------------------

ALTER TABLE public.organization_checkout_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_checkout_approvals FORCE ROW LEVEL SECURITY;

ALTER TABLE public.organization_checkout_approval_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_checkout_approval_events FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.organization_checkout_approvals FROM PUBLIC;
REVOKE ALL ON TABLE public.organization_checkout_approvals FROM anon;
REVOKE ALL ON TABLE public.organization_checkout_approvals FROM authenticated;

REVOKE ALL ON TABLE public.organization_checkout_approval_events FROM PUBLIC;
REVOKE ALL ON TABLE public.organization_checkout_approval_events FROM anon;
REVOKE ALL ON TABLE public.organization_checkout_approval_events FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organization_checkout_approvals
  TO service_role;
GRANT SELECT, INSERT ON TABLE public.organization_checkout_approval_events
  TO service_role;

-- No policies for anon/authenticated → PostgREST JWT access fails closed.
-- service_role bypasses RLS; FORCE still applies to table owner roles that
-- are not BYPASSRLS — service_role in Supabase bypasses RLS by design.

-- ---------------------------------------------------------------------------
-- Platform permissions (idempotent seeds)
-- ---------------------------------------------------------------------------

SELECT public.seed_platform_permission(
  'billing.checkout_pilot.read',
  'Read Checkout pilot approvals',
  'View which organizations are approved for Live Checkout pilot access.',
  'billing'
);

SELECT public.seed_platform_permission(
  'billing.checkout_pilot.manage',
  'Manage Checkout pilot approvals',
  'Approve or revoke organization Live Checkout pilot access with audit.',
  'billing'
);

SELECT public.seed_platform_role_permission('super_admin', 'billing.checkout_pilot.read');
SELECT public.seed_platform_role_permission('super_admin', 'billing.checkout_pilot.manage');
SELECT public.seed_platform_role_permission('billing_admin', 'billing.checkout_pilot.read');
SELECT public.seed_platform_role_permission('billing_admin', 'billing.checkout_pilot.manage');
SELECT public.seed_platform_role_permission('platform_admin', 'billing.checkout_pilot.read');
SELECT public.seed_platform_role_permission('auditor', 'billing.checkout_pilot.read');
