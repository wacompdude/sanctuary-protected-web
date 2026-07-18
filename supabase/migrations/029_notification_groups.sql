-- =============================================================================
-- 029_notification_groups.sql
-- Notification groups, endpoints, targets, preference rules, and emergency
-- policy columns. Additive / non-destructive. Safe to re-run.
-- Review before applying to production Supabase.
--
-- Phase 2: database + RLS only. App recipient resolution still uses roles
-- until Phase 5 wires group expansion.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Permission helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_manage_notification_groups(
  requested_church_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_church_role(
    requested_church_id,
    ARRAY['owner', 'administrator']
  );
$$;

-- Security leaders may manage operational (security/emergency/medical) groups.
CREATE OR REPLACE FUNCTION public.can_manage_operational_notification_groups(
  requested_church_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_church_role(
    requested_church_id,
    ARRAY['owner', 'administrator', 'security_leader']
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_notification_group(
  requested_church_id uuid,
  group_type text,
  is_system_group boolean
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN is_system_group THEN public.can_manage_notification_groups(requested_church_id)
    WHEN group_type IN ('security', 'emergency', 'medical')
      THEN public.can_manage_operational_notification_groups(requested_church_id)
    ELSE public.can_manage_notification_groups(requested_church_id)
  END;
$$;

REVOKE ALL ON FUNCTION public.can_manage_notification_groups(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_operational_notification_groups(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_notification_group(uuid, text, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.can_manage_notification_groups(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_operational_notification_groups(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_notification_group(uuid, text, boolean)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Emergency override columns on church_notification_settings
-- ---------------------------------------------------------------------------

ALTER TABLE public.church_notification_settings
  ADD COLUMN IF NOT EXISTS critical_alert_minimum_severity text
    NOT NULL DEFAULT 'critical';

ALTER TABLE public.church_notification_settings
  ADD COLUMN IF NOT EXISTS critical_alert_channels text[]
    NOT NULL DEFAULT ARRAY['email', 'in_app']::text[];

ALTER TABLE public.church_notification_settings
  ADD COLUMN IF NOT EXISTS allow_email_override boolean
    NOT NULL DEFAULT true;

ALTER TABLE public.church_notification_settings
  ADD COLUMN IF NOT EXISTS allow_sms_override boolean
    NOT NULL DEFAULT false;

ALTER TABLE public.church_notification_settings
  ADD COLUMN IF NOT EXISTS allow_push_override boolean
    NOT NULL DEFAULT false;

ALTER TABLE public.church_notification_settings
  ADD COLUMN IF NOT EXISTS require_acknowledgment_for_critical boolean
    NOT NULL DEFAULT false;

ALTER TABLE public.church_notification_settings
  DROP CONSTRAINT IF EXISTS church_notification_settings_critical_min_severity_check;

ALTER TABLE public.church_notification_settings
  ADD CONSTRAINT church_notification_settings_critical_min_severity_check
  CHECK (
    critical_alert_minimum_severity IN (
      'informational', 'low', 'medium', 'high', 'critical'
    )
  );

-- ---------------------------------------------------------------------------
-- notification_groups
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notification_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  campus_id uuid REFERENCES public.campuses (id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  group_type text NOT NULL DEFAULT 'custom',
  status text NOT NULL DEFAULT 'active',
  is_system_group boolean NOT NULL DEFAULT false,
  -- Controlled dynamic rule (no arbitrary SQL). Null = manual membership.
  dynamic_rule_type text,
  dynamic_rule_value text,
  allow_member_self_join boolean NOT NULL DEFAULT false,
  allow_member_self_leave boolean NOT NULL DEFAULT false,
  default_notification_severity text NOT NULL DEFAULT 'informational',
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT notification_groups_name_length_check
    CHECK (char_length(name) BETWEEN 1 AND 120),
  CONSTRAINT notification_groups_description_length_check
    CHECK (description IS NULL OR char_length(description) <= 2000),
  CONSTRAINT notification_groups_type_check
    CHECK (
      group_type IN (
        'security',
        'medical',
        'leadership',
        'ministry',
        'facilities',
        'campus',
        'emergency',
        'custom'
      )
    ),
  CONSTRAINT notification_groups_status_check
    CHECK (status IN ('active', 'inactive', 'archived')),
  CONSTRAINT notification_groups_severity_check
    CHECK (
      default_notification_severity IN (
        'informational', 'low', 'medium', 'high', 'critical'
      )
    ),
  CONSTRAINT notification_groups_dynamic_rule_type_check
    CHECK (
      dynamic_rule_type IS NULL
      OR dynamic_rule_type IN (
        'role',
        'campus',
        'membership_status',
        'team_assignment'
      )
    ),
  CONSTRAINT notification_groups_dynamic_rule_pair_check
    CHECK (
      (dynamic_rule_type IS NULL AND dynamic_rule_value IS NULL)
      OR (dynamic_rule_type IS NOT NULL AND dynamic_rule_value IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_groups_church_name_unique_idx
  ON public.notification_groups (church_id, lower(name))
  WHERE status <> 'archived';

CREATE UNIQUE INDEX IF NOT EXISTS notification_groups_church_system_rule_idx
  ON public.notification_groups (church_id, dynamic_rule_type, dynamic_rule_value)
  WHERE is_system_group = true
    AND dynamic_rule_type IS NOT NULL
    AND status <> 'archived';

CREATE INDEX IF NOT EXISTS notification_groups_church_status_idx
  ON public.notification_groups (church_id, status, group_type);

CREATE INDEX IF NOT EXISTS notification_groups_campus_idx
  ON public.notification_groups (campus_id)
  WHERE campus_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- notification_group_members
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notification_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.notification_groups (id) ON DELETE CASCADE,
  membership_id uuid NOT NULL REFERENCES public.church_memberships (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active',
  added_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_group_members_status_check
    CHECK (status IN ('active', 'inactive', 'removed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_group_members_active_unique_idx
  ON public.notification_group_members (group_id, membership_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS notification_group_members_church_user_idx
  ON public.notification_group_members (church_id, user_id, status);

CREATE INDEX IF NOT EXISTS notification_group_members_group_status_idx
  ON public.notification_group_members (group_id, status);

CREATE INDEX IF NOT EXISTS notification_group_members_membership_idx
  ON public.notification_group_members (membership_id);

-- ---------------------------------------------------------------------------
-- notification_group_defaults
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notification_group_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.notification_groups (id) ON DELETE CASCADE,
  notification_type text NOT NULL DEFAULT '*',
  email_enabled boolean NOT NULL DEFAULT true,
  sms_enabled boolean NOT NULL DEFAULT false,
  push_enabled boolean NOT NULL DEFAULT false,
  in_app_enabled boolean NOT NULL DEFAULT true,
  minimum_severity text NOT NULL DEFAULT 'informational',
  require_acknowledgment boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_group_defaults_type_length_check
    CHECK (char_length(notification_type) BETWEEN 1 AND 120),
  CONSTRAINT notification_group_defaults_severity_check
    CHECK (
      minimum_severity IN (
        'informational', 'low', 'medium', 'high', 'critical'
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_group_defaults_group_type_idx
  ON public.notification_group_defaults (group_id, notification_type);

CREATE INDEX IF NOT EXISTS notification_group_defaults_church_idx
  ON public.notification_group_defaults (church_id);

-- ---------------------------------------------------------------------------
-- notification_endpoints
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notification_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  membership_id uuid REFERENCES public.church_memberships (id) ON DELETE SET NULL,
  channel text NOT NULL,
  destination text NOT NULL,
  normalized_destination text NOT NULL,
  label text,
  is_primary boolean NOT NULL DEFAULT false,
  is_verified boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  status text NOT NULL DEFAULT 'unverified',
  consent_status text NOT NULL DEFAULT 'unknown',
  consent_recorded_at timestamptz,
  consent_source text,
  consent_disclosure_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT notification_endpoints_channel_check
    CHECK (channel IN ('email', 'sms', 'push', 'in_app')),
  CONSTRAINT notification_endpoints_status_check
    CHECK (
      status IN (
        'active',
        'unverified',
        'disabled',
        'bounced',
        'complained',
        'revoked',
        'invalid'
      )
    ),
  CONSTRAINT notification_endpoints_consent_check
    CHECK (
      consent_status IN (
        'unknown',
        'not_required',
        'pending',
        'granted',
        'revoked',
        'denied'
      )
    ),
  CONSTRAINT notification_endpoints_destination_length_check
    CHECK (
      char_length(destination) BETWEEN 1 AND 320
      AND char_length(normalized_destination) BETWEEN 1 AND 320
    ),
  CONSTRAINT notification_endpoints_label_length_check
    CHECK (label IS NULL OR char_length(label) <= 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_endpoints_church_user_channel_dest_idx
  ON public.notification_endpoints (
    church_id,
    user_id,
    channel,
    normalized_destination
  )
  WHERE status NOT IN ('revoked', 'invalid');

CREATE UNIQUE INDEX IF NOT EXISTS notification_endpoints_primary_per_channel_idx
  ON public.notification_endpoints (church_id, user_id, channel)
  WHERE is_primary = true AND status = 'active';

CREATE INDEX IF NOT EXISTS notification_endpoints_user_church_idx
  ON public.notification_endpoints (user_id, church_id, channel, status);

CREATE INDEX IF NOT EXISTS notification_endpoints_membership_idx
  ON public.notification_endpoints (membership_id)
  WHERE membership_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Granular preference rules (extends legacy notification_preferences)
-- Legacy table remains church-wide channel toggles (type + email/sms flags).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notification_preference_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  membership_id uuid REFERENCES public.church_memberships (id) ON DELETE SET NULL,
  group_id uuid REFERENCES public.notification_groups (id) ON DELETE CASCADE,
  notification_type text NOT NULL DEFAULT '*',
  channel text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  minimum_severity text NOT NULL DEFAULT 'informational',
  quiet_hours_enabled boolean NOT NULL DEFAULT false,
  quiet_hours_start time,
  quiet_hours_end time,
  timezone text NOT NULL DEFAULT 'America/Los_Angeles',
  digest_frequency text NOT NULL DEFAULT 'immediate',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_preference_rules_channel_check
    CHECK (channel IN ('email', 'sms', 'push', 'in_app')),
  CONSTRAINT notification_preference_rules_type_length_check
    CHECK (char_length(notification_type) BETWEEN 1 AND 120),
  CONSTRAINT notification_preference_rules_severity_check
    CHECK (
      minimum_severity IN (
        'informational', 'low', 'medium', 'high', 'critical'
      )
    ),
  CONSTRAINT notification_preference_rules_digest_check
    CHECK (
      digest_frequency IN ('immediate', 'hourly', 'daily', 'weekly', 'never')
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_preference_rules_unique_idx
  ON public.notification_preference_rules (
    church_id,
    user_id,
    notification_type,
    channel,
    COALESCE(group_id, '00000000-0000-0000-0000-000000000000')
  );

CREATE INDEX IF NOT EXISTS notification_preference_rules_user_church_idx
  ON public.notification_preference_rules (user_id, church_id);

CREATE INDEX IF NOT EXISTS notification_preference_rules_group_idx
  ON public.notification_preference_rules (group_id)
  WHERE group_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- notification_targets
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notification_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  notification_id uuid NOT NULL REFERENCES public.notifications (id) ON DELETE CASCADE,
  target_type text NOT NULL,
  group_id uuid REFERENCES public.notification_groups (id) ON DELETE SET NULL,
  membership_id uuid REFERENCES public.church_memberships (id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  role text,
  campus_id uuid REFERENCES public.campuses (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_targets_type_check
    CHECK (
      target_type IN ('group', 'member', 'user', 'role', 'campus', 'church')
    ),
  CONSTRAINT notification_targets_shape_check
    CHECK (
      (target_type = 'group' AND group_id IS NOT NULL)
      OR (target_type = 'member' AND membership_id IS NOT NULL)
      OR (target_type = 'user' AND user_id IS NOT NULL)
      OR (target_type = 'role' AND role IS NOT NULL)
      OR (target_type = 'campus' AND campus_id IS NOT NULL)
      OR (target_type = 'church')
    )
);

CREATE INDEX IF NOT EXISTS notification_targets_notification_idx
  ON public.notification_targets (notification_id);

CREATE INDEX IF NOT EXISTS notification_targets_church_group_idx
  ON public.notification_targets (church_id, group_id)
  WHERE group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS notification_targets_membership_idx
  ON public.notification_targets (membership_id)
  WHERE membership_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Snapshot / delivery metadata (additive columns)
-- ---------------------------------------------------------------------------

ALTER TABLE public.notification_recipients
  ADD COLUMN IF NOT EXISTS groups_at_send jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.notification_recipients
  ADD COLUMN IF NOT EXISTS preference_rule_applied text;

ALTER TABLE public.notification_recipients
  ADD COLUMN IF NOT EXISTS override_applied boolean NOT NULL DEFAULT false;

ALTER TABLE public.notification_recipients
  ADD COLUMN IF NOT EXISTS resolution_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.notification_deliveries
  ADD COLUMN IF NOT EXISTS endpoint_id uuid
    REFERENCES public.notification_endpoints (id) ON DELETE SET NULL;

ALTER TABLE public.notification_deliveries
  ADD COLUMN IF NOT EXISTS normalized_destination text;

ALTER TABLE public.notification_deliveries
  ADD COLUMN IF NOT EXISTS source_groups jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.notification_deliveries
  ADD COLUMN IF NOT EXISTS preference_rule_applied text;

ALTER TABLE public.notification_deliveries
  ADD COLUMN IF NOT EXISTS override_applied boolean NOT NULL DEFAULT false;

ALTER TABLE public.notification_deliveries
  ADD COLUMN IF NOT EXISTS suppression_reason text;

ALTER TABLE public.notification_deliveries
  DROP CONSTRAINT IF EXISTS notification_deliveries_suppression_reason_check;

ALTER TABLE public.notification_deliveries
  ADD CONSTRAINT notification_deliveries_suppression_reason_check
  CHECK (
    suppression_reason IS NULL
    OR suppression_reason IN (
      'user_opted_out',
      'channel_disabled',
      'endpoint_unverified',
      'endpoint_invalid',
      'membership_inactive',
      'quiet_hours',
      'below_minimum_severity',
      'duplicate_endpoint',
      'provider_unavailable',
      'consent_missing',
      'digest_deferred',
      'other'
    )
  );

CREATE INDEX IF NOT EXISTS notification_deliveries_endpoint_idx
  ON public.notification_deliveries (endpoint_id)
  WHERE endpoint_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS notification_deliveries_dedupe_active_idx
  ON public.notification_deliveries (
    notification_id,
    channel,
    lower(normalized_destination)
  )
  WHERE normalized_destination IS NOT NULL
    AND status NOT IN ('cancelled', 'suppressed', 'failed', 'rejected', 'bounced');

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS notification_groups_touch_updated_at ON public.notification_groups;
CREATE TRIGGER notification_groups_touch_updated_at
  BEFORE UPDATE ON public.notification_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_notifications_updated_at();

DROP TRIGGER IF EXISTS notification_group_members_touch_updated_at
  ON public.notification_group_members;
CREATE TRIGGER notification_group_members_touch_updated_at
  BEFORE UPDATE ON public.notification_group_members
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_notifications_updated_at();

DROP TRIGGER IF EXISTS notification_group_defaults_touch_updated_at
  ON public.notification_group_defaults;
CREATE TRIGGER notification_group_defaults_touch_updated_at
  BEFORE UPDATE ON public.notification_group_defaults
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_notifications_updated_at();

DROP TRIGGER IF EXISTS notification_endpoints_touch_updated_at
  ON public.notification_endpoints;
CREATE TRIGGER notification_endpoints_touch_updated_at
  BEFORE UPDATE ON public.notification_endpoints
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_notifications_updated_at();

DROP TRIGGER IF EXISTS notification_preference_rules_touch_updated_at
  ON public.notification_preference_rules;
CREATE TRIGGER notification_preference_rules_touch_updated_at
  BEFORE UPDATE ON public.notification_preference_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_notifications_updated_at();

-- ---------------------------------------------------------------------------
-- Seed system dynamic groups for every church
-- ---------------------------------------------------------------------------

INSERT INTO public.notification_groups (
  church_id,
  name,
  description,
  group_type,
  status,
  is_system_group,
  dynamic_rule_type,
  dynamic_rule_value,
  allow_member_self_join,
  allow_member_self_leave,
  default_notification_severity
)
SELECT
  c.id,
  seed.name,
  seed.description,
  seed.group_type,
  'active',
  true,
  seed.rule_type,
  seed.rule_value,
  false,
  false,
  'informational'
FROM public.churches c
CROSS JOIN (
  VALUES
    (
      'All Church Owners',
      'System group: all active owners for this church.',
      'leadership',
      'role',
      'owner'
    ),
    (
      'All Administrators',
      'System group: all active administrators for this church.',
      'leadership',
      'role',
      'administrator'
    ),
    (
      'All Security Leaders',
      'System group: all active security leaders for this church.',
      'security',
      'role',
      'security_leader'
    ),
    (
      'All Security Team Members',
      'System group: all active security members for this church.',
      'security',
      'role',
      'security_member'
    ),
    (
      'All Active Members',
      'System group: every active church membership.',
      'custom',
      'membership_status',
      'active'
    )
) AS seed (name, description, group_type, rule_type, rule_value)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.notification_groups g
  WHERE g.church_id = c.id
    AND g.is_system_group = true
    AND g.dynamic_rule_type = seed.rule_type
    AND g.dynamic_rule_value = seed.rule_value
    AND g.status <> 'archived'
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.notification_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_group_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preference_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_targets ENABLE ROW LEVEL SECURITY;

-- Groups: members can list active groups; manage by role/type
DROP POLICY IF EXISTS "Notification groups viewable by church members"
  ON public.notification_groups;
CREATE POLICY "Notification groups viewable by church members"
  ON public.notification_groups
  FOR SELECT
  TO authenticated
  USING (public.is_active_church_member(church_id));

DROP POLICY IF EXISTS "Notification groups insertable by managers"
  ON public.notification_groups;
CREATE POLICY "Notification groups insertable by managers"
  ON public.notification_groups
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_manage_notification_group(church_id, group_type, is_system_group)
    AND (created_by IS NULL OR created_by = auth.uid())
  );

DROP POLICY IF EXISTS "Notification groups updatable by managers"
  ON public.notification_groups;
CREATE POLICY "Notification groups updatable by managers"
  ON public.notification_groups
  FOR UPDATE
  TO authenticated
  USING (
    public.can_manage_notification_group(church_id, group_type, is_system_group)
  )
  WITH CHECK (
    public.can_manage_notification_group(church_id, group_type, is_system_group)
  );

DROP POLICY IF EXISTS "Notification groups deletable by admins only"
  ON public.notification_groups;
CREATE POLICY "Notification groups deletable by admins only"
  ON public.notification_groups
  FOR DELETE
  TO authenticated
  USING (
    public.can_manage_notification_groups(church_id)
    AND is_system_group = false
  );

-- Group members
DROP POLICY IF EXISTS "Notification group members viewable by church members"
  ON public.notification_group_members;
CREATE POLICY "Notification group members viewable by church members"
  ON public.notification_group_members
  FOR SELECT
  TO authenticated
  USING (public.is_active_church_member(church_id));

DROP POLICY IF EXISTS "Notification group members manageable by group managers"
  ON public.notification_group_members;
CREATE POLICY "Notification group members manageable by group managers"
  ON public.notification_group_members
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.notification_groups g
      WHERE g.id = notification_group_members.group_id
        AND g.church_id = notification_group_members.church_id
        AND public.can_manage_notification_group(
          g.church_id,
          g.group_type,
          g.is_system_group
        )
        AND g.is_system_group = false
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.notification_groups g
      JOIN public.church_memberships m
        ON m.id = notification_group_members.membership_id
       AND m.church_id = notification_group_members.church_id
       AND m.status = 'active'
      WHERE g.id = notification_group_members.group_id
        AND g.church_id = notification_group_members.church_id
        AND public.can_manage_notification_group(
          g.church_id,
          g.group_type,
          g.is_system_group
        )
        AND g.is_system_group = false
        AND notification_group_members.user_id = m.user_id
    )
  );

-- Group defaults
DROP POLICY IF EXISTS "Notification group defaults viewable by church members"
  ON public.notification_group_defaults;
CREATE POLICY "Notification group defaults viewable by church members"
  ON public.notification_group_defaults
  FOR SELECT
  TO authenticated
  USING (public.is_active_church_member(church_id));

DROP POLICY IF EXISTS "Notification group defaults manageable by managers"
  ON public.notification_group_defaults;
CREATE POLICY "Notification group defaults manageable by managers"
  ON public.notification_group_defaults
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.notification_groups g
      WHERE g.id = notification_group_defaults.group_id
        AND g.church_id = notification_group_defaults.church_id
        AND public.can_manage_notification_group(
          g.church_id,
          g.group_type,
          g.is_system_group
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.notification_groups g
      WHERE g.id = notification_group_defaults.group_id
        AND g.church_id = notification_group_defaults.church_id
        AND public.can_manage_notification_group(
          g.church_id,
          g.group_type,
          g.is_system_group
        )
    )
  );

-- Endpoints: owner only for SELECT of full destination; leaders see limited via app
DROP POLICY IF EXISTS "Notification endpoints viewable by owner or admins"
  ON public.notification_endpoints;
CREATE POLICY "Notification endpoints viewable by owner or admins"
  ON public.notification_endpoints
  FOR SELECT
  TO authenticated
  USING (
    public.is_active_church_member(church_id)
    AND (
      user_id = auth.uid()
      OR public.can_manage_notification_settings(church_id)
    )
  );

DROP POLICY IF EXISTS "Notification endpoints insertable by owner"
  ON public.notification_endpoints;
CREATE POLICY "Notification endpoints insertable by owner"
  ON public.notification_endpoints
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_active_church_member(church_id)
  );

DROP POLICY IF EXISTS "Notification endpoints updatable by owner"
  ON public.notification_endpoints;
CREATE POLICY "Notification endpoints updatable by owner"
  ON public.notification_endpoints
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND public.is_active_church_member(church_id)
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_active_church_member(church_id)
  );

-- Preference rules: self only
DROP POLICY IF EXISTS "Notification preference rules viewable by owner"
  ON public.notification_preference_rules;
CREATE POLICY "Notification preference rules viewable by owner"
  ON public.notification_preference_rules
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    AND public.is_active_church_member(church_id)
  );

DROP POLICY IF EXISTS "Notification preference rules manageable by owner"
  ON public.notification_preference_rules;
CREATE POLICY "Notification preference rules manageable by owner"
  ON public.notification_preference_rules
  FOR ALL
  TO authenticated
  USING (
    user_id = auth.uid()
    AND public.is_active_church_member(church_id)
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_active_church_member(church_id)
  );

-- Targets: view with notification; insert by operational creators
DROP POLICY IF EXISTS "Notification targets viewable with notification"
  ON public.notification_targets;
CREATE POLICY "Notification targets viewable with notification"
  ON public.notification_targets
  FOR SELECT
  TO authenticated
  USING (
    public.is_active_church_member(church_id)
    AND (
      public.can_view_notification_history(church_id)
      OR public.is_notification_recipient(notification_id)
    )
  );

DROP POLICY IF EXISTS "Notification targets insertable by operational roles"
  ON public.notification_targets;
CREATE POLICY "Notification targets insertable by operational roles"
  ON public.notification_targets
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_church_member(notification_targets.church_id)
    AND public.can_create_operational_notifications(notification_targets.church_id)
    AND EXISTS (
      SELECT 1
      FROM public.notifications n
      WHERE n.id = notification_targets.notification_id
        AND n.church_id = notification_targets.church_id
    )
  );

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE ON public.notification_groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_group_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_group_defaults TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.notification_endpoints TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preference_rules TO authenticated;
GRANT SELECT, INSERT ON public.notification_targets TO authenticated;

GRANT ALL ON public.notification_groups TO service_role;
GRANT ALL ON public.notification_group_members TO service_role;
GRANT ALL ON public.notification_group_defaults TO service_role;
GRANT ALL ON public.notification_endpoints TO service_role;
GRANT ALL ON public.notification_preference_rules TO service_role;
GRANT ALL ON public.notification_targets TO service_role;

-- Prefer soft-archive over hard delete for groups with history
REVOKE DELETE ON public.notification_groups FROM authenticated;
