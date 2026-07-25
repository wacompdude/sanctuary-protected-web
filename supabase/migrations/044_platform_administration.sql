-- =============================================================================
-- 044_platform_administration.sql
-- Platform Super Administrator / Application Administration foundation.
-- Additive / non-destructive. Safe to re-run.
-- Review before applying to production Supabase.
--
-- Architecture (separate from church tenancy):
--   auth.users → platform_accounts → platform_account_roles → platform_roles
--                                      ↕
--                           platform_role_permissions
--                                      ↕
--                           platform_permissions
--
-- Also:
--   platform_account_invitations  (hashed tokens only; no passwords)
--   platform_access_sessions      (church-scoped support access)
--   platform_admin_actions        (append-only platform audit)
--   church_entitlement_overrides  (platform-only feature exceptions)
--
-- Critical rules:
--   - Email domain NEVER grants platform access
--   - Church owner / administrator NEVER implies platform access
--   - Platform access is NEVER stored as a church membership role
--   - No bootstrap passwords, API keys, or secrets in this migration
--   - Initial super admin is created by a server-only bootstrap script
--   - Prefer server-side service-role workflows after app permission checks
--   - Do NOT add broad "platform may read all tenant tables" RLS policies
--
-- Seed policy:
--   Roles, permissions, and role↔permission rows insert when missing
--   (ON CONFLICT DO NOTHING). Manual permission edits are not overwritten.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.platform_account_status AS ENUM (
    'invited',
    'active',
    'disabled',
    'locked',
    'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.platform_account_type AS ENUM (
    'internal',
    'developer',
    'support',
    'billing',
    'audit'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.platform_role_status AS ENUM (
    'active',
    'inactive',
    'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.platform_permission_status AS ENUM (
    'active',
    'inactive',
    'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.platform_permission_category AS ENUM (
    'console',
    'accounts',
    'churches',
    'subscriptions',
    'plans',
    'features',
    'billing',
    'users',
    'audit',
    'system',
    'developer'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.platform_invitation_status AS ENUM (
    'pending',
    'accepted',
    'expired',
    'revoked'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.platform_access_session_type AS ENUM (
    'read_only',
    'support',
    'administrative',
    'emergency'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.platform_access_session_status AS ENUM (
    'active',
    'ended',
    'expired',
    'revoked'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.platform_override_status AS ENUM (
    'pending',
    'active',
    'expired',
    'revoked'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Catalog: platform_permissions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.platform_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_key text NOT NULL,
  display_name text NOT NULL,
  description text,
  category public.platform_permission_category NOT NULL,
  status public.platform_permission_status NOT NULL DEFAULT 'active'::public.platform_permission_status,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_permissions_key_unique UNIQUE (permission_key),
  CONSTRAINT platform_permissions_key_format_check CHECK (
    permission_key ~ '^[a-z][a-z0-9_.]+$'
  ),
  CONSTRAINT platform_permissions_display_name_nonempty_check CHECK (
    length(trim(display_name)) > 0
  )
);

CREATE INDEX IF NOT EXISTS platform_permissions_category_idx
  ON public.platform_permissions (category);

CREATE INDEX IF NOT EXISTS platform_permissions_status_idx
  ON public.platform_permissions (status);

-- ---------------------------------------------------------------------------
-- Catalog: platform_roles
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.platform_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key text NOT NULL,
  display_name text NOT NULL,
  description text,
  status public.platform_role_status NOT NULL DEFAULT 'active'::public.platform_role_status,
  is_system_role boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT platform_roles_key_unique UNIQUE (role_key),
  CONSTRAINT platform_roles_key_format_check CHECK (
    role_key ~ '^[a-z][a-z0-9_]+$'
  ),
  CONSTRAINT platform_roles_display_name_nonempty_check CHECK (
    length(trim(display_name)) > 0
  )
);

CREATE INDEX IF NOT EXISTS platform_roles_status_idx
  ON public.platform_roles (status);

-- ---------------------------------------------------------------------------
-- platform_role_permissions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.platform_role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.platform_roles (id) ON DELETE RESTRICT,
  permission_id uuid NOT NULL REFERENCES public.platform_permissions (id) ON DELETE RESTRICT,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_role_permissions_unique UNIQUE (role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS platform_role_permissions_role_id_idx
  ON public.platform_role_permissions (role_id);

CREATE INDEX IF NOT EXISTS platform_role_permissions_permission_id_idx
  ON public.platform_role_permissions (permission_id);

-- ---------------------------------------------------------------------------
-- platform_accounts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.platform_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  email_snapshot text NOT NULL,
  display_name text,
  status public.platform_account_status NOT NULL DEFAULT 'invited'::public.platform_account_status,
  account_type public.platform_account_type NOT NULL DEFAULT 'internal'::public.platform_account_type,
  must_change_password boolean NOT NULL DEFAULT true,
  mfa_required boolean NOT NULL DEFAULT true,
  mfa_verified_at timestamptz,
  last_platform_login_at timestamptz,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz,
  disabled_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  disabled_reason text,
  CONSTRAINT platform_accounts_user_id_unique UNIQUE (user_id),
  CONSTRAINT platform_accounts_email_nonempty_check CHECK (
    length(trim(email_snapshot)) > 0
  ),
  CONSTRAINT platform_accounts_disabled_consistency_check CHECK (
    (status = 'disabled'::public.platform_account_status AND disabled_at IS NOT NULL)
    OR (status <> 'disabled'::public.platform_account_status)
  )
);

CREATE INDEX IF NOT EXISTS platform_accounts_status_idx
  ON public.platform_accounts (status);

CREATE INDEX IF NOT EXISTS platform_accounts_account_type_idx
  ON public.platform_accounts (account_type);

CREATE INDEX IF NOT EXISTS platform_accounts_email_lower_idx
  ON public.platform_accounts (lower(email_snapshot));

-- ---------------------------------------------------------------------------
-- platform_account_roles
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.platform_account_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_account_id uuid NOT NULL REFERENCES public.platform_accounts (id) ON DELETE RESTRICT,
  platform_role_id uuid NOT NULL REFERENCES public.platform_roles (id) ON DELETE RESTRICT,
  assigned_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  revocation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One active (non-revoked) assignment per account + role; history rows may repeat.
CREATE UNIQUE INDEX IF NOT EXISTS platform_account_roles_active_unique
  ON public.platform_account_roles (platform_account_id, platform_role_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS platform_account_roles_account_id_idx
  ON public.platform_account_roles (platform_account_id);

CREATE INDEX IF NOT EXISTS platform_account_roles_role_id_idx
  ON public.platform_account_roles (platform_role_id);

CREATE INDEX IF NOT EXISTS platform_account_roles_active_idx
  ON public.platform_account_roles (platform_account_id)
  WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- platform_account_invitations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.platform_account_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  display_name text,
  account_type public.platform_account_type NOT NULL DEFAULT 'developer'::public.platform_account_type,
  -- Comma-separated role_keys assigned on accept (validated in app). Prefer
  -- joining via invitation_roles later if needed; keep Phase 2 simple.
  role_keys text[] NOT NULL DEFAULT ARRAY['developer']::text[],
  token_hash text NOT NULL,
  status public.platform_invitation_status NOT NULL DEFAULT 'pending'::public.platform_invitation_status,
  expires_at timestamptz NOT NULL,
  invited_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  invited_by_platform_account_id uuid REFERENCES public.platform_accounts (id) ON DELETE SET NULL,
  invitation_note text,
  accepted_by_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_account_invitations_token_hash_unique UNIQUE (token_hash),
  CONSTRAINT platform_account_invitations_email_nonempty_check CHECK (
    length(trim(email)) > 0
  ),
  CONSTRAINT platform_account_invitations_terminal_state_check CHECK (
    NOT (accepted_at IS NOT NULL AND revoked_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_account_invitations_pending_email_idx
  ON public.platform_account_invitations (lower(email))
  WHERE status = 'pending'::public.platform_invitation_status;

CREATE INDEX IF NOT EXISTS platform_account_invitations_expires_at_idx
  ON public.platform_account_invitations (expires_at);

CREATE INDEX IF NOT EXISTS platform_account_invitations_status_idx
  ON public.platform_account_invitations (status);

-- ---------------------------------------------------------------------------
-- platform_access_sessions (church-scoped support access)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.platform_access_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_account_id uuid NOT NULL REFERENCES public.platform_accounts (id) ON DELETE RESTRICT,
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  access_type public.platform_access_session_type NOT NULL DEFAULT 'read_only'::public.platform_access_session_type,
  reason text NOT NULL,
  ticket_reference text,
  status public.platform_access_session_status NOT NULL DEFAULT 'active'::public.platform_access_session_status,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  ended_at timestamptz,
  ended_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_access_sessions_reason_nonempty_check CHECK (
    length(trim(reason)) >= 8
  ),
  CONSTRAINT platform_access_sessions_expiry_check CHECK (
    expires_at > started_at
  )
);

CREATE INDEX IF NOT EXISTS platform_access_sessions_account_id_idx
  ON public.platform_access_sessions (platform_account_id);

CREATE INDEX IF NOT EXISTS platform_access_sessions_church_id_idx
  ON public.platform_access_sessions (church_id);

CREATE INDEX IF NOT EXISTS platform_access_sessions_active_idx
  ON public.platform_access_sessions (platform_account_id, church_id)
  WHERE status = 'active'::public.platform_access_session_status;

-- ---------------------------------------------------------------------------
-- platform_admin_actions (append-only platform audit ledger)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.platform_admin_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_account_id uuid REFERENCES public.platform_accounts (id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text,
  target_id uuid,
  church_id uuid REFERENCES public.churches (id) ON DELETE SET NULL,
  reason text,
  success boolean NOT NULL DEFAULT true,
  correlation_id text,
  ip_address text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_admin_actions_action_nonempty_check CHECK (
    length(trim(action)) > 0
  )
);

CREATE INDEX IF NOT EXISTS platform_admin_actions_created_at_idx
  ON public.platform_admin_actions (created_at DESC);

CREATE INDEX IF NOT EXISTS platform_admin_actions_actor_idx
  ON public.platform_admin_actions (platform_account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS platform_admin_actions_action_idx
  ON public.platform_admin_actions (action);

CREATE INDEX IF NOT EXISTS platform_admin_actions_church_id_idx
  ON public.platform_admin_actions (church_id)
  WHERE church_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.prevent_platform_admin_action_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'platform_admin_actions are append-only';
END;
$$;

DROP TRIGGER IF EXISTS platform_admin_actions_no_update ON public.platform_admin_actions;
CREATE TRIGGER platform_admin_actions_no_update
  BEFORE UPDATE ON public.platform_admin_actions
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_platform_admin_action_mutation();

DROP TRIGGER IF EXISTS platform_admin_actions_no_delete ON public.platform_admin_actions;
CREATE TRIGGER platform_admin_actions_no_delete
  BEFORE DELETE ON public.platform_admin_actions
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_platform_admin_action_mutation();

-- ---------------------------------------------------------------------------
-- church_entitlement_overrides (platform-managed exceptions)
-- Church administrators cannot create these. Resolver wiring is app Phase 7+.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.church_entitlement_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  feature_id uuid NOT NULL REFERENCES public.features (id) ON DELETE RESTRICT,
  boolean_value boolean,
  integer_value integer,
  decimal_value numeric,
  text_value text,
  reason text NOT NULL,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  status public.platform_override_status NOT NULL DEFAULT 'active'::public.platform_override_status,
  created_by_platform_account_id uuid REFERENCES public.platform_accounts (id) ON DELETE SET NULL,
  approved_by_platform_account_id uuid REFERENCES public.platform_accounts (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT church_entitlement_overrides_reason_nonempty_check CHECK (
    length(trim(reason)) >= 8
  ),
  CONSTRAINT church_entitlement_overrides_value_present_check CHECK (
    boolean_value IS NOT NULL
    OR integer_value IS NOT NULL
    OR decimal_value IS NOT NULL
    OR text_value IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS church_entitlement_overrides_church_id_idx
  ON public.church_entitlement_overrides (church_id);

CREATE INDEX IF NOT EXISTS church_entitlement_overrides_feature_id_idx
  ON public.church_entitlement_overrides (feature_id);

CREATE INDEX IF NOT EXISTS church_entitlement_overrides_active_idx
  ON public.church_entitlement_overrides (church_id, feature_id)
  WHERE status = 'active'::public.platform_override_status
    AND revoked_at IS NULL;

-- Optional: link platform actor on church audit_logs without weakening RLS.
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS platform_account_id uuid
    REFERENCES public.platform_accounts (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS audit_logs_platform_account_id_idx
  ON public.audit_logs (platform_account_id)
  WHERE platform_account_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- updated_at triggers (reuse set_updated_at when present)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'set_updated_at'
  ) THEN
    DROP TRIGGER IF EXISTS platform_permissions_set_updated_at ON public.platform_permissions;
    CREATE TRIGGER platform_permissions_set_updated_at
      BEFORE UPDATE ON public.platform_permissions
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

    DROP TRIGGER IF EXISTS platform_roles_set_updated_at ON public.platform_roles;
    CREATE TRIGGER platform_roles_set_updated_at
      BEFORE UPDATE ON public.platform_roles
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

    DROP TRIGGER IF EXISTS platform_accounts_set_updated_at ON public.platform_accounts;
    CREATE TRIGGER platform_accounts_set_updated_at
      BEFORE UPDATE ON public.platform_accounts
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

    DROP TRIGGER IF EXISTS platform_account_roles_set_updated_at ON public.platform_account_roles;
    CREATE TRIGGER platform_account_roles_set_updated_at
      BEFORE UPDATE ON public.platform_account_roles
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

    DROP TRIGGER IF EXISTS platform_account_invitations_set_updated_at
      ON public.platform_account_invitations;
    CREATE TRIGGER platform_account_invitations_set_updated_at
      BEFORE UPDATE ON public.platform_account_invitations
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

    DROP TRIGGER IF EXISTS platform_access_sessions_set_updated_at
      ON public.platform_access_sessions;
    CREATE TRIGGER platform_access_sessions_set_updated_at
      BEFORE UPDATE ON public.platform_access_sessions
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

    DROP TRIGGER IF EXISTS church_entitlement_overrides_set_updated_at
      ON public.church_entitlement_overrides;
    CREATE TRIGGER church_entitlement_overrides_set_updated_at
      BEFORE UPDATE ON public.church_entitlement_overrides
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER; do not grant broad tenant bypass)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_active_platform_account()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_accounts pa
    WHERE pa.user_id = auth.uid()
      AND pa.status = 'active'::public.platform_account_status
  );
$$;

CREATE OR REPLACE FUNCTION public.current_platform_account_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pa.id
  FROM public.platform_accounts pa
  WHERE pa.user_id = auth.uid()
    AND pa.status = 'active'::public.platform_account_status
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.has_platform_permission(p_permission_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_accounts pa
    JOIN public.platform_account_roles par
      ON par.platform_account_id = pa.id
     AND par.revoked_at IS NULL
     AND (par.expires_at IS NULL OR par.expires_at > now())
    JOIN public.platform_roles pr
      ON pr.id = par.platform_role_id
     AND pr.status = 'active'::public.platform_role_status
    JOIN public.platform_role_permissions prp
      ON prp.role_id = pr.id
    JOIN public.platform_permissions pp
      ON pp.id = prp.permission_id
     AND pp.status = 'active'::public.platform_permission_status
     AND pp.permission_key = p_permission_key
    WHERE pa.user_id = auth.uid()
      AND pa.status = 'active'::public.platform_account_status
  );
$$;

CREATE OR REPLACE FUNCTION public.has_active_platform_access_session(p_church_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_access_sessions s
    JOIN public.platform_accounts pa ON pa.id = s.platform_account_id
    WHERE pa.user_id = auth.uid()
      AND pa.status = 'active'::public.platform_account_status
      AND s.church_id = p_church_id
      AND s.status = 'active'::public.platform_access_session_status
      AND s.expires_at > now()
      AND s.ended_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.count_active_super_admins()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM public.platform_accounts pa
  JOIN public.platform_account_roles par
    ON par.platform_account_id = pa.id
   AND par.revoked_at IS NULL
   AND (par.expires_at IS NULL OR par.expires_at > now())
  JOIN public.platform_roles pr
    ON pr.id = par.platform_role_id
   AND pr.role_key = 'super_admin'
   AND pr.status = 'active'::public.platform_role_status
  WHERE pa.status = 'active'::public.platform_account_status;
$$;

-- Prevent removing / disabling the last active super administrator.
CREATE OR REPLACE FUNCTION public.enforce_last_super_admin_safeguard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_super boolean;
  v_remaining integer;
BEGIN
  -- Role revocation path
  IF TG_TABLE_NAME = 'platform_account_roles' THEN
    IF NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.platform_roles pr
        WHERE pr.id = OLD.platform_role_id
          AND pr.role_key = 'super_admin'
      ) INTO v_is_super;

      IF v_is_super THEN
        SELECT public.count_active_super_admins() INTO v_remaining;
        -- count still includes this row until AFTER; adjust
        IF v_remaining <= 1 THEN
          RAISE EXCEPTION
            'Cannot revoke the last active super_admin assignment';
        END IF;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Account disable / archive path
  IF TG_TABLE_NAME = 'platform_accounts' THEN
    IF OLD.status = 'active'::public.platform_account_status
       AND NEW.status IN (
         'disabled'::public.platform_account_status,
         'locked'::public.platform_account_status,
         'archived'::public.platform_account_status
       ) THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.platform_account_roles par
        JOIN public.platform_roles pr ON pr.id = par.platform_role_id
        WHERE par.platform_account_id = OLD.id
          AND par.revoked_at IS NULL
          AND (par.expires_at IS NULL OR par.expires_at > now())
          AND pr.role_key = 'super_admin'
          AND pr.status = 'active'::public.platform_role_status
      ) INTO v_is_super;

      IF v_is_super AND public.count_active_super_admins() <= 1 THEN
        RAISE EXCEPTION
          'Cannot disable or lock the last active super administrator';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_account_roles_last_super_admin
  ON public.platform_account_roles;
CREATE TRIGGER platform_account_roles_last_super_admin
  BEFORE UPDATE ON public.platform_account_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_last_super_admin_safeguard();

DROP TRIGGER IF EXISTS platform_accounts_last_super_admin
  ON public.platform_accounts;
CREATE TRIGGER platform_accounts_last_super_admin
  BEFORE UPDATE ON public.platform_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_last_super_admin_safeguard();

-- Prevent hard-delete of system roles
CREATE OR REPLACE FUNCTION public.prevent_system_platform_role_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.is_system_role THEN
    RAISE EXCEPTION 'System platform roles cannot be deleted; archive them instead';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS platform_roles_prevent_system_delete ON public.platform_roles;
CREATE TRIGGER platform_roles_prevent_system_delete
  BEFORE DELETE ON public.platform_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_system_platform_role_delete();

REVOKE ALL ON FUNCTION public.is_active_platform_account() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_platform_account_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_platform_permission(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_active_platform_access_session(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.count_active_super_admins() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_active_platform_account() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_platform_account_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_platform_permission(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_active_platform_access_session(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.count_active_super_admins() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Strategy:
--   - Platform tables are NOT readable by ordinary church users
--   - Active platform accounts may SELECT their own account + effective catalog
--   - All writes are service_role only (trusted server workflows)
--   - No policies that grant platform users SELECT on arbitrary tenant tables
-- ---------------------------------------------------------------------------

ALTER TABLE public.platform_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_account_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_account_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_access_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admin_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.church_entitlement_overrides ENABLE ROW LEVEL SECURITY;

-- Own account
DROP POLICY IF EXISTS "Platform accounts readable by owner"
  ON public.platform_accounts;
CREATE POLICY "Platform accounts readable by owner"
  ON public.platform_accounts
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Own role assignments
DROP POLICY IF EXISTS "Platform account roles readable by owner"
  ON public.platform_account_roles;
CREATE POLICY "Platform account roles readable by owner"
  ON public.platform_account_roles
  FOR SELECT
  TO authenticated
  USING (
    platform_account_id = public.current_platform_account_id()
    OR EXISTS (
      SELECT 1
      FROM public.platform_accounts pa
      WHERE pa.id = platform_account_id
        AND pa.user_id = auth.uid()
    )
  );

-- Catalog readable only by active platform accounts
DROP POLICY IF EXISTS "Platform roles readable by platform accounts"
  ON public.platform_roles;
CREATE POLICY "Platform roles readable by platform accounts"
  ON public.platform_roles
  FOR SELECT
  TO authenticated
  USING (public.is_active_platform_account());

DROP POLICY IF EXISTS "Platform permissions readable by platform accounts"
  ON public.platform_permissions;
CREATE POLICY "Platform permissions readable by platform accounts"
  ON public.platform_permissions
  FOR SELECT
  TO authenticated
  USING (public.is_active_platform_account());

DROP POLICY IF EXISTS "Platform role permissions readable by platform accounts"
  ON public.platform_role_permissions;
CREATE POLICY "Platform role permissions readable by platform accounts"
  ON public.platform_role_permissions
  FOR SELECT
  TO authenticated
  USING (public.is_active_platform_account());

-- Own access sessions
DROP POLICY IF EXISTS "Platform access sessions readable by owner"
  ON public.platform_access_sessions;
CREATE POLICY "Platform access sessions readable by owner"
  ON public.platform_access_sessions
  FOR SELECT
  TO authenticated
  USING (
    platform_account_id = public.current_platform_account_id()
    OR EXISTS (
      SELECT 1 FROM public.platform_accounts pa
      WHERE pa.id = platform_account_id AND pa.user_id = auth.uid()
    )
  );

-- Invitations: invitee may read their pending invite by email match is NOT
-- safe via RLS alone (email spoofing). Keep invitations service_role only.
-- (No authenticated policies on platform_account_invitations.)

-- Admin actions / overrides: service_role only (no authenticated policies).

-- Grants
GRANT SELECT ON public.platform_accounts TO authenticated;
GRANT SELECT ON public.platform_account_roles TO authenticated;
GRANT SELECT ON public.platform_roles TO authenticated;
GRANT SELECT ON public.platform_permissions TO authenticated;
GRANT SELECT ON public.platform_role_permissions TO authenticated;
GRANT SELECT ON public.platform_access_sessions TO authenticated;

GRANT ALL ON public.platform_permissions TO service_role;
GRANT ALL ON public.platform_roles TO service_role;
GRANT ALL ON public.platform_role_permissions TO service_role;
GRANT ALL ON public.platform_accounts TO service_role;
GRANT ALL ON public.platform_account_roles TO service_role;
GRANT ALL ON public.platform_account_invitations TO service_role;
GRANT ALL ON public.platform_access_sessions TO service_role;
GRANT ALL ON public.platform_admin_actions TO service_role;
GRANT ALL ON public.church_entitlement_overrides TO service_role;

-- Church members may see active overrides for their own church (read-only).
DROP POLICY IF EXISTS "Church entitlement overrides readable by members"
  ON public.church_entitlement_overrides;
CREATE POLICY "Church entitlement overrides readable by members"
  ON public.church_entitlement_overrides
  FOR SELECT
  TO authenticated
  USING (
    public.is_active_church_member(church_id)
    OR public.is_church_owner(church_id)
  );

GRANT SELECT ON public.church_entitlement_overrides TO authenticated;

-- ---------------------------------------------------------------------------
-- Seed helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.seed_platform_permission(
  p_key text,
  p_display_name text,
  p_description text,
  p_category public.platform_permission_category
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.platform_permissions (
    permission_key, display_name, description, category, status
  )
  VALUES (
    p_key, p_display_name, p_description, p_category,
    'active'::public.platform_permission_status
  )
  ON CONFLICT (permission_key) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_platform_role(
  p_key text,
  p_display_name text,
  p_description text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.platform_roles (
    role_key, display_name, description, status, is_system_role
  )
  VALUES (
    p_key, p_display_name, p_description,
    'active'::public.platform_role_status,
    true
  )
  ON CONFLICT (role_key) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_platform_role_permission(
  p_role_key text,
  p_permission_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_id uuid;
  v_permission_id uuid;
BEGIN
  SELECT id INTO v_role_id
  FROM public.platform_roles
  WHERE role_key = p_role_key;

  SELECT id INTO v_permission_id
  FROM public.platform_permissions
  WHERE permission_key = p_permission_key;

  IF v_role_id IS NULL OR v_permission_id IS NULL THEN
    RAISE WARNING 'Skipping role permission seed: % → % (missing row)',
      p_role_key, p_permission_key;
    RETURN;
  END IF;

  INSERT INTO public.platform_role_permissions (role_id, permission_id)
  VALUES (v_role_id, v_permission_id)
  ON CONFLICT (role_id, permission_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_platform_permission(text, text, text, public.platform_permission_category) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seed_platform_role(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seed_platform_role_permission(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_platform_permission(text, text, text, public.platform_permission_category) TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_platform_role(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_platform_role_permission(text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- Seed: permissions
-- ---------------------------------------------------------------------------

SELECT public.seed_platform_permission(
  'platform.console.access', 'Access platform console',
  'Enter the /platform administration console.', 'console');

SELECT public.seed_platform_permission(
  'platform.accounts.read', 'Read platform accounts',
  'View platform operator accounts.', 'accounts');
SELECT public.seed_platform_permission(
  'platform.accounts.create', 'Create platform accounts',
  'Invite or create platform accounts.', 'accounts');
SELECT public.seed_platform_permission(
  'platform.accounts.update', 'Update platform accounts',
  'Update platform account profile and flags.', 'accounts');
SELECT public.seed_platform_permission(
  'platform.accounts.disable', 'Disable platform accounts',
  'Disable or lock platform accounts.', 'accounts');
SELECT public.seed_platform_permission(
  'platform.roles.assign', 'Assign platform roles',
  'Assign or revoke platform roles (except super_admin unless permitted).', 'accounts');
SELECT public.seed_platform_permission(
  'platform.super_admin.manage', 'Manage super administrators',
  'Create, demote, or disable super administrators.', 'accounts');

SELECT public.seed_platform_permission(
  'churches.read_all', 'Read all churches',
  'Search and view churches across tenants.', 'churches');
SELECT public.seed_platform_permission(
  'churches.update_all', 'Update churches',
  'Update approved church operational settings.', 'churches');
SELECT public.seed_platform_permission(
  'churches.suspend', 'Suspend churches',
  'Suspend church access.', 'churches');
SELECT public.seed_platform_permission(
  'churches.restore', 'Restore churches',
  'Restore suspended churches.', 'churches');
SELECT public.seed_platform_permission(
  'churches.support_access', 'Church support access',
  'Start church-scoped platform support sessions.', 'churches');

SELECT public.seed_platform_permission(
  'subscriptions.read_all', 'Read subscriptions',
  'View church subscriptions across tenants.', 'subscriptions');
SELECT public.seed_platform_permission(
  'subscriptions.change_plan', 'Change subscription plans',
  'Change church subscription tiers.', 'subscriptions');
SELECT public.seed_platform_permission(
  'subscriptions.override_entitlements', 'Override entitlements',
  'Create or revoke church entitlement overrides.', 'subscriptions');
SELECT public.seed_platform_permission(
  'subscriptions.cancel', 'Cancel subscriptions',
  'Cancel church subscriptions.', 'subscriptions');
SELECT public.seed_platform_permission(
  'subscriptions.restore', 'Restore subscriptions',
  'Restore cancelled or suspended subscriptions.', 'subscriptions');

SELECT public.seed_platform_permission(
  'plans.read', 'Read plans',
  'View subscription plan catalog.', 'plans');
SELECT public.seed_platform_permission(
  'plans.manage', 'Manage plans',
  'Modify subscription plan definitions.', 'plans');
SELECT public.seed_platform_permission(
  'features.read', 'Read features',
  'View feature registry and plan assignments.', 'features');
SELECT public.seed_platform_permission(
  'features.manage', 'Manage features',
  'Modify feature definitions and plan assignments.', 'features');

SELECT public.seed_platform_permission(
  'billing.read_all', 'Read billing',
  'View billing customer mappings and status.', 'billing');
SELECT public.seed_platform_permission(
  'billing.events.read', 'Read billing events',
  'View billing provider events.', 'billing');
SELECT public.seed_platform_permission(
  'billing.customer_portal.open', 'Open billing portal',
  'Open provider customer portal links server-side.', 'billing');

SELECT public.seed_platform_permission(
  'users.read_all', 'Read users',
  'Search users across the platform.', 'users');
SELECT public.seed_platform_permission(
  'users.disable', 'Disable users',
  'Disable Auth users when authorized.', 'users');
SELECT public.seed_platform_permission(
  'users.restore', 'Restore users',
  'Restore disabled users when authorized.', 'users');
SELECT public.seed_platform_permission(
  'users.force_password_reset', 'Force password reset',
  'Require password reset for a user.', 'users');

SELECT public.seed_platform_permission(
  'audit.platform.read', 'Read platform audit',
  'Read platform administration audit events.', 'audit');
SELECT public.seed_platform_permission(
  'audit.church.read_all', 'Read church audit',
  'Read church audit logs across tenants.', 'audit');

SELECT public.seed_platform_permission(
  'system.health.read', 'Read system health',
  'View safe health and configuration status.', 'system');
SELECT public.seed_platform_permission(
  'system.jobs.read', 'Read background jobs',
  'View background job status.', 'system');
SELECT public.seed_platform_permission(
  'system.jobs.retry', 'Retry background jobs',
  'Retry approved background jobs.', 'system');
SELECT public.seed_platform_permission(
  'system.webhooks.read', 'Read webhooks',
  'View webhook processing status.', 'system');
SELECT public.seed_platform_permission(
  'system.webhooks.retry', 'Retry webhooks',
  'Retry approved webhook processing.', 'system');
SELECT public.seed_platform_permission(
  'system.email.test', 'Send test email',
  'Send approved test emails.', 'system');
SELECT public.seed_platform_permission(
  'system.sms.test', 'Send test SMS',
  'Send approved test SMS messages.', 'system');

SELECT public.seed_platform_permission(
  'developer.tools.access', 'Access developer tools',
  'Use approved developer diagnostic tools.', 'developer');
SELECT public.seed_platform_permission(
  'developer.logs.read', 'Read developer logs',
  'View safe application diagnostics.', 'developer');
SELECT public.seed_platform_permission(
  'developer.config_status.read', 'Read config status',
  'View non-secret provider configuration status.', 'developer');

-- ---------------------------------------------------------------------------
-- Seed: roles
-- ---------------------------------------------------------------------------

SELECT public.seed_platform_role(
  'super_admin', 'Super Administrator',
  'Full platform operator with all platform permissions.');
SELECT public.seed_platform_role(
  'platform_admin', 'Platform Administrator',
  'Operate churches and subscriptions without managing super admins.');
SELECT public.seed_platform_role(
  'developer', 'Platform Developer',
  'Technical diagnostics and tools; no unrestricted customer data access.');
SELECT public.seed_platform_role(
  'support', 'Platform Support',
  'Customer support search and approved support sessions.');
SELECT public.seed_platform_role(
  'billing_admin', 'Platform Billing Administrator',
  'Subscription and billing administration.');
SELECT public.seed_platform_role(
  'auditor', 'Platform Auditor',
  'Read-only audit and configuration review.');

-- ---------------------------------------------------------------------------
-- Seed: role → permission matrix
-- ---------------------------------------------------------------------------

-- super_admin: all permissions
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT permission_key FROM public.platform_permissions WHERE status = 'active'
  LOOP
    PERFORM public.seed_platform_role_permission('super_admin', r.permission_key);
  END LOOP;
END $$;

-- platform_admin
SELECT public.seed_platform_role_permission('platform_admin', 'platform.console.access');
SELECT public.seed_platform_role_permission('platform_admin', 'platform.accounts.read');
SELECT public.seed_platform_role_permission('platform_admin', 'platform.accounts.create');
SELECT public.seed_platform_role_permission('platform_admin', 'platform.accounts.update');
SELECT public.seed_platform_role_permission('platform_admin', 'platform.accounts.disable');
SELECT public.seed_platform_role_permission('platform_admin', 'platform.roles.assign');
SELECT public.seed_platform_role_permission('platform_admin', 'churches.read_all');
SELECT public.seed_platform_role_permission('platform_admin', 'churches.update_all');
SELECT public.seed_platform_role_permission('platform_admin', 'churches.suspend');
SELECT public.seed_platform_role_permission('platform_admin', 'churches.restore');
SELECT public.seed_platform_role_permission('platform_admin', 'churches.support_access');
SELECT public.seed_platform_role_permission('platform_admin', 'subscriptions.read_all');
SELECT public.seed_platform_role_permission('platform_admin', 'subscriptions.change_plan');
SELECT public.seed_platform_role_permission('platform_admin', 'subscriptions.cancel');
SELECT public.seed_platform_role_permission('platform_admin', 'subscriptions.restore');
SELECT public.seed_platform_role_permission('platform_admin', 'plans.read');
SELECT public.seed_platform_role_permission('platform_admin', 'features.read');
SELECT public.seed_platform_role_permission('platform_admin', 'billing.read_all');
SELECT public.seed_platform_role_permission('platform_admin', 'billing.events.read');
SELECT public.seed_platform_role_permission('platform_admin', 'billing.customer_portal.open');
SELECT public.seed_platform_role_permission('platform_admin', 'users.read_all');
SELECT public.seed_platform_role_permission('platform_admin', 'users.disable');
SELECT public.seed_platform_role_permission('platform_admin', 'users.restore');
SELECT public.seed_platform_role_permission('platform_admin', 'users.force_password_reset');
SELECT public.seed_platform_role_permission('platform_admin', 'audit.platform.read');
SELECT public.seed_platform_role_permission('platform_admin', 'audit.church.read_all');
SELECT public.seed_platform_role_permission('platform_admin', 'system.health.read');
SELECT public.seed_platform_role_permission('platform_admin', 'system.jobs.read');
SELECT public.seed_platform_role_permission('platform_admin', 'system.webhooks.read');
SELECT public.seed_platform_role_permission('platform_admin', 'developer.config_status.read');

-- developer
SELECT public.seed_platform_role_permission('developer', 'platform.console.access');
SELECT public.seed_platform_role_permission('developer', 'churches.support_access');
SELECT public.seed_platform_role_permission('developer', 'system.health.read');
SELECT public.seed_platform_role_permission('developer', 'system.jobs.read');
SELECT public.seed_platform_role_permission('developer', 'system.webhooks.read');
SELECT public.seed_platform_role_permission('developer', 'system.email.test');
SELECT public.seed_platform_role_permission('developer', 'system.sms.test');
SELECT public.seed_platform_role_permission('developer', 'developer.tools.access');
SELECT public.seed_platform_role_permission('developer', 'developer.logs.read');
SELECT public.seed_platform_role_permission('developer', 'developer.config_status.read');

-- support
SELECT public.seed_platform_role_permission('support', 'platform.console.access');
SELECT public.seed_platform_role_permission('support', 'churches.read_all');
SELECT public.seed_platform_role_permission('support', 'churches.support_access');
SELECT public.seed_platform_role_permission('support', 'users.read_all');
SELECT public.seed_platform_role_permission('support', 'subscriptions.read_all');
SELECT public.seed_platform_role_permission('support', 'plans.read');
SELECT public.seed_platform_role_permission('support', 'features.read');
SELECT public.seed_platform_role_permission('support', 'audit.church.read_all');
SELECT public.seed_platform_role_permission('support', 'system.health.read');

-- billing_admin
SELECT public.seed_platform_role_permission('billing_admin', 'platform.console.access');
SELECT public.seed_platform_role_permission('billing_admin', 'churches.read_all');
SELECT public.seed_platform_role_permission('billing_admin', 'subscriptions.read_all');
SELECT public.seed_platform_role_permission('billing_admin', 'subscriptions.change_plan');
SELECT public.seed_platform_role_permission('billing_admin', 'subscriptions.override_entitlements');
SELECT public.seed_platform_role_permission('billing_admin', 'subscriptions.cancel');
SELECT public.seed_platform_role_permission('billing_admin', 'subscriptions.restore');
SELECT public.seed_platform_role_permission('billing_admin', 'plans.read');
SELECT public.seed_platform_role_permission('billing_admin', 'features.read');
SELECT public.seed_platform_role_permission('billing_admin', 'billing.read_all');
SELECT public.seed_platform_role_permission('billing_admin', 'billing.events.read');
SELECT public.seed_platform_role_permission('billing_admin', 'billing.customer_portal.open');
SELECT public.seed_platform_role_permission('billing_admin', 'audit.platform.read');

-- auditor
SELECT public.seed_platform_role_permission('auditor', 'platform.console.access');
SELECT public.seed_platform_role_permission('auditor', 'platform.accounts.read');
SELECT public.seed_platform_role_permission('auditor', 'churches.read_all');
SELECT public.seed_platform_role_permission('auditor', 'subscriptions.read_all');
SELECT public.seed_platform_role_permission('auditor', 'plans.read');
SELECT public.seed_platform_role_permission('auditor', 'features.read');
SELECT public.seed_platform_role_permission('auditor', 'billing.read_all');
SELECT public.seed_platform_role_permission('auditor', 'billing.events.read');
SELECT public.seed_platform_role_permission('auditor', 'users.read_all');
SELECT public.seed_platform_role_permission('auditor', 'audit.platform.read');
SELECT public.seed_platform_role_permission('auditor', 'audit.church.read_all');
SELECT public.seed_platform_role_permission('auditor', 'system.health.read');
SELECT public.seed_platform_role_permission('auditor', 'developer.config_status.read');

-- ---------------------------------------------------------------------------
-- Notes for operators (no executable bootstrap of the super admin here)
-- ---------------------------------------------------------------------------
-- Initial super admin email (create via server-only bootstrap, not SQL):
--   SUPER_ADMIN_BOOTSTRAP_EMAIL (recommended: repus_admin@sanctuaryprotected.com)
-- Never store SUPER_ADMIN_BOOTSTRAP_PASSWORD in SQL, seeds, or git.
-- After bootstrap:
--   must_change_password = true
--   mfa_required = true
--   assign role_key = super_admin
--   write platform_admin_actions action = platform.bootstrap_super_admin_created
