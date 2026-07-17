-- =============================================================================
-- 027_notifications.sql
-- Multi-channel notification foundation (email via Resend first).
-- Safe to re-run. Review before applying to production Supabase.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Permission helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_manage_notification_settings(
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

CREATE OR REPLACE FUNCTION public.can_view_notification_history(
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

CREATE OR REPLACE FUNCTION public.can_manage_notification_templates(
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

CREATE OR REPLACE FUNCTION public.can_create_operational_notifications(
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

REVOKE ALL ON FUNCTION public.can_manage_notification_settings(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_notification_history(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_notification_templates(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_create_operational_notifications(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.can_manage_notification_settings(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_notification_history(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_notification_templates(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_create_operational_notifications(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Church notification settings (1:1 with churches)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.church_notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL UNIQUE REFERENCES public.churches (id) ON DELETE CASCADE,
  default_sender_name text,
  reply_to_email text,
  email_notifications_enabled boolean NOT NULL DEFAULT true,
  sms_notifications_enabled boolean NOT NULL DEFAULT false,
  push_notifications_enabled boolean NOT NULL DEFAULT false,
  critical_alert_override_enabled boolean NOT NULL DEFAULT true,
  default_incident_notification_roles text[] NOT NULL DEFAULT ARRAY[
    'owner', 'administrator', 'security_leader'
  ]::text[],
  default_critical_notification_roles text[] NOT NULL DEFAULT ARRAY[
    'owner', 'administrator', 'security_leader'
  ]::text[],
  certification_warning_days integer NOT NULL DEFAULT 60,
  maintenance_warning_days integer NOT NULL DEFAULT 30,
  daily_digest_enabled boolean NOT NULL DEFAULT false,
  daily_digest_time time NOT NULL DEFAULT '08:00:00',
  weekly_digest_enabled boolean NOT NULL DEFAULT false,
  weekly_digest_day smallint NOT NULL DEFAULT 1,
  weekly_digest_time time NOT NULL DEFAULT '08:00:00',
  timezone text NOT NULL DEFAULT 'America/Los_Angeles',
  max_email_attempts smallint NOT NULL DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT church_notification_settings_cert_warning_days_check
    CHECK (certification_warning_days BETWEEN 1 AND 365),
  CONSTRAINT church_notification_settings_maintenance_warning_days_check
    CHECK (maintenance_warning_days BETWEEN 1 AND 365),
  CONSTRAINT church_notification_settings_weekly_digest_day_check
    CHECK (weekly_digest_day BETWEEN 0 AND 6),
  CONSTRAINT church_notification_settings_max_email_attempts_check
    CHECK (max_email_attempts BETWEEN 1 AND 10),
  CONSTRAINT church_notification_settings_reply_to_email_check
    CHECK (
      reply_to_email IS NULL
      OR reply_to_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    )
);

CREATE INDEX IF NOT EXISTS church_notification_settings_church_id_idx
  ON public.church_notification_settings (church_id);

-- Backfill settings for existing churches.
INSERT INTO public.church_notification_settings (church_id, default_sender_name, certification_warning_days, timezone)
SELECT
  c.id,
  NULLIF(trim(c.default_emergency_notification_sender), ''),
  COALESCE(c.certification_warning_days, 60),
  COALESCE(NULLIF(trim(c.timezone), ''), 'America/Los_Angeles')
FROM public.churches c
ON CONFLICT (church_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  campus_id uuid REFERENCES public.campuses (id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  notification_type text NOT NULL,
  severity text NOT NULL DEFAULT 'informational',
  title text NOT NULL,
  body text NOT NULL,
  summary text,
  entity_type text,
  entity_id uuid,
  action_url text,
  status text NOT NULL DEFAULT 'pending',
  priority smallint NOT NULL DEFAULT 0,
  requires_acknowledgment boolean NOT NULL DEFAULT false,
  acknowledgment_deadline timestamptz,
  expires_at timestamptz,
  scheduled_for timestamptz,
  deduplication_key text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  template_key text,
  template_version integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  completed_at timestamptz,
  CONSTRAINT notifications_severity_check
    CHECK (severity IN ('informational', 'low', 'medium', 'high', 'critical')),
  CONSTRAINT notifications_status_check
    CHECK (
      status IN (
        'draft',
        'pending',
        'queued',
        'processing',
        'partially_sent',
        'sent',
        'failed',
        'cancelled',
        'expired'
      )
    ),
  CONSTRAINT notifications_title_length_check
    CHECK (char_length(title) BETWEEN 1 AND 500),
  CONSTRAINT notifications_body_length_check
    CHECK (char_length(body) BETWEEN 1 AND 20000),
  CONSTRAINT notifications_summary_length_check
    CHECK (summary IS NULL OR char_length(summary) <= 1000),
  CONSTRAINT notifications_action_url_length_check
    CHECK (action_url IS NULL OR char_length(action_url) <= 2000),
  CONSTRAINT notifications_deduplication_key_length_check
    CHECK (deduplication_key IS NULL OR char_length(deduplication_key) <= 500)
);

CREATE UNIQUE INDEX IF NOT EXISTS notifications_church_dedupe_active_idx
  ON public.notifications (church_id, deduplication_key)
  WHERE deduplication_key IS NOT NULL
    AND status NOT IN ('cancelled', 'expired', 'failed');

CREATE INDEX IF NOT EXISTS notifications_church_created_idx
  ON public.notifications (church_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_church_status_scheduled_idx
  ON public.notifications (church_id, status, scheduled_for)
  WHERE scheduled_for IS NOT NULL;

CREATE INDEX IF NOT EXISTS notifications_entity_idx
  ON public.notifications (church_id, entity_type, entity_id)
  WHERE entity_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Notification recipients (in-app + addressing)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notification_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  notification_id uuid NOT NULL REFERENCES public.notifications (id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  recipient_type text NOT NULL DEFAULT 'user',
  recipient_address text,
  display_name text,
  membership_id uuid REFERENCES public.church_memberships (id) ON DELETE SET NULL,
  role_at_send text,
  acknowledged_at timestamptz,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_recipients_type_check
    CHECK (
      recipient_type IN ('user', 'email_address', 'role', 'team', 'campus', 'church')
    ),
  CONSTRAINT notification_recipients_address_length_check
    CHECK (recipient_address IS NULL OR char_length(recipient_address) <= 320),
  CONSTRAINT notification_recipients_display_name_length_check
    CHECK (display_name IS NULL OR char_length(display_name) <= 200)
);

CREATE INDEX IF NOT EXISTS notification_recipients_notification_idx
  ON public.notification_recipients (notification_id);

CREATE INDEX IF NOT EXISTS notification_recipients_user_unread_idx
  ON public.notification_recipients (church_id, user_id, read_at, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS notification_recipients_notification_user_idx
  ON public.notification_recipients (notification_id, user_id)
  WHERE user_id IS NOT NULL;

-- Defined after notification_recipients exists (SQL functions validate relations).
CREATE OR REPLACE FUNCTION public.is_notification_recipient(
  p_notification_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.notification_recipients nr
    WHERE nr.notification_id = p_notification_id
      AND nr.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_notification_recipient(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_notification_recipient(uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Notification deliveries (per channel)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  notification_id uuid NOT NULL REFERENCES public.notifications (id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.notification_recipients (id) ON DELETE CASCADE,
  channel text NOT NULL,
  provider text NOT NULL DEFAULT 'resend',
  provider_message_id text,
  status text NOT NULL DEFAULT 'pending',
  attempt_number smallint NOT NULL DEFAULT 0,
  max_attempts smallint NOT NULL DEFAULT 3,
  scheduled_for timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  last_error_code text,
  last_error_message text,
  provider_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_deliveries_channel_check
    CHECK (channel IN ('email', 'sms', 'push', 'in_app')),
  CONSTRAINT notification_deliveries_status_check
    CHECK (
      status IN (
        'pending',
        'queued',
        'processing',
        'delivered',
        'sent',
        'failed',
        'bounced',
        'rejected',
        'cancelled',
        'suppressed',
        'expired'
      )
    ),
  CONSTRAINT notification_deliveries_attempt_number_check
    CHECK (attempt_number >= 0),
  CONSTRAINT notification_deliveries_max_attempts_check
    CHECK (max_attempts BETWEEN 1 AND 10),
  CONSTRAINT notification_deliveries_error_message_length_check
    CHECK (
      last_error_message IS NULL OR char_length(last_error_message) <= 1000
    )
);

CREATE INDEX IF NOT EXISTS notification_deliveries_dispatch_idx
  ON public.notification_deliveries (status, scheduled_for, created_at)
  WHERE status IN ('pending', 'queued', 'processing');

CREATE INDEX IF NOT EXISTS notification_deliveries_notification_idx
  ON public.notification_deliveries (notification_id);

CREATE INDEX IF NOT EXISTS notification_deliveries_recipient_idx
  ON public.notification_deliveries (recipient_id);

CREATE INDEX IF NOT EXISTS notification_deliveries_provider_message_idx
  ON public.notification_deliveries (provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Notification templates
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid REFERENCES public.churches (id) ON DELETE CASCADE,
  template_key text NOT NULL,
  name text NOT NULL,
  description text,
  channel text NOT NULL DEFAULT 'email',
  subject_template text NOT NULL,
  body_text_template text NOT NULL,
  body_html_template text,
  severity text NOT NULL DEFAULT 'informational',
  is_system_template boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  allowed_variables text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_templates_channel_check
    CHECK (channel IN ('email', 'sms', 'push', 'in_app')),
  CONSTRAINT notification_templates_severity_check
    CHECK (severity IN ('informational', 'low', 'medium', 'high', 'critical')),
  CONSTRAINT notification_templates_key_length_check
    CHECK (char_length(template_key) BETWEEN 1 AND 120),
  CONSTRAINT notification_templates_name_length_check
    CHECK (char_length(name) BETWEEN 1 AND 200),
  CONSTRAINT notification_templates_subject_length_check
    CHECK (char_length(subject_template) BETWEEN 1 AND 500),
  CONSTRAINT notification_templates_body_text_length_check
    CHECK (char_length(body_text_template) BETWEEN 1 AND 20000)
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_templates_system_key_channel_idx
  ON public.notification_templates (template_key, channel)
  WHERE church_id IS NULL AND is_system_template = true;

CREATE UNIQUE INDEX IF NOT EXISTS notification_templates_church_key_channel_idx
  ON public.notification_templates (church_id, template_key, channel)
  WHERE church_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- User notification preferences (per church)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  notification_type text NOT NULL,
  email_enabled boolean NOT NULL DEFAULT true,
  sms_enabled boolean NOT NULL DEFAULT false,
  push_enabled boolean NOT NULL DEFAULT false,
  in_app_enabled boolean NOT NULL DEFAULT true,
  minimum_severity text NOT NULL DEFAULT 'informational',
  quiet_hours_enabled boolean NOT NULL DEFAULT false,
  quiet_hours_start time,
  quiet_hours_end time,
  timezone text NOT NULL DEFAULT 'America/Los_Angeles',
  digest_frequency text NOT NULL DEFAULT 'immediate',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_preferences_minimum_severity_check
    CHECK (minimum_severity IN ('informational', 'low', 'medium', 'high', 'critical')),
  CONSTRAINT notification_preferences_digest_frequency_check
    CHECK (digest_frequency IN ('immediate', 'hourly', 'daily', 'weekly', 'never')),
  CONSTRAINT notification_preferences_type_length_check
    CHECK (char_length(notification_type) BETWEEN 1 AND 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_preferences_church_user_type_idx
  ON public.notification_preferences (church_id, user_id, notification_type);

CREATE INDEX IF NOT EXISTS notification_preferences_user_church_idx
  ON public.notification_preferences (user_id, church_id);

-- ---------------------------------------------------------------------------
-- Provider webhook events (idempotency + delivery updates)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notification_provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid REFERENCES public.churches (id) ON DELETE SET NULL,
  delivery_id uuid REFERENCES public.notification_deliveries (id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'resend',
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  provider_message_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_provider_events_provider_event_id_length_check
    CHECK (char_length(provider_event_id) BETWEEN 1 AND 200)
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_provider_events_provider_event_idx
  ON public.notification_provider_events (provider, provider_event_id);

CREATE INDEX IF NOT EXISTS notification_provider_events_delivery_idx
  ON public.notification_provider_events (delivery_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.touch_notifications_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_touch_updated_at ON public.notifications;
CREATE TRIGGER notifications_touch_updated_at
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_notifications_updated_at();

DROP TRIGGER IF EXISTS notification_deliveries_touch_updated_at ON public.notification_deliveries;
CREATE TRIGGER notification_deliveries_touch_updated_at
  BEFORE UPDATE ON public.notification_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_notifications_updated_at();

DROP TRIGGER IF EXISTS notification_templates_touch_updated_at ON public.notification_templates;
CREATE TRIGGER notification_templates_touch_updated_at
  BEFORE UPDATE ON public.notification_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_notifications_updated_at();

DROP TRIGGER IF EXISTS notification_preferences_touch_updated_at ON public.notification_preferences;
CREATE TRIGGER notification_preferences_touch_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_notifications_updated_at();

DROP TRIGGER IF EXISTS church_notification_settings_touch_updated_at ON public.church_notification_settings;
CREATE TRIGGER church_notification_settings_touch_updated_at
  BEFORE UPDATE ON public.church_notification_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_notifications_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.church_notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_provider_events ENABLE ROW LEVEL SECURITY;

-- church_notification_settings
DROP POLICY IF EXISTS "Church notification settings viewable by leaders"
  ON public.church_notification_settings;
CREATE POLICY "Church notification settings viewable by leaders"
  ON public.church_notification_settings
  FOR SELECT
  TO authenticated
  USING (
    public.is_active_church_member(church_id)
    AND public.can_view_notification_history(church_id)
  );

DROP POLICY IF EXISTS "Church notification settings manageable by admins"
  ON public.church_notification_settings;
CREATE POLICY "Church notification settings manageable by admins"
  ON public.church_notification_settings
  FOR ALL
  TO authenticated
  USING (public.can_manage_notification_settings(church_id))
  WITH CHECK (public.can_manage_notification_settings(church_id));

-- notifications
DROP POLICY IF EXISTS "Notifications viewable by recipients or history roles"
  ON public.notifications;
CREATE POLICY "Notifications viewable by recipients or history roles"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (
    public.is_active_church_member(church_id)
    AND (
      public.is_notification_recipient(id)
      OR public.can_view_notification_history(church_id)
    )
  );

DROP POLICY IF EXISTS "Notifications insertable by operational roles"
  ON public.notifications;
CREATE POLICY "Notifications insertable by operational roles"
  ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_church_member(church_id)
    AND public.can_create_operational_notifications(church_id)
    AND (created_by IS NULL OR created_by = auth.uid())
  );

DROP POLICY IF EXISTS "Notifications updatable by operational roles"
  ON public.notifications;
CREATE POLICY "Notifications updatable by operational roles"
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (public.can_create_operational_notifications(church_id))
  WITH CHECK (public.can_create_operational_notifications(church_id));

-- notification_recipients
DROP POLICY IF EXISTS "Notification recipients viewable by self or history roles"
  ON public.notification_recipients;
CREATE POLICY "Notification recipients viewable by self or history roles"
  ON public.notification_recipients
  FOR SELECT
  TO authenticated
  USING (
    public.is_active_church_member(church_id)
    AND (
      user_id = auth.uid()
      OR public.can_view_notification_history(church_id)
    )
  );

DROP POLICY IF EXISTS "Notification recipients insertable by operational roles"
  ON public.notification_recipients;
CREATE POLICY "Notification recipients insertable by operational roles"
  ON public.notification_recipients
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_church_member(church_id)
    AND public.can_create_operational_notifications(church_id)
    AND EXISTS (
      SELECT 1
      FROM public.notifications n
      WHERE n.id = notification_id
        AND n.church_id = church_id
    )
  );

DROP POLICY IF EXISTS "Notification recipients updatable by self"
  ON public.notification_recipients;
CREATE POLICY "Notification recipients updatable by self"
  ON public.notification_recipients
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

-- notification_deliveries (read-only for clients; writes via service role dispatcher)
DROP POLICY IF EXISTS "Notification deliveries viewable by recipient or history roles"
  ON public.notification_deliveries;
CREATE POLICY "Notification deliveries viewable by recipient or history roles"
  ON public.notification_deliveries
  FOR SELECT
  TO authenticated
  USING (
    public.is_active_church_member(church_id)
    AND (
      EXISTS (
        SELECT 1
        FROM public.notification_recipients nr
        WHERE nr.id = recipient_id
          AND nr.user_id = auth.uid()
      )
      OR public.can_view_notification_history(church_id)
    )
  );

-- notification_templates
DROP POLICY IF EXISTS "Notification templates viewable by church members"
  ON public.notification_templates;
CREATE POLICY "Notification templates viewable by church members"
  ON public.notification_templates
  FOR SELECT
  TO authenticated
  USING (
    (church_id IS NULL AND is_system_template = true)
    OR (
      church_id IS NOT NULL
      AND public.is_active_church_member(church_id)
    )
  );

DROP POLICY IF EXISTS "Notification templates manageable by permitted roles"
  ON public.notification_templates;
CREATE POLICY "Notification templates manageable by permitted roles"
  ON public.notification_templates
  FOR ALL
  TO authenticated
  USING (
    church_id IS NOT NULL
    AND public.can_manage_notification_templates(church_id)
    AND is_system_template = false
  )
  WITH CHECK (
    church_id IS NOT NULL
    AND public.can_manage_notification_templates(church_id)
    AND is_system_template = false
  );

-- notification_preferences
DROP POLICY IF EXISTS "Notification preferences viewable by owner"
  ON public.notification_preferences;
CREATE POLICY "Notification preferences viewable by owner"
  ON public.notification_preferences
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    AND public.is_active_church_member(church_id)
  );

DROP POLICY IF EXISTS "Notification preferences manageable by owner"
  ON public.notification_preferences;
CREATE POLICY "Notification preferences manageable by owner"
  ON public.notification_preferences
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

-- notification_provider_events (admin/history roles only)
DROP POLICY IF EXISTS "Notification provider events viewable by history roles"
  ON public.notification_provider_events;
CREATE POLICY "Notification provider events viewable by history roles"
  ON public.notification_provider_events
  FOR SELECT
  TO authenticated
  USING (
    church_id IS NOT NULL
    AND public.can_view_notification_history(church_id)
  );

-- ---------------------------------------------------------------------------
-- Grants (deliveries/provider events: SELECT only for authenticated)
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.notification_recipients TO authenticated;
GRANT SELECT ON public.notification_deliveries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.church_notification_settings TO authenticated;
GRANT SELECT ON public.notification_provider_events TO authenticated;

REVOKE DELETE ON public.notifications FROM authenticated;
REVOKE DELETE ON public.notification_recipients FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.notification_deliveries FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.notification_provider_events FROM authenticated;

-- ---------------------------------------------------------------------------
-- System email templates (safe defaults; church_id NULL = global)
-- Idempotent: skip keys that already exist.
-- ---------------------------------------------------------------------------

INSERT INTO public.notification_templates (
  church_id,
  template_key,
  name,
  description,
  channel,
  subject_template,
  body_text_template,
  body_html_template,
  severity,
  is_system_template,
  is_active,
  version,
  allowed_variables
)
SELECT *
FROM (
  VALUES
    (
      NULL::uuid,
      'incident.created',
      'Incident created',
      'Routine incident notification',
      'email',
      '[{{church_name}}] Incident reported: {{incident_title}}',
      E'Hello {{recipient_name}},\n\nAn incident has been reported at {{church_name}}{{campus_suffix}}.\n\nSeverity: {{incident_severity}}\nTime: {{incident_time}}\n\nSign in to review details:\n{{action_url}}\n\nDo not reply to this email.',
      '<p>Hello {{recipient_name}},</p><p>An incident has been reported at <strong>{{church_name}}</strong>{{campus_suffix}}.</p><p><strong>Severity:</strong> {{incident_severity}}<br/><strong>Time:</strong> {{incident_time}}</p><p><a href="{{action_url}}">Sign in to review details</a></p><p>Do not reply to this email.</p>',
      'medium',
      true,
      true,
      1,
      ARRAY['church_name','campus_name','campus_suffix','recipient_name','incident_title','incident_severity','incident_location','incident_time','action_url']::text[]
    ),
    (
      NULL::uuid,
      'incident.critical',
      'Critical incident',
      'Critical incident alert with minimal sensitive detail',
      'email',
      '[CRITICAL] {{church_name}} — incident requires attention',
      E'Hello {{recipient_name}},\n\nA critical incident has been reported at {{church_name}}{{campus_suffix}}.\n\nSign in to Sanctuary Protected immediately to review details:\n{{action_url}}\n\nThis is an operational security alert. Do not reply to this email.',
      '<p>Hello {{recipient_name}},</p><p><strong>A critical incident</strong> has been reported at <strong>{{church_name}}</strong>{{campus_suffix}}.</p><p><a href="{{action_url}}">Sign in to Sanctuary Protected</a> to review details.</p><p>This is an operational security alert. Do not reply to this email.</p>',
      'critical',
      true,
      true,
      1,
      ARRAY['church_name','campus_name','campus_suffix','recipient_name','incident_title','incident_severity','incident_time','action_url']::text[]
    ),
    (
      NULL::uuid,
      'incident.updated',
      'Incident updated',
      'Incident update notification',
      'email',
      '[{{church_name}}] Incident updated: {{incident_title}}',
      E'Hello {{recipient_name}},\n\nAn incident at {{church_name}}{{campus_suffix}} has been updated.\n\nSign in to review:\n{{action_url}}',
      '<p>Hello {{recipient_name}},</p><p>An incident at <strong>{{church_name}}</strong>{{campus_suffix}} has been updated.</p><p><a href="{{action_url}}">Sign in to review</a></p>',
      'medium',
      true,
      true,
      1,
      ARRAY['church_name','campus_name','campus_suffix','recipient_name','incident_title','action_url']::text[]
    ),
    (
      NULL::uuid,
      'incident.resolved',
      'Incident resolved',
      'Incident resolved notification',
      'email',
      '[{{church_name}}] Incident resolved: {{incident_title}}',
      E'Hello {{recipient_name}},\n\nAn incident at {{church_name}}{{campus_suffix}} has been marked resolved.\n\n{{action_url}}',
      '<p>Hello {{recipient_name}},</p><p>An incident at <strong>{{church_name}}</strong>{{campus_suffix}} has been marked resolved.</p><p><a href="{{action_url}}">View incident</a></p>',
      'low',
      true,
      true,
      1,
      ARRAY['church_name','campus_name','campus_suffix','recipient_name','incident_title','action_url']::text[]
    ),
    (
      NULL::uuid,
      'certification.expiring',
      'Certification expiring',
      'Certification expiration warning',
      'email',
      '[{{church_name}}] Certification expiring: {{certification_type}}',
      E'Hello {{recipient_name}},\n\nYour {{certification_type}} certification expires on {{expiration_date}}.\n\nReview in Sanctuary Protected:\n{{action_url}}',
      '<p>Hello {{recipient_name}},</p><p>Your <strong>{{certification_type}}</strong> certification expires on <strong>{{expiration_date}}</strong>.</p><p><a href="{{action_url}}">Review in Sanctuary Protected</a></p>',
      'medium',
      true,
      true,
      1,
      ARRAY['church_name','recipient_name','certification_type','expiration_date','action_url']::text[]
    ),
    (
      NULL::uuid,
      'certification.expired',
      'Certification expired',
      'Certification expired notification',
      'email',
      '[{{church_name}}] Certification expired: {{certification_type}}',
      E'Hello {{recipient_name}},\n\nYour {{certification_type}} certification expired on {{expiration_date}}.\n\n{{action_url}}',
      '<p>Hello {{recipient_name}},</p><p>Your <strong>{{certification_type}}</strong> certification expired on <strong>{{expiration_date}}</strong>.</p><p><a href="{{action_url}}">Review certifications</a></p>',
      'high',
      true,
      true,
      1,
      ARRAY['church_name','recipient_name','certification_type','expiration_date','action_url']::text[]
    ),
    (
      NULL::uuid,
      'equipment.maintenance_due',
      'Equipment maintenance due',
      'Hardware maintenance reminder',
      'email',
      '[{{church_name}}] Maintenance due: {{equipment_name}}',
      E'Hello {{recipient_name}},\n\nMaintenance is due for {{equipment_name}} at {{church_name}}.\n\n{{action_url}}',
      '<p>Hello {{recipient_name}},</p><p>Maintenance is due for <strong>{{equipment_name}}</strong> at <strong>{{church_name}}</strong>.</p><p><a href="{{action_url}}">View equipment</a></p>',
      'medium',
      true,
      true,
      1,
      ARRAY['church_name','recipient_name','equipment_name','action_url']::text[]
    ),
    (
      NULL::uuid,
      'equipment.out_of_service',
      'Equipment out of service',
      'Critical equipment out of service',
      'email',
      '[{{church_name}}] Equipment out of service: {{equipment_name}}',
      E'Hello {{recipient_name}},\n\n{{equipment_name}} at {{church_name}} is out of service.\n\n{{action_url}}',
      '<p>Hello {{recipient_name}},</p><p><strong>{{equipment_name}}</strong> at <strong>{{church_name}}</strong> is out of service.</p><p><a href="{{action_url}}">View equipment</a></p>',
      'high',
      true,
      true,
      1,
      ARRAY['church_name','recipient_name','equipment_name','action_url']::text[]
    ),
    (
      NULL::uuid,
      'membership.invited',
      'Team invitation',
      'Invitation sent notification',
      'email',
      '[{{church_name}}] Team invitation',
      E'Hello {{recipient_name}},\n\nYou have been invited to join {{church_name}} on Sanctuary Protected.\n\n{{action_url}}',
      '<p>Hello {{recipient_name}},</p><p>You have been invited to join <strong>{{church_name}}</strong> on Sanctuary Protected.</p><p><a href="{{action_url}}">Accept invitation</a></p>',
      'informational',
      true,
      true,
      1,
      ARRAY['church_name','recipient_name','action_url']::text[]
    ),
    (
      NULL::uuid,
      'membership.role_changed',
      'Role changed',
      'Membership role change notification',
      'email',
      '[{{church_name}}] Your role was updated',
      E'Hello {{recipient_name}},\n\nYour role at {{church_name}} was updated.\n\nSign in: {{action_url}}',
      '<p>Hello {{recipient_name}},</p><p>Your role at <strong>{{church_name}}</strong> was updated.</p><p><a href="{{action_url}}">Sign in</a></p>',
      'informational',
      true,
      true,
      1,
      ARRAY['church_name','recipient_name','action_url']::text[]
    ),
    (
      NULL::uuid,
      'notification.test',
      'Test email',
      'Administrative test email',
      'email',
      '[{{church_name}}] Sanctuary Protected test notification',
      E'Hello {{recipient_name}},\n\nThis is a test notification from Sanctuary Protected for {{church_name}}.\n\nIf you received this message, email delivery is configured correctly.',
      '<p>Hello {{recipient_name}},</p><p>This is a <strong>test notification</strong> from Sanctuary Protected for <strong>{{church_name}}</strong>.</p><p>If you received this message, email delivery is configured correctly.</p>',
      'informational',
      true,
      true,
      1,
      ARRAY['church_name','recipient_name']::text[]
    )
) AS seed (
  church_id,
  template_key,
  name,
  description,
  channel,
  subject_template,
  body_text_template,
  body_html_template,
  severity,
  is_system_template,
  is_active,
  version,
  allowed_variables
)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.notification_templates existing
  WHERE existing.church_id IS NULL
    AND existing.is_system_template = true
    AND existing.template_key = seed.template_key
    AND existing.channel = seed.channel
);
