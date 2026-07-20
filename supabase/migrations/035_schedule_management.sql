-- =============================================================================
-- 035_schedule_management.sql
-- Scheduling & calendar: events, shifts, assignments, unavailability,
-- templates, settings, change history, reminder dedupe keys.
-- Additive / non-destructive. Safe to re-run.
-- Review before applying to production Supabase (Phase 2 — do not auto-apply).
--
-- NAMING: schedule_events is distinct from public.events (security device alerts).
--
-- ROLE-PERMISSION MATRIX (application + RLS):
--   View calendar / events / shifts (non-draft as allowed)
--     → active member (viewer+)
--   Manage events, shifts, assignments, send schedule notifications
--     → owner | co_owner | administrator | security_leader
--   Override availability conflicts (with reason)
--     → owner | co_owner | administrator | security_leader
--   Manage templates + church schedule settings
--     → owner | co_owner | administrator
--   Respond to own assignment (accept/decline)
--     → assigned active member (self)
--   Manage own unavailability
--     → active member (self); leaders may create on behalf of members
--   View unavailability blocks (times only; notes restricted)
--     → self | owner | co_owner | administrator | security_leader
--   Permanent hard-delete of historical rows → not allowed in v1
--
-- RECURRENCE APPROACH (v1):
--   Store optional recurrence_rule (RFC 5545 RRULE subset) + recurrence_end_at
--   + parent_event_id / parent_unavailability_id for series linkage.
--   App expands a bounded window (default 12 months) into calendar instances.
--   Full series edit scopes (this / this_and_future / all) in later phases.
--   Weekly recurrence is the supported subset for Phase 3–5.
--
-- CONFLICT DETECTION:
--   App-primary in lib/schedule/conflicts.ts; SQL helpers below for staffing
--   refresh and optional overlap checks. Overriding inactive membership is
--   never allowed.
--
-- NOTIFICATION INTEGRATION:
--   No parallel email sender. App uses createNotification() with schedule.*
--   types. Reminder idempotency via schedule_reminder_keys.dedupe_key.
--   System email templates seeded at end of this migration.
--
-- MIGRATION RISKS:
--   - Large enum surface — additive only; renaming later is painful.
--   - Soft-cancel model means calendar queries must filter cancelled/archived.
--   - Assignments retain rows after membership removal (SET NULL FKs).
--   - Recurrence expansion is application-side; do not materialize unlimited rows.
--   - Apply AFTER 030 (co_owner) and 027–029 (notifications) on the target DB.
--   - Update ops_delete_user_by_email.sql when deploying (SET NULL covers most).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.schedule_event_type AS ENUM (
    'worship_service',
    'special_service',
    'youth_event',
    'children_event',
    'community_event',
    'wedding',
    'funeral',
    'concert',
    'conference',
    'training',
    'meeting',
    'security_drill',
    'maintenance',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.schedule_event_status AS ENUM (
    'draft',
    'scheduled',
    'confirmed',
    'cancelled',
    'completed',
    'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.schedule_risk_level AS ENUM (
    'low',
    'medium',
    'high',
    'critical'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.schedule_shift_type AS ENUM (
    'security',
    'medical',
    'parking',
    'entrance',
    'roaming',
    'camera_monitoring',
    'communications',
    'leadership',
    'setup',
    'cleanup',
    'training',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.schedule_shift_status AS ENUM (
    'draft',
    'open',
    'partially_staffed',
    'fully_staffed',
    'confirmed',
    'in_progress',
    'completed',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.schedule_priority AS ENUM (
    'low',
    'normal',
    'high',
    'critical'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.schedule_assignment_role AS ENUM (
    'team_lead',
    'security_member',
    'medical_responder',
    'parking',
    'door_monitor',
    'rover',
    'camera_monitor',
    'communications',
    'backup',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.schedule_assignment_status AS ENUM (
    'pending',
    'invited',
    'accepted',
    'confirmed',
    'declined',
    'cancelled',
    'completed',
    'no_show'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.schedule_unavailability_reason AS ENUM (
    'personal',
    'work',
    'travel',
    'medical',
    'vacation',
    'school',
    'family',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.schedule_unavailability_status AS ENUM (
    'active',
    'cancelled',
    'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.schedule_change_entity AS ENUM (
    'event',
    'shift',
    'assignment',
    'unavailability',
    'template',
    'settings'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Permission helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_manage_schedule(requested_church_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_church_role(
    requested_church_id,
    ARRAY['owner', 'co_owner', 'administrator', 'security_leader']
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_schedule_settings(requested_church_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_church_role(
    requested_church_id,
    ARRAY['owner', 'co_owner', 'administrator']
  );
$$;

CREATE OR REPLACE FUNCTION public.can_override_schedule_conflicts(requested_church_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_manage_schedule(requested_church_id);
$$;

CREATE OR REPLACE FUNCTION public.can_view_team_unavailability(requested_church_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_manage_schedule(requested_church_id);
$$;

REVOKE ALL ON FUNCTION public.can_manage_schedule(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_schedule_settings(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_override_schedule_conflicts(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_team_unavailability(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.can_manage_schedule(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_schedule_settings(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_override_schedule_conflicts(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_team_unavailability(uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- church_schedule_settings (1:1)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.church_schedule_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL UNIQUE REFERENCES public.churches (id) ON DELETE CASCADE,

  default_calendar_view text NOT NULL DEFAULT 'month'
    CHECK (default_calendar_view IN ('month', 'week', 'day', 'agenda')),
  week_starts_on smallint NOT NULL DEFAULT 0
    CHECK (week_starts_on BETWEEN 0 AND 6),
  default_event_duration_minutes integer NOT NULL DEFAULT 120
    CHECK (default_event_duration_minutes > 0 AND default_event_duration_minutes <= 10080),
  default_shift_duration_minutes integer NOT NULL DEFAULT 180
    CHECK (default_shift_duration_minutes > 0 AND default_shift_duration_minutes <= 10080),
  timezone text NOT NULL DEFAULT 'America/Los_Angeles',

  display_unavailable_periods boolean NOT NULL DEFAULT true,
  display_training_events boolean NOT NULL DEFAULT true,
  display_maintenance_events boolean NOT NULL DEFAULT true,

  require_assignment_confirmation boolean NOT NULL DEFAULT true,
  prevent_assignment_during_unavailability boolean NOT NULL DEFAULT true,
  allow_conflict_override boolean NOT NULL DEFAULT true,
  require_override_reason boolean NOT NULL DEFAULT true,
  enforce_certification_requirements boolean NOT NULL DEFAULT false,
  minimum_staffing_warning_enabled boolean NOT NULL DEFAULT true,

  -- Placeholders for later enforcement (stored, not enforced in v1)
  minimum_rest_minutes integer
    CHECK (minimum_rest_minutes IS NULL OR minimum_rest_minutes >= 0),
  maximum_weekly_hours numeric(5,2)
    CHECK (maximum_weekly_hours IS NULL OR maximum_weekly_hours > 0),

  assignment_invitation_email_enabled boolean NOT NULL DEFAULT true,
  assignment_confirmation_email_enabled boolean NOT NULL DEFAULT true,
  assignment_change_email_enabled boolean NOT NULL DEFAULT true,
  assignment_cancellation_email_enabled boolean NOT NULL DEFAULT true,
  default_first_reminder_minutes integer NOT NULL DEFAULT 1440
    CHECK (default_first_reminder_minutes >= 0),
  default_second_reminder_minutes integer NOT NULL DEFAULT 120
    CHECK (default_second_reminder_minutes >= 0),
  unfilled_shift_warning_minutes integer NOT NULL DEFAULT 2880
    CHECK (unfilled_shift_warning_minutes >= 0),
  schedule_digest_enabled boolean NOT NULL DEFAULT false,
  schedule_digest_day smallint NOT NULL DEFAULT 5
    CHECK (schedule_digest_day BETWEEN 0 AND 6),
  schedule_digest_time time NOT NULL DEFAULT time '18:00',

  members_may_create_unavailability boolean NOT NULL DEFAULT true,
  members_may_edit_future_unavailability boolean NOT NULL DEFAULT true,
  members_may_decline_assignments boolean NOT NULL DEFAULT true,
  decline_reason_required boolean NOT NULL DEFAULT false,
  members_may_view_team_schedule boolean NOT NULL DEFAULT true,
  members_may_volunteer_open_shifts boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

DROP TRIGGER IF EXISTS church_schedule_settings_updated_at
  ON public.church_schedule_settings;
CREATE TRIGGER church_schedule_settings_updated_at
  BEFORE UPDATE ON public.church_schedule_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.church_schedule_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view schedule settings" ON public.church_schedule_settings;
DROP POLICY IF EXISTS "Admins manage schedule settings" ON public.church_schedule_settings;

CREATE POLICY "Members view schedule settings"
  ON public.church_schedule_settings FOR SELECT TO authenticated
  USING (public.is_active_church_member(church_id));

CREATE POLICY "Admins manage schedule settings"
  ON public.church_schedule_settings FOR ALL TO authenticated
  USING (public.can_manage_schedule_settings(church_id))
  WITH CHECK (public.can_manage_schedule_settings(church_id));

GRANT SELECT ON public.church_schedule_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.church_schedule_settings TO authenticated;
REVOKE DELETE ON public.church_schedule_settings FROM authenticated;

-- Auto-create settings row for new churches
CREATE OR REPLACE FUNCTION public.ensure_church_schedule_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.church_schedule_settings (church_id, timezone)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(trim(NEW.timezone), ''), 'America/Los_Angeles')
  )
  ON CONFLICT (church_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS churches_ensure_schedule_settings ON public.churches;
CREATE TRIGGER churches_ensure_schedule_settings
  AFTER INSERT ON public.churches
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_church_schedule_settings();

-- Backfill existing churches
INSERT INTO public.church_schedule_settings (church_id, timezone)
SELECT c.id, COALESCE(NULLIF(trim(c.timezone), ''), 'America/Los_Angeles')
FROM public.churches c
WHERE NOT EXISTS (
  SELECT 1 FROM public.church_schedule_settings s WHERE s.church_id = c.id
);

-- ---------------------------------------------------------------------------
-- schedule_events
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.schedule_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  campus_id uuid REFERENCES public.campuses (id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  event_type public.schedule_event_type NOT NULL DEFAULT 'other',
  status public.schedule_event_status NOT NULL DEFAULT 'scheduled',
  location_name text,
  building text,
  room text,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  all_day boolean NOT NULL DEFAULT false,
  timezone text NOT NULL DEFAULT 'America/Los_Angeles',
  recurrence_rule text,
  recurrence_end_at timestamptz,
  parent_event_id uuid REFERENCES public.schedule_events (id) ON DELETE SET NULL,
  security_coverage_required boolean NOT NULL DEFAULT true,
  estimated_attendance integer CHECK (
    estimated_attendance IS NULL OR estimated_attendance >= 0
  ),
  risk_level public.schedule_risk_level NOT NULL DEFAULT 'low',
  recommended_notification_group_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  archived_at timestamptz,
  CONSTRAINT schedule_events_title_len CHECK (char_length(title) BETWEEN 1 AND 200),
  CONSTRAINT schedule_events_description_len CHECK (
    description IS NULL OR char_length(description) <= 8000
  ),
  CONSTRAINT schedule_events_time_range CHECK (start_at < end_at),
  CONSTRAINT schedule_events_recurrence_end CHECK (
    recurrence_end_at IS NULL OR recurrence_end_at >= start_at
  ),
  CONSTRAINT schedule_events_rrule_len CHECK (
    recurrence_rule IS NULL OR char_length(recurrence_rule) <= 500
  )
);

CREATE INDEX IF NOT EXISTS schedule_events_church_start_idx
  ON public.schedule_events (church_id, start_at);
CREATE INDEX IF NOT EXISTS schedule_events_church_status_idx
  ON public.schedule_events (church_id, status);
CREATE INDEX IF NOT EXISTS schedule_events_campus_idx
  ON public.schedule_events (campus_id)
  WHERE campus_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS schedule_events_parent_idx
  ON public.schedule_events (parent_event_id)
  WHERE parent_event_id IS NOT NULL;

DROP TRIGGER IF EXISTS schedule_events_updated_at ON public.schedule_events;
CREATE TRIGGER schedule_events_updated_at
  BEFORE UPDATE ON public.schedule_events
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.enforce_schedule_event_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_campus_church uuid;
  v_parent_church uuid;
BEGIN
  IF NEW.campus_id IS NOT NULL THEN
    SELECT church_id INTO v_campus_church
    FROM public.campuses WHERE id = NEW.campus_id;
    IF v_campus_church IS NULL OR v_campus_church <> NEW.church_id THEN
      RAISE EXCEPTION 'SCHEDULE_CAMPUS_CHURCH_MISMATCH';
    END IF;
  END IF;

  IF NEW.parent_event_id IS NOT NULL THEN
    SELECT church_id INTO v_parent_church
    FROM public.schedule_events WHERE id = NEW.parent_event_id;
    IF v_parent_church IS NULL OR v_parent_church <> NEW.church_id THEN
      RAISE EXCEPTION 'SCHEDULE_PARENT_EVENT_CHURCH_MISMATCH';
    END IF;
  END IF;

  IF NEW.status = 'cancelled'::public.schedule_event_status
     AND NEW.cancelled_at IS NULL THEN
    NEW.cancelled_at := now();
  END IF;

  IF NEW.status = 'archived'::public.schedule_event_status
     AND NEW.archived_at IS NULL THEN
    NEW.archived_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS schedule_events_enforce_scope ON public.schedule_events;
CREATE TRIGGER schedule_events_enforce_scope
  BEFORE INSERT OR UPDATE ON public.schedule_events
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_schedule_event_scope();

ALTER TABLE public.schedule_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view schedule events" ON public.schedule_events;
DROP POLICY IF EXISTS "Managers insert schedule events" ON public.schedule_events;
DROP POLICY IF EXISTS "Managers update schedule events" ON public.schedule_events;

CREATE POLICY "Members view schedule events"
  ON public.schedule_events FOR SELECT TO authenticated
  USING (
    public.is_active_church_member(church_id)
    AND (
      status <> 'draft'::public.schedule_event_status
      OR public.can_manage_schedule(church_id)
      OR created_by = auth.uid()
    )
  );

CREATE POLICY "Managers insert schedule events"
  ON public.schedule_events FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_schedule(church_id));

CREATE POLICY "Managers update schedule events"
  ON public.schedule_events FOR UPDATE TO authenticated
  USING (public.can_manage_schedule(church_id))
  WITH CHECK (public.can_manage_schedule(church_id));

-- No DELETE policy for authenticated — soft-cancel only
GRANT SELECT, INSERT, UPDATE ON public.schedule_events TO authenticated;
REVOKE DELETE ON public.schedule_events FROM authenticated;

-- ---------------------------------------------------------------------------
-- schedule_shifts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.schedule_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  campus_id uuid REFERENCES public.campuses (id) ON DELETE SET NULL,
  event_id uuid REFERENCES public.schedule_events (id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  shift_type public.schedule_shift_type NOT NULL DEFAULT 'security',
  status public.schedule_shift_status NOT NULL DEFAULT 'open',
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'America/Los_Angeles',
  location_name text,
  building text,
  room text,
  required_member_count integer NOT NULL DEFAULT 1
    CHECK (required_member_count >= 0 AND required_member_count <= 500),
  minimum_certified_member_count integer NOT NULL DEFAULT 0
    CHECK (minimum_certified_member_count >= 0 AND minimum_certified_member_count <= 500),
  required_certifications text[] NOT NULL DEFAULT '{}'::text[],
  lead_member_required boolean NOT NULL DEFAULT false,
  priority public.schedule_priority NOT NULL DEFAULT 'normal',
  notes text,
  allow_outside_event_window boolean NOT NULL DEFAULT false,
  recommended_notification_group_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  confirmed_assignment_count integer NOT NULL DEFAULT 0
    CHECK (confirmed_assignment_count >= 0),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  archived_at timestamptz,
  CONSTRAINT schedule_shifts_title_len CHECK (char_length(title) BETWEEN 1 AND 200),
  CONSTRAINT schedule_shifts_description_len CHECK (
    description IS NULL OR char_length(description) <= 4000
  ),
  CONSTRAINT schedule_shifts_notes_len CHECK (
    notes IS NULL OR char_length(notes) <= 4000
  ),
  CONSTRAINT schedule_shifts_time_range CHECK (start_at < end_at),
  CONSTRAINT schedule_shifts_certified_lte_required CHECK (
    minimum_certified_member_count <= required_member_count
  )
);

CREATE INDEX IF NOT EXISTS schedule_shifts_church_start_idx
  ON public.schedule_shifts (church_id, start_at);
CREATE INDEX IF NOT EXISTS schedule_shifts_event_idx
  ON public.schedule_shifts (event_id)
  WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS schedule_shifts_church_status_idx
  ON public.schedule_shifts (church_id, status);

DROP TRIGGER IF EXISTS schedule_shifts_updated_at ON public.schedule_shifts;
CREATE TRIGGER schedule_shifts_updated_at
  BEFORE UPDATE ON public.schedule_shifts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.enforce_schedule_shift_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_event public.schedule_events%ROWTYPE;
  v_campus_church uuid;
BEGIN
  IF NEW.campus_id IS NOT NULL THEN
    SELECT church_id INTO v_campus_church
    FROM public.campuses WHERE id = NEW.campus_id;
    IF v_campus_church IS NULL OR v_campus_church <> NEW.church_id THEN
      RAISE EXCEPTION 'SCHEDULE_CAMPUS_CHURCH_MISMATCH';
    END IF;
  END IF;

  IF NEW.event_id IS NOT NULL THEN
    SELECT * INTO v_event FROM public.schedule_events WHERE id = NEW.event_id;
    IF v_event.id IS NULL THEN
      RAISE EXCEPTION 'SCHEDULE_EVENT_NOT_FOUND';
    END IF;
    IF v_event.church_id <> NEW.church_id THEN
      RAISE EXCEPTION 'SCHEDULE_EVENT_CHURCH_MISMATCH';
    END IF;
    IF NOT NEW.allow_outside_event_window THEN
      IF NEW.start_at < v_event.start_at OR NEW.end_at > v_event.end_at THEN
        RAISE EXCEPTION 'SCHEDULE_SHIFT_OUTSIDE_EVENT_WINDOW';
      END IF;
    END IF;
  END IF;

  IF NEW.status = 'cancelled'::public.schedule_shift_status
     AND NEW.cancelled_at IS NULL THEN
    NEW.cancelled_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS schedule_shifts_enforce_scope ON public.schedule_shifts;
CREATE TRIGGER schedule_shifts_enforce_scope
  BEFORE INSERT OR UPDATE ON public.schedule_shifts
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_schedule_shift_scope();

ALTER TABLE public.schedule_shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view schedule shifts" ON public.schedule_shifts;
DROP POLICY IF EXISTS "Managers insert schedule shifts" ON public.schedule_shifts;
DROP POLICY IF EXISTS "Managers update schedule shifts" ON public.schedule_shifts;

CREATE POLICY "Members view schedule shifts"
  ON public.schedule_shifts FOR SELECT TO authenticated
  USING (
    public.is_active_church_member(church_id)
    AND (
      status <> 'draft'::public.schedule_shift_status
      OR public.can_manage_schedule(church_id)
      OR created_by = auth.uid()
    )
  );

CREATE POLICY "Managers insert schedule shifts"
  ON public.schedule_shifts FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_schedule(church_id));

CREATE POLICY "Managers update schedule shifts"
  ON public.schedule_shifts FOR UPDATE TO authenticated
  USING (public.can_manage_schedule(church_id))
  WITH CHECK (public.can_manage_schedule(church_id));

GRANT SELECT, INSERT, UPDATE ON public.schedule_shifts TO authenticated;
REVOKE DELETE ON public.schedule_shifts FROM authenticated;

-- ---------------------------------------------------------------------------
-- shift_assignments
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.shift_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  shift_id uuid NOT NULL REFERENCES public.schedule_shifts (id) ON DELETE CASCADE,
  membership_id uuid REFERENCES public.church_memberships (id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  assignment_role public.schedule_assignment_role NOT NULL DEFAULT 'security_member',
  status public.schedule_assignment_status NOT NULL DEFAULT 'invited',
  assigned_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  confirmed_at timestamptz,
  declined_at timestamptz,
  cancelled_at timestamptz,
  check_in_at timestamptz,
  check_out_at timestamptz,
  notes text,
  decline_note text,
  conflict_override boolean NOT NULL DEFAULT false,
  conflict_override_reason text,
  conflict_overridden_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shift_assignments_notes_len CHECK (
    notes IS NULL OR char_length(notes) <= 2000
  ),
  CONSTRAINT shift_assignments_decline_note_len CHECK (
    decline_note IS NULL OR char_length(decline_note) <= 2000
  ),
  CONSTRAINT shift_assignments_override_reason_len CHECK (
    conflict_override_reason IS NULL OR char_length(conflict_override_reason) <= 2000
  ),
  CONSTRAINT shift_assignments_override_requires_reason CHECK (
    NOT conflict_override
    OR (
      conflict_override_reason IS NOT NULL
      AND char_length(trim(conflict_override_reason)) >= 3
    )
  ),
  CONSTRAINT shift_assignments_member_present CHECK (
    membership_id IS NOT NULL OR user_id IS NOT NULL
  )
);

-- One active assignment per member per shift
CREATE UNIQUE INDEX IF NOT EXISTS shift_assignments_active_membership_uidx
  ON public.shift_assignments (shift_id, membership_id)
  WHERE membership_id IS NOT NULL
    AND status NOT IN (
      'declined'::public.schedule_assignment_status,
      'cancelled'::public.schedule_assignment_status
    );

CREATE UNIQUE INDEX IF NOT EXISTS shift_assignments_active_user_uidx
  ON public.shift_assignments (shift_id, user_id)
  WHERE user_id IS NOT NULL
    AND status NOT IN (
      'declined'::public.schedule_assignment_status,
      'cancelled'::public.schedule_assignment_status
    );

CREATE INDEX IF NOT EXISTS shift_assignments_church_user_idx
  ON public.shift_assignments (church_id, user_id, status);
CREATE INDEX IF NOT EXISTS shift_assignments_shift_status_idx
  ON public.shift_assignments (shift_id, status);
CREATE INDEX IF NOT EXISTS shift_assignments_membership_idx
  ON public.shift_assignments (membership_id)
  WHERE membership_id IS NOT NULL;

DROP TRIGGER IF EXISTS shift_assignments_updated_at ON public.shift_assignments;
CREATE TRIGGER shift_assignments_updated_at
  BEFORE UPDATE ON public.shift_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.enforce_shift_assignment_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_shift public.schedule_shifts%ROWTYPE;
  v_membership public.church_memberships%ROWTYPE;
BEGIN
  SELECT * INTO v_shift FROM public.schedule_shifts WHERE id = NEW.shift_id;
  IF v_shift.id IS NULL THEN
    RAISE EXCEPTION 'SCHEDULE_SHIFT_NOT_FOUND';
  END IF;
  IF v_shift.church_id <> NEW.church_id THEN
    RAISE EXCEPTION 'SCHEDULE_ASSIGNMENT_CHURCH_MISMATCH';
  END IF;

  IF TG_OP = 'INSERT'
     AND v_shift.status = 'cancelled'::public.schedule_shift_status THEN
    RAISE EXCEPTION 'SCHEDULE_SHIFT_CANCELLED';
  END IF;

  IF NEW.membership_id IS NOT NULL THEN
    SELECT * INTO v_membership
    FROM public.church_memberships WHERE id = NEW.membership_id;
    IF v_membership.id IS NULL THEN
      RAISE EXCEPTION 'SCHEDULE_MEMBERSHIP_NOT_FOUND';
    END IF;
    IF v_membership.church_id <> NEW.church_id THEN
      RAISE EXCEPTION 'SCHEDULE_MEMBERSHIP_CHURCH_MISMATCH';
    END IF;
    IF NEW.user_id IS NULL THEN
      NEW.user_id := v_membership.user_id;
    ELSIF NEW.user_id <> v_membership.user_id THEN
      RAISE EXCEPTION 'SCHEDULE_MEMBERSHIP_USER_MISMATCH';
    END IF;

    -- New assignments require active membership
    IF TG_OP = 'INSERT'
       AND v_membership.status <> 'active'::public.membership_status THEN
      RAISE EXCEPTION 'SCHEDULE_MEMBERSHIP_INACTIVE';
    END IF;
  END IF;

  IF NEW.status = 'declined'::public.schedule_assignment_status
     AND NEW.declined_at IS NULL THEN
    NEW.declined_at := now();
    NEW.responded_at := COALESCE(NEW.responded_at, now());
  END IF;

  IF NEW.status IN (
       'accepted'::public.schedule_assignment_status,
       'confirmed'::public.schedule_assignment_status
     )
     AND NEW.confirmed_at IS NULL
     AND NEW.status = 'confirmed'::public.schedule_assignment_status THEN
    NEW.confirmed_at := now();
    NEW.responded_at := COALESCE(NEW.responded_at, now());
  END IF;

  IF NEW.status = 'accepted'::public.schedule_assignment_status
     AND NEW.responded_at IS NULL THEN
    NEW.responded_at := now();
  END IF;

  IF NEW.status = 'cancelled'::public.schedule_assignment_status
     AND NEW.cancelled_at IS NULL THEN
    NEW.cancelled_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shift_assignments_enforce_scope ON public.shift_assignments;
CREATE TRIGGER shift_assignments_enforce_scope
  BEFORE INSERT OR UPDATE ON public.shift_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_shift_assignment_scope();

-- Staffing count refresh
CREATE OR REPLACE FUNCTION public.refresh_shift_staffing_status(p_shift_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shift public.schedule_shifts%ROWTYPE;
  v_count integer;
  v_new_status public.schedule_shift_status;
BEGIN
  SELECT * INTO v_shift FROM public.schedule_shifts WHERE id = p_shift_id;
  IF v_shift.id IS NULL THEN
    RETURN;
  END IF;

  IF v_shift.status IN (
    'cancelled'::public.schedule_shift_status,
    'completed'::public.schedule_shift_status,
    'draft'::public.schedule_shift_status,
    'in_progress'::public.schedule_shift_status
  ) THEN
    UPDATE public.schedule_shifts s
    SET confirmed_assignment_count = (
      SELECT COUNT(*)::integer
      FROM public.shift_assignments a
      WHERE a.shift_id = p_shift_id
        AND a.status IN (
          'accepted'::public.schedule_assignment_status,
          'confirmed'::public.schedule_assignment_status,
          'completed'::public.schedule_assignment_status
        )
    )
    WHERE s.id = p_shift_id;
    RETURN;
  END IF;

  SELECT COUNT(*)::integer INTO v_count
  FROM public.shift_assignments a
  WHERE a.shift_id = p_shift_id
    AND a.status IN (
      'accepted'::public.schedule_assignment_status,
      'confirmed'::public.schedule_assignment_status,
      'completed'::public.schedule_assignment_status
    );

  IF v_shift.required_member_count = 0 THEN
    v_new_status := 'fully_staffed'::public.schedule_shift_status;
  ELSIF v_count <= 0 THEN
    v_new_status := 'open'::public.schedule_shift_status;
  ELSIF v_count < v_shift.required_member_count THEN
    v_new_status := 'partially_staffed'::public.schedule_shift_status;
  ELSE
    v_new_status := CASE
      WHEN v_shift.status = 'confirmed'::public.schedule_shift_status
        THEN 'confirmed'::public.schedule_shift_status
      ELSE 'fully_staffed'::public.schedule_shift_status
    END;
  END IF;

  UPDATE public.schedule_shifts
  SET
    confirmed_assignment_count = v_count,
    status = v_new_status,
    updated_at = now()
  WHERE id = p_shift_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_refresh_shift_staffing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_shift_staffing_status(OLD.shift_id);
    RETURN OLD;
  END IF;
  PERFORM public.refresh_shift_staffing_status(NEW.shift_id);
  IF TG_OP = 'UPDATE' AND OLD.shift_id IS DISTINCT FROM NEW.shift_id THEN
    PERFORM public.refresh_shift_staffing_status(OLD.shift_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shift_assignments_refresh_staffing ON public.shift_assignments;
CREATE TRIGGER shift_assignments_refresh_staffing
  AFTER INSERT OR UPDATE OR DELETE ON public.shift_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_refresh_shift_staffing();

REVOKE ALL ON FUNCTION public.refresh_shift_staffing_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_shift_staffing_status(uuid)
  TO authenticated, service_role;

ALTER TABLE public.shift_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view shift assignments" ON public.shift_assignments;
DROP POLICY IF EXISTS "Managers insert shift assignments" ON public.shift_assignments;
DROP POLICY IF EXISTS "Managers update shift assignments" ON public.shift_assignments;
DROP POLICY IF EXISTS "Members respond to own assignments" ON public.shift_assignments;

CREATE POLICY "Members view shift assignments"
  ON public.shift_assignments FOR SELECT TO authenticated
  USING (
    public.is_active_church_member(church_id)
    AND (
      public.can_manage_schedule(church_id)
      OR user_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.church_schedule_settings s
        WHERE s.church_id = shift_assignments.church_id
          AND s.members_may_view_team_schedule = true
      )
    )
  );

CREATE POLICY "Managers insert shift assignments"
  ON public.shift_assignments FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_schedule(church_id));

CREATE POLICY "Managers update shift assignments"
  ON public.shift_assignments FOR UPDATE TO authenticated
  USING (public.can_manage_schedule(church_id))
  WITH CHECK (public.can_manage_schedule(church_id));

-- Members may update response fields on their own rows (app still validates columns)
CREATE POLICY "Members respond to own assignments"
  ON public.shift_assignments FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND public.is_active_church_member(church_id)
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_active_church_member(church_id)
  );

GRANT SELECT, INSERT, UPDATE ON public.shift_assignments TO authenticated;
REVOKE DELETE ON public.shift_assignments FROM authenticated;

-- ---------------------------------------------------------------------------
-- member_unavailability
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.member_unavailability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  membership_id uuid NOT NULL REFERENCES public.church_memberships (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  title text,
  reason_category public.schedule_unavailability_reason NOT NULL DEFAULT 'personal',
  notes text,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  all_day boolean NOT NULL DEFAULT false,
  timezone text NOT NULL DEFAULT 'America/Los_Angeles',
  recurrence_rule text,
  recurrence_end_at timestamptz,
  parent_unavailability_id uuid REFERENCES public.member_unavailability (id)
    ON DELETE SET NULL,
  status public.schedule_unavailability_status NOT NULL DEFAULT 'active',
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  CONSTRAINT member_unavailability_title_len CHECK (
    title IS NULL OR char_length(title) <= 200
  ),
  CONSTRAINT member_unavailability_notes_len CHECK (
    notes IS NULL OR char_length(notes) <= 2000
  ),
  CONSTRAINT member_unavailability_time_range CHECK (start_at < end_at),
  CONSTRAINT member_unavailability_rrule_len CHECK (
    recurrence_rule IS NULL OR char_length(recurrence_rule) <= 500
  )
);

CREATE INDEX IF NOT EXISTS member_unavailability_church_range_idx
  ON public.member_unavailability (church_id, start_at, end_at);
CREATE INDEX IF NOT EXISTS member_unavailability_user_idx
  ON public.member_unavailability (church_id, user_id, status);
CREATE INDEX IF NOT EXISTS member_unavailability_membership_idx
  ON public.member_unavailability (membership_id, status);

DROP TRIGGER IF EXISTS member_unavailability_updated_at ON public.member_unavailability;
CREATE TRIGGER member_unavailability_updated_at
  BEFORE UPDATE ON public.member_unavailability
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.enforce_member_unavailability_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_membership public.church_memberships%ROWTYPE;
BEGIN
  SELECT * INTO v_membership
  FROM public.church_memberships WHERE id = NEW.membership_id;

  IF v_membership.id IS NULL THEN
    RAISE EXCEPTION 'SCHEDULE_MEMBERSHIP_NOT_FOUND';
  END IF;
  IF v_membership.church_id <> NEW.church_id THEN
    RAISE EXCEPTION 'SCHEDULE_MEMBERSHIP_CHURCH_MISMATCH';
  END IF;
  IF NEW.user_id <> v_membership.user_id THEN
    RAISE EXCEPTION 'SCHEDULE_MEMBERSHIP_USER_MISMATCH';
  END IF;

  IF NEW.status = 'cancelled'::public.schedule_unavailability_status
     AND NEW.cancelled_at IS NULL THEN
    NEW.cancelled_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS member_unavailability_enforce_scope
  ON public.member_unavailability;
CREATE TRIGGER member_unavailability_enforce_scope
  BEFORE INSERT OR UPDATE ON public.member_unavailability
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_member_unavailability_scope();

ALTER TABLE public.member_unavailability ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View unavailability" ON public.member_unavailability;
DROP POLICY IF EXISTS "Insert own or managed unavailability" ON public.member_unavailability;
DROP POLICY IF EXISTS "Update own or managed unavailability" ON public.member_unavailability;

-- Notes are still selected by SQL; app must omit notes for non-owners of the row.
CREATE POLICY "View unavailability"
  ON public.member_unavailability FOR SELECT TO authenticated
  USING (
    public.is_active_church_member(church_id)
    AND (
      user_id = auth.uid()
      OR public.can_view_team_unavailability(church_id)
    )
  );

CREATE POLICY "Insert own or managed unavailability"
  ON public.member_unavailability FOR INSERT TO authenticated
  WITH CHECK (
    public.is_active_church_member(church_id)
    AND (
      (
        user_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.church_schedule_settings s
          WHERE s.church_id = member_unavailability.church_id
            AND s.members_may_create_unavailability = true
        )
      )
      OR public.can_manage_schedule(church_id)
    )
  );

CREATE POLICY "Update own or managed unavailability"
  ON public.member_unavailability FOR UPDATE TO authenticated
  USING (
    public.is_active_church_member(church_id)
    AND (
      user_id = auth.uid()
      OR public.can_manage_schedule(church_id)
    )
  )
  WITH CHECK (
    public.is_active_church_member(church_id)
    AND (
      user_id = auth.uid()
      OR public.can_manage_schedule(church_id)
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.member_unavailability TO authenticated;
REVOKE DELETE ON public.member_unavailability FROM authenticated;

-- ---------------------------------------------------------------------------
-- schedule_templates
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.schedule_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  campus_id uuid REFERENCES public.campuses (id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  event_type public.schedule_event_type NOT NULL DEFAULT 'worship_service',
  default_duration_minutes integer NOT NULL DEFAULT 120
    CHECK (default_duration_minutes > 0 AND default_duration_minutes <= 10080),
  default_location text,
  -- Structured JSON only (validated in app). Example shape:
  -- [{"title":"Setup","shift_type":"setup","offset_minutes":-90,"duration_minutes":90,"required_member_count":2}]
  default_shift_definitions jsonb NOT NULL DEFAULT '[]'::jsonb,
  default_required_group_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  default_notification_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT schedule_templates_name_len CHECK (char_length(name) BETWEEN 1 AND 200),
  CONSTRAINT schedule_templates_description_len CHECK (
    description IS NULL OR char_length(description) <= 4000
  ),
  CONSTRAINT schedule_templates_shift_defs_is_array CHECK (
    jsonb_typeof(default_shift_definitions) = 'array'
  ),
  CONSTRAINT schedule_templates_notif_settings_is_object CHECK (
    jsonb_typeof(default_notification_settings) = 'object'
  )
);

CREATE INDEX IF NOT EXISTS schedule_templates_church_idx
  ON public.schedule_templates (church_id, is_active);

DROP TRIGGER IF EXISTS schedule_templates_updated_at ON public.schedule_templates;
CREATE TRIGGER schedule_templates_updated_at
  BEFORE UPDATE ON public.schedule_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.schedule_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers view schedule templates" ON public.schedule_templates;
DROP POLICY IF EXISTS "Admins manage schedule templates" ON public.schedule_templates;

CREATE POLICY "Managers view schedule templates"
  ON public.schedule_templates FOR SELECT TO authenticated
  USING (public.can_manage_schedule(church_id));

CREATE POLICY "Admins manage schedule templates"
  ON public.schedule_templates FOR ALL TO authenticated
  USING (public.can_manage_schedule_settings(church_id))
  WITH CHECK (public.can_manage_schedule_settings(church_id));

GRANT SELECT ON public.schedule_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_templates TO authenticated;

-- ---------------------------------------------------------------------------
-- schedule_change_history (append-oriented)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.schedule_change_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  entity_type public.schedule_change_entity NOT NULL,
  entity_id uuid NOT NULL,
  event_id uuid REFERENCES public.schedule_events (id) ON DELETE SET NULL,
  shift_id uuid REFERENCES public.schedule_shifts (id) ON DELETE SET NULL,
  assignment_id uuid REFERENCES public.shift_assignments (id) ON DELETE SET NULL,
  action text NOT NULL,
  summary text,
  changed_fields text[] NOT NULL DEFAULT '{}'::text[],
  previous_values jsonb,
  new_values jsonb,
  actor_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT schedule_change_history_action_len CHECK (char_length(action) BETWEEN 1 AND 100),
  CONSTRAINT schedule_change_history_summary_len CHECK (
    summary IS NULL OR char_length(summary) <= 500
  )
);

CREATE INDEX IF NOT EXISTS schedule_change_history_church_idx
  ON public.schedule_change_history (church_id, created_at DESC);
CREATE INDEX IF NOT EXISTS schedule_change_history_entity_idx
  ON public.schedule_change_history (entity_type, entity_id, created_at DESC);

ALTER TABLE public.schedule_change_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers view schedule history" ON public.schedule_change_history;
DROP POLICY IF EXISTS "Managers insert schedule history" ON public.schedule_change_history;

CREATE POLICY "Managers view schedule history"
  ON public.schedule_change_history FOR SELECT TO authenticated
  USING (public.can_manage_schedule(church_id));

CREATE POLICY "Managers insert schedule history"
  ON public.schedule_change_history FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_schedule(church_id)
    OR (
      public.is_active_church_member(church_id)
      AND actor_user_id = auth.uid()
    )
  );

-- No UPDATE/DELETE for authenticated
GRANT SELECT, INSERT ON public.schedule_change_history TO authenticated;
REVOKE UPDATE, DELETE ON public.schedule_change_history FROM authenticated;

-- ---------------------------------------------------------------------------
-- schedule_reminder_keys (dedupe for cron reminders)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.schedule_reminder_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  dedupe_key text NOT NULL,
  notification_id uuid REFERENCES public.notifications (id) ON DELETE SET NULL,
  shift_id uuid REFERENCES public.schedule_shifts (id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES public.shift_assignments (id) ON DELETE CASCADE,
  reminder_kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT schedule_reminder_keys_key_len CHECK (char_length(dedupe_key) BETWEEN 1 AND 300),
  CONSTRAINT schedule_reminder_keys_kind_len CHECK (char_length(reminder_kind) BETWEEN 1 AND 80),
  CONSTRAINT schedule_reminder_keys_dedupe_uidx UNIQUE (church_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS schedule_reminder_keys_shift_idx
  ON public.schedule_reminder_keys (shift_id)
  WHERE shift_id IS NOT NULL;

ALTER TABLE public.schedule_reminder_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers view reminder keys" ON public.schedule_reminder_keys;

CREATE POLICY "Managers view reminder keys"
  ON public.schedule_reminder_keys FOR SELECT TO authenticated
  USING (public.can_manage_schedule(church_id));

-- Inserts performed by service_role / SECURITY DEFINER jobs only
GRANT SELECT ON public.schedule_reminder_keys TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.schedule_reminder_keys FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_reminder_keys TO service_role;

-- ---------------------------------------------------------------------------
-- Overlap helper (used by app / optional RPC)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.schedule_ranges_overlap(
  a_start timestamptz,
  a_end timestamptz,
  b_start timestamptz,
  b_end timestamptz
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT a_start < b_end AND b_start < a_end;
$$;

REVOKE ALL ON FUNCTION public.schedule_ranges_overlap(
  timestamptz, timestamptz, timestamptz, timestamptz
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.schedule_ranges_overlap(
  timestamptz, timestamptz, timestamptz, timestamptz
) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- System email templates for schedule notifications
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
      'schedule.assignment_created',
      'Schedule assignment invitation',
      'Sent when a member is assigned to a shift',
      'email',
      '[{{church_name}}] You are scheduled: {{shift_title}}',
      E'Hello {{recipient_name}},\n\nYou have been assigned to a security shift at {{church_name}}.\n\nShift: {{shift_title}}\nEvent: {{event_title}}\nWhen: {{shift_start}} – {{shift_end}}\nCampus: {{campus_name}}\nLocation: {{location_name}}\nRole: {{assignment_role}}\n\n{{custom_message}}\n\nSign in to review and respond:\n{{action_url}}\n\nDo not reply to this email.',
      '<p>Hello {{recipient_name}},</p><p>You have been assigned to a security shift at <strong>{{church_name}}</strong>.</p><p><strong>Shift:</strong> {{shift_title}}<br/><strong>Event:</strong> {{event_title}}<br/><strong>When:</strong> {{shift_start}} – {{shift_end}}<br/><strong>Campus:</strong> {{campus_name}}<br/><strong>Location:</strong> {{location_name}}<br/><strong>Role:</strong> {{assignment_role}}</p><p>{{custom_message}}</p><p><a href="{{action_url}}">Review and respond in Sanctuary Protected</a></p><p>Do not reply to this email.</p>',
      'medium',
      true,
      true,
      1,
      ARRAY['church_name','recipient_name','shift_title','event_title','shift_start','shift_end','campus_name','location_name','assignment_role','custom_message','action_url']::text[]
    ),
    (
      NULL::uuid,
      'schedule.assignment_changed',
      'Schedule assignment changed',
      'Sent when an assignment time, role, or details change',
      'email',
      '[{{church_name}}] Schedule change: {{shift_title}}',
      E'Hello {{recipient_name}},\n\nYour assignment at {{church_name}} has changed.\n\nShift: {{shift_title}}\nWhen: {{shift_start}} – {{shift_end}}\n\n{{custom_message}}\n\nDetails:\n{{action_url}}\n\nDo not reply to this email.',
      '<p>Hello {{recipient_name}},</p><p>Your assignment at <strong>{{church_name}}</strong> has changed.</p><p><strong>Shift:</strong> {{shift_title}}<br/><strong>When:</strong> {{shift_start}} – {{shift_end}}</p><p>{{custom_message}}</p><p><a href="{{action_url}}">View details</a></p><p>Do not reply to this email.</p>',
      'medium',
      true,
      true,
      1,
      ARRAY['church_name','recipient_name','shift_title','event_title','shift_start','shift_end','custom_message','action_url']::text[]
    ),
    (
      NULL::uuid,
      'schedule.assignment_cancelled',
      'Schedule assignment cancelled',
      'Sent when an assignment is cancelled',
      'email',
      '[{{church_name}}] Assignment cancelled: {{shift_title}}',
      E'Hello {{recipient_name}},\n\nYour assignment for {{shift_title}} at {{church_name}} has been cancelled.\n\nOriginally: {{shift_start}} – {{shift_end}}\n\n{{custom_message}}\n\n{{action_url}}\n\nDo not reply to this email.',
      '<p>Hello {{recipient_name}},</p><p>Your assignment for <strong>{{shift_title}}</strong> at <strong>{{church_name}}</strong> has been cancelled.</p><p><strong>Originally:</strong> {{shift_start}} – {{shift_end}}</p><p>{{custom_message}}</p><p><a href="{{action_url}}">Open Sanctuary Protected</a></p><p>Do not reply to this email.</p>',
      'high',
      true,
      true,
      1,
      ARRAY['church_name','recipient_name','shift_title','shift_start','shift_end','custom_message','action_url']::text[]
    ),
    (
      NULL::uuid,
      'schedule.assignment_reminder',
      'Upcoming shift reminder',
      'Sent before an upcoming confirmed or accepted shift',
      'email',
      '[{{church_name}}] Reminder: {{shift_title}} starts {{shift_start}}',
      E'Hello {{recipient_name}},\n\nThis is a reminder of your upcoming shift at {{church_name}}.\n\nShift: {{shift_title}}\nWhen: {{shift_start}} – {{shift_end}}\nLocation: {{location_name}}\n\n{{custom_message}}\n\n{{action_url}}\n\nDo not reply to this email.',
      '<p>Hello {{recipient_name}},</p><p>Reminder of your upcoming shift at <strong>{{church_name}}</strong>.</p><p><strong>Shift:</strong> {{shift_title}}<br/><strong>When:</strong> {{shift_start}} – {{shift_end}}<br/><strong>Location:</strong> {{location_name}}</p><p>{{custom_message}}</p><p><a href="{{action_url}}">View shift</a></p><p>Do not reply to this email.</p>',
      'medium',
      true,
      true,
      1,
      ARRAY['church_name','recipient_name','shift_title','shift_start','shift_end','location_name','custom_message','action_url']::text[]
    ),
    (
      NULL::uuid,
      'schedule.assignment_response_required',
      'Assignment response required',
      'Sent when a member must accept or decline an assignment',
      'email',
      '[{{church_name}}] Please respond: {{shift_title}}',
      E'Hello {{recipient_name}},\n\nPlease accept or decline your assignment at {{church_name}}.\n\nShift: {{shift_title}}\nWhen: {{shift_start}} – {{shift_end}}\n\nSign in to respond:\n{{action_url}}\n\nDo not reply to this email.',
      '<p>Hello {{recipient_name}},</p><p>Please accept or decline your assignment at <strong>{{church_name}}</strong>.</p><p><strong>Shift:</strong> {{shift_title}}<br/><strong>When:</strong> {{shift_start}} – {{shift_end}}</p><p><a href="{{action_url}}">Respond in Sanctuary Protected</a></p><p>Do not reply to this email.</p>',
      'high',
      true,
      true,
      1,
      ARRAY['church_name','recipient_name','shift_title','shift_start','shift_end','action_url']::text[]
    ),
    (
      NULL::uuid,
      'schedule.open_shift_available',
      'Open shift available',
      'Sent when an open shift needs volunteers or staffing',
      'email',
      '[{{church_name}}] Open shift: {{shift_title}}',
      E'Hello {{recipient_name}},\n\nA shift still needs coverage at {{church_name}}.\n\nShift: {{shift_title}}\nWhen: {{shift_start}} – {{shift_end}}\nOpen positions: {{open_positions}}\n\n{{custom_message}}\n\n{{action_url}}\n\nDo not reply to this email.',
      '<p>Hello {{recipient_name}},</p><p>A shift still needs coverage at <strong>{{church_name}}</strong>.</p><p><strong>Shift:</strong> {{shift_title}}<br/><strong>When:</strong> {{shift_start}} – {{shift_end}}<br/><strong>Open positions:</strong> {{open_positions}}</p><p>{{custom_message}}</p><p><a href="{{action_url}}">View shift</a></p><p>Do not reply to this email.</p>',
      'medium',
      true,
      true,
      1,
      ARRAY['church_name','recipient_name','shift_title','shift_start','shift_end','open_positions','custom_message','action_url']::text[]
    ),
    (
      NULL::uuid,
      'schedule.event_cancelled',
      'Schedule event cancelled',
      'Sent when a scheduled event is cancelled',
      'email',
      '[{{church_name}}] Event cancelled: {{event_title}}',
      E'Hello {{recipient_name}},\n\nThe following event at {{church_name}} has been cancelled.\n\nEvent: {{event_title}}\nOriginally: {{event_start}} – {{event_end}}\n\n{{custom_message}}\n\n{{action_url}}\n\nDo not reply to this email.',
      '<p>Hello {{recipient_name}},</p><p>The following event at <strong>{{church_name}}</strong> has been cancelled.</p><p><strong>Event:</strong> {{event_title}}<br/><strong>Originally:</strong> {{event_start}} – {{event_end}}</p><p>{{custom_message}}</p><p><a href="{{action_url}}">Open Sanctuary Protected</a></p><p>Do not reply to this email.</p>',
      'high',
      true,
      true,
      1,
      ARRAY['church_name','recipient_name','event_title','event_start','event_end','custom_message','action_url']::text[]
    ),
    (
      NULL::uuid,
      'schedule.custom_message',
      'Custom schedule message',
      'Custom scheduling message to groups or individuals',
      'email',
      '[{{church_name}}] {{subject}}',
      E'Hello {{recipient_name}},\n\n{{custom_message}}\n\n{{action_url}}\n\nDo not reply to this email.',
      '<p>Hello {{recipient_name}},</p><p>{{custom_message}}</p><p><a href="{{action_url}}">Open Sanctuary Protected</a></p><p>Do not reply to this email.</p>',
      'medium',
      true,
      true,
      1,
      ARRAY['church_name','recipient_name','subject','custom_message','action_url','event_title','shift_title']::text[]
    ),
    (
      NULL::uuid,
      'schedule.conflict_override',
      'Schedule conflict override',
      'Sent when a scheduler overrides an availability conflict',
      'email',
      '[{{church_name}}] Schedule note: {{shift_title}}',
      E'Hello {{recipient_name}},\n\nYou were assigned to {{shift_title}} at {{church_name}} even though a scheduling conflict was flagged.\n\nWhen: {{shift_start}} – {{shift_end}}\n\nPlease review details in the app:\n{{action_url}}\n\nDo not reply to this email.',
      '<p>Hello {{recipient_name}},</p><p>You were assigned to <strong>{{shift_title}}</strong> at <strong>{{church_name}}</strong> even though a scheduling conflict was flagged.</p><p><strong>When:</strong> {{shift_start}} – {{shift_end}}</p><p><a href="{{action_url}}">Review in Sanctuary Protected</a></p><p>Do not reply to this email.</p>',
      'high',
      true,
      true,
      1,
      ARRAY['church_name','recipient_name','shift_title','shift_start','shift_end','action_url']::text[]
    ),
    (
      NULL::uuid,
      'schedule.unfilled_shift_warning',
      'Unfilled shift warning',
      'Sent to schedulers when a shift remains understaffed',
      'email',
      '[{{church_name}}] Unfilled shift: {{shift_title}}',
      E'Hello {{recipient_name}},\n\nA shift at {{church_name}} is understaffed.\n\nShift: {{shift_title}}\nWhen: {{shift_start}} – {{shift_end}}\nRequired: {{required_count}}\nConfirmed: {{confirmed_count}}\nOpen: {{open_positions}}\n\n{{action_url}}\n\nDo not reply to this email.',
      '<p>Hello {{recipient_name}},</p><p>A shift at <strong>{{church_name}}</strong> is understaffed.</p><p><strong>Shift:</strong> {{shift_title}}<br/><strong>When:</strong> {{shift_start}} – {{shift_end}}<br/><strong>Required:</strong> {{required_count}} · <strong>Confirmed:</strong> {{confirmed_count}} · <strong>Open:</strong> {{open_positions}}</p><p><a href="{{action_url}}">Staff this shift</a></p><p>Do not reply to this email.</p>',
      'high',
      true,
      true,
      1,
      ARRAY['church_name','recipient_name','shift_title','shift_start','shift_end','required_count','confirmed_count','open_positions','action_url']::text[]
    )
) AS v(
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
  FROM public.notification_templates t
  WHERE t.church_id IS NULL
    AND t.template_key = v.template_key
);

-- =============================================================================
-- End 035_schedule_management.sql
-- =============================================================================
