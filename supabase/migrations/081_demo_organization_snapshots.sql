-- =============================================================================
-- 081_demo_organization_snapshots.sql
-- Demo Organization Snapshot / Restore foundation (Phase 3).
-- Requires: 080_demo_environments_permission_category.sql
--
--   - organizations demo guardrail columns
--   - demo_protected_accounts
--   - demo_organization_snapshots
--   - demo_organization_restore_operations
--   - demo_organization_restore_locks
--   - platform permissions + role grants
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Demo guardrails on organizations
-- ---------------------------------------------------------------------------

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS is_demo_organization boolean NOT NULL DEFAULT false;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS demo_restore_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS demo_restore_locked boolean NOT NULL DEFAULT false;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS demo_maintenance_mode boolean NOT NULL DEFAULT false;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS demo_environment_label text;

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_demo_environment_label_len;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_demo_environment_label_len
  CHECK (
    demo_environment_label IS NULL
    OR char_length(demo_environment_label) BETWEEN 1 AND 80
  );

-- Restore only when explicitly demo + enabled + unlocked
ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_demo_restore_guard;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_demo_restore_guard
  CHECK (
    NOT demo_restore_enabled
    OR is_demo_organization = true
  );

COMMENT ON COLUMN public.organizations.is_demo_organization IS
  'Hard demo flag. Restore/snapshot only when true. Never infer from name.';
COMMENT ON COLUMN public.organizations.demo_restore_enabled IS
  'Platform must set true before snapshot/restore is allowed.';
COMMENT ON COLUMN public.organizations.demo_restore_locked IS
  'Blocks restore while true (manual lock or failed op).';
COMMENT ON COLUMN public.organizations.demo_maintenance_mode IS
  'Blocks normal church-user writes during restore.';

CREATE INDEX IF NOT EXISTS organizations_is_demo_idx
  ON public.organizations (id)
  WHERE is_demo_organization = true;

-- ---------------------------------------------------------------------------
-- 1. Protected demo login accounts (Auth users preserved)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.demo_protected_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  expected_membership_role text NOT NULL,
  is_required boolean NOT NULL DEFAULT true,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT demo_protected_accounts_role_len
    CHECK (char_length(expected_membership_role) BETWEEN 1 AND 64),
  CONSTRAINT demo_protected_accounts_org_user_uidx
    UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS demo_protected_accounts_org_idx
  ON public.demo_protected_accounts (organization_id);

ALTER TABLE public.demo_protected_accounts ENABLE ROW LEVEL SECURITY;
-- No authenticated policies: service_role / platform server only.
GRANT ALL ON public.demo_protected_accounts TO service_role;
REVOKE ALL ON public.demo_protected_accounts FROM PUBLIC;
REVOKE ALL ON public.demo_protected_accounts FROM authenticated;
REVOKE ALL ON public.demo_protected_accounts FROM anon;

-- ---------------------------------------------------------------------------
-- 2. Snapshots metadata
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.demo_organization_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  version_label text,
  tags text[] NOT NULL DEFAULT '{}',
  snapshot_status text NOT NULL DEFAULT 'creating',
  snapshot_format_version integer NOT NULL DEFAULT 1,
  database_schema_version text NOT NULL,
  subscription_plan_id uuid,
  subscription_plan_key_snapshot text,
  feature_entitlement_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  record_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  file_count integer NOT NULL DEFAULT 0,
  total_file_size_bytes bigint NOT NULL DEFAULT 0,
  snapshot_manifest_path text,
  snapshot_data_path text,
  checksum text,
  created_by_platform_account_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  validated_at timestamptz,
  last_restored_at timestamptz,
  is_default boolean NOT NULL DEFAULT false,
  is_protected boolean NOT NULL DEFAULT false,
  is_automatic boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  CONSTRAINT demo_organization_snapshots_status_check
    CHECK (
      snapshot_status IN (
        'creating',
        'validating',
        'ready',
        'failed',
        'invalid',
        'incompatible',
        'archived'
      )
    ),
  CONSTRAINT demo_organization_snapshots_name_len
    CHECK (char_length(name) BETWEEN 1 AND 160),
  CONSTRAINT demo_organization_snapshots_slug_format
    CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT demo_organization_snapshots_org_slug_uidx
    UNIQUE (organization_id, slug)
);

CREATE UNIQUE INDEX IF NOT EXISTS demo_organization_snapshots_one_default_uidx
  ON public.demo_organization_snapshots (organization_id)
  WHERE is_default = true AND archived_at IS NULL AND snapshot_status = 'ready';

CREATE INDEX IF NOT EXISTS demo_organization_snapshots_org_status_idx
  ON public.demo_organization_snapshots (organization_id, snapshot_status);

ALTER TABLE public.demo_organization_snapshots ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.demo_organization_snapshots TO service_role;
REVOKE ALL ON public.demo_organization_snapshots FROM PUBLIC;
REVOKE ALL ON public.demo_organization_snapshots FROM authenticated;
REVOKE ALL ON public.demo_organization_snapshots FROM anon;

-- ---------------------------------------------------------------------------
-- 3. Restore operations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.demo_organization_restore_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations (id) ON DELETE CASCADE,
  snapshot_id uuid NOT NULL
    REFERENCES public.demo_organization_snapshots (id) ON DELETE RESTRICT,
  pre_restore_snapshot_id uuid
    REFERENCES public.demo_organization_snapshots (id) ON DELETE SET NULL,
  operation_type text NOT NULL DEFAULT 'restore',
  status text NOT NULL DEFAULT 'pending',
  reason text NOT NULL,
  confirmation_text text NOT NULL,
  dry_run_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  records_deleted integer NOT NULL DEFAULT 0,
  records_inserted integer NOT NULL DEFAULT 0,
  records_preserved integer NOT NULL DEFAULT 0,
  files_deleted integer NOT NULL DEFAULT 0,
  files_restored integer NOT NULL DEFAULT 0,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  safe_error_summary text,
  started_by_platform_account_id uuid,
  started_at timestamptz,
  completed_at timestamptz,
  rolled_back_at timestamptz,
  rollback_snapshot_id uuid
    REFERENCES public.demo_organization_snapshots (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT demo_restore_ops_type_check
    CHECK (operation_type IN ('restore', 'rollback', 'emergency_unlock')),
  CONSTRAINT demo_restore_ops_status_check
    CHECK (
      status IN (
        'pending',
        'validating',
        'creating_safety_snapshot',
        'locking',
        'restoring_database',
        'restoring_files',
        'verifying',
        'completed',
        'failed',
        'rolling_back',
        'rolled_back',
        'cancelled'
      )
    ),
  CONSTRAINT demo_restore_ops_reason_len
    CHECK (char_length(reason) BETWEEN 3 AND 2000)
);

CREATE INDEX IF NOT EXISTS demo_restore_ops_org_created_idx
  ON public.demo_organization_restore_operations (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS demo_restore_ops_status_idx
  ON public.demo_organization_restore_operations (status)
  WHERE status NOT IN ('completed', 'failed', 'rolled_back', 'cancelled');

ALTER TABLE public.demo_organization_restore_operations ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.demo_organization_restore_operations TO service_role;
REVOKE ALL ON public.demo_organization_restore_operations FROM PUBLIC;
REVOKE ALL ON public.demo_organization_restore_operations FROM authenticated;
REVOKE ALL ON public.demo_organization_restore_operations FROM anon;

-- ---------------------------------------------------------------------------
-- 4. Restore locks
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.demo_organization_restore_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations (id) ON DELETE CASCADE,
  operation_id uuid
    REFERENCES public.demo_organization_restore_operations (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  locked_by_platform_account_id uuid,
  locked_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT demo_restore_locks_status_check
    CHECK (status IN ('active', 'released', 'expired', 'emergency_cleared'))
);

CREATE UNIQUE INDEX IF NOT EXISTS demo_restore_locks_one_active_uidx
  ON public.demo_organization_restore_locks (organization_id)
  WHERE status = 'active';

ALTER TABLE public.demo_organization_restore_locks ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.demo_organization_restore_locks TO service_role;
REVOKE ALL ON public.demo_organization_restore_locks FROM PUBLIC;
REVOKE ALL ON public.demo_organization_restore_locks FROM authenticated;
REVOKE ALL ON public.demo_organization_restore_locks FROM anon;

-- ---------------------------------------------------------------------------
-- 5. Server-side demo eligibility helper (never trust client)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_demo_restore_eligible(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organizations o
    WHERE o.id = p_organization_id
      AND o.is_demo_organization = true
      AND o.demo_restore_enabled = true
      AND o.demo_restore_locked = false
  );
$$;

REVOKE ALL ON FUNCTION public.is_demo_restore_eligible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_demo_restore_eligible(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Platform permissions (category enum value added in 080)
-- ---------------------------------------------------------------------------

SELECT public.seed_platform_permission(
  'demo_organizations.read',
  'View demo organizations',
  'List and view demo church environments',
  'demo_environments'::public.platform_permission_category
);
SELECT public.seed_platform_permission(
  'demo_organizations.manage',
  'Manage demo organizations',
  'Update demo flags, labels, and restore enablement',
  'demo_environments'::public.platform_permission_category
);
SELECT public.seed_platform_permission(
  'demo_snapshots.read',
  'View demo snapshots',
  'View snapshot metadata and history',
  'demo_environments'::public.platform_permission_category
);
SELECT public.seed_platform_permission(
  'demo_snapshots.create',
  'Create demo snapshots',
  'Create named demo organization snapshots',
  'demo_environments'::public.platform_permission_category
);
SELECT public.seed_platform_permission(
  'demo_snapshots.restore',
  'Restore demo snapshots',
  'Restore a demo organization from a snapshot',
  'demo_environments'::public.platform_permission_category
);
SELECT public.seed_platform_permission(
  'demo_snapshots.archive',
  'Archive demo snapshots',
  'Archive demo snapshots',
  'demo_environments'::public.platform_permission_category
);
SELECT public.seed_platform_permission(
  'demo_snapshots.delete',
  'Delete demo snapshots',
  'Delete non-protected demo snapshots',
  'demo_environments'::public.platform_permission_category
);
SELECT public.seed_platform_permission(
  'demo_snapshots.protect',
  'Protect demo snapshots',
  'Protect or unprotect demo snapshots',
  'demo_environments'::public.platform_permission_category
);
SELECT public.seed_platform_permission(
  'demo_snapshots.set_default',
  'Set default demo snapshot',
  'Mark a snapshot as the default reset version',
  'demo_environments'::public.platform_permission_category
);
SELECT public.seed_platform_permission(
  'demo_restores.rollback',
  'Rollback demo restores',
  'Roll back a demo restore using a safety snapshot',
  'demo_environments'::public.platform_permission_category
);
SELECT public.seed_platform_permission(
  'demo_restores.unlock',
  'Unlock demo restore locks',
  'Emergency clear of demo restore locks',
  'demo_environments'::public.platform_permission_category
);

-- Super admin: all demo_* keys
SELECT public.seed_platform_role_permission('super_admin', p.permission_key)
FROM public.platform_permissions p
WHERE p.permission_key LIKE 'demo_%';

-- Platform admin: read + create + restore (not delete/unlock by default)
SELECT public.seed_platform_role_permission('platform_admin', k)
FROM (
  VALUES
    ('demo_organizations.read'),
    ('demo_organizations.manage'),
    ('demo_snapshots.read'),
    ('demo_snapshots.create'),
    ('demo_snapshots.restore'),
    ('demo_snapshots.archive'),
    ('demo_snapshots.set_default')
) AS v(k);

-- Developer: read + create (restore requires explicit grant in production policy)
SELECT public.seed_platform_role_permission('developer', k)
FROM (
  VALUES
    ('demo_organizations.read'),
    ('demo_snapshots.read'),
    ('demo_snapshots.create')
) AS v(k);

-- Support / auditor: read-only
SELECT public.seed_platform_role_permission('support', 'demo_organizations.read');
SELECT public.seed_platform_role_permission('support', 'demo_snapshots.read');
SELECT public.seed_platform_role_permission('auditor', 'demo_organizations.read');
SELECT public.seed_platform_role_permission('auditor', 'demo_snapshots.read');

COMMIT;

-- =============================================================================
-- After apply:
-- 1. Run 080 then 081 (in order)
-- 2. Create private Storage bucket: demo-organization-snapshots
-- 3. Mark First Church (or use Platform → Demo Environments UI):
--      UPDATE organizations
--      SET is_demo_organization = true,
--          demo_restore_enabled = true,
--          demo_environment_label = 'production-demo'
--      WHERE seed_source = 'first-church-demo';
-- =============================================================================
