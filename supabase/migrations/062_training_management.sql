-- =============================================================================
-- 062_training_management.sql
-- Training Management Module: categories, courses, events, participants,
-- requirements, completion history, documents, external records, settings.
-- Additive / non-destructive. Safe to re-run.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.training_delivery_method AS ENUM (
    'in_person_classroom',
    'online',
    'webinar',
    'practical_exercise',
    'drill',
    'scenario_based',
    'self_paced',
    'external_provider',
    'hybrid',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.training_event_status AS ENUM (
    'draft',
    'scheduled',
    'registration_open',
    'registration_closed',
    'in_progress',
    'completed',
    'cancelled',
    'postponed',
    'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.training_enrollment_status AS ENUM (
    'invited',
    'assigned',
    'registered',
    'waitlisted',
    'declined',
    'cancelled',
    'removed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.training_attendance_status AS ENUM (
    'not_recorded',
    'present',
    'absent',
    'late',
    'left_early',
    'excused',
    'attended_remotely'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.training_completion_status AS ENUM (
    'not_started',
    'in_progress',
    'completed',
    'passed',
    'failed',
    'incomplete',
    'exempt',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.training_assignment_type AS ENUM (
    'user',
    'security_group',
    'team',
    'role',
    'campus',
    'all_security'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.training_external_verification_status AS ENUM (
    'not_reviewed',
    'pending_verification',
    'verified',
    'rejected'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.training_drill_result AS ENUM (
    'successful',
    'successful_with_improvements',
    'incomplete',
    'failed',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.training_document_type AS ENUM (
    'course_outline',
    'presentation',
    'attendance_sheet',
    'completion_certificate',
    'handout',
    'policy',
    'exercise_plan',
    'after_action_report',
    'photo',
    'acknowledgment',
    'external_documentation',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.training_completion_source AS ENUM (
    'event',
    'external',
    'manual_correction',
    'import'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- training_categories
-- church_id NULL = system template; non-null = church custom category
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.training_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid REFERENCES public.churches (id) ON DELETE CASCADE,
  system_key text,
  name text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  sensitive boolean NOT NULL DEFAULT false,
  default_renewal_months integer
    CHECK (default_renewal_months IS NULL OR default_renewal_months BETWEEN 1 AND 120),
  required_documentation text,
  is_required_default boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_categories_name_len CHECK (char_length(name) BETWEEN 1 AND 200),
  CONSTRAINT training_categories_system_key_unique UNIQUE (system_key),
  CONSTRAINT training_categories_system_church_check CHECK (
    (is_system = true AND church_id IS NULL AND system_key IS NOT NULL)
    OR (is_system = false AND church_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS training_categories_church_idx
  ON public.training_categories (church_id, active, display_order);

CREATE INDEX IF NOT EXISTS training_categories_system_idx
  ON public.training_categories (is_system, active)
  WHERE is_system = true;

DROP TRIGGER IF EXISTS training_categories_updated_at ON public.training_categories;
CREATE TRIGGER training_categories_updated_at
  BEFORE UPDATE ON public.training_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Per-church overrides for system categories (deactivate / reorder / require)
CREATE TABLE IF NOT EXISTS public.training_category_church_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.training_categories (id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  display_order integer,
  is_required boolean,
  description_override text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_category_church_state_unique UNIQUE (church_id, category_id)
);

DROP TRIGGER IF EXISTS training_category_church_state_updated_at ON public.training_category_church_state;
CREATE TRIGGER training_category_church_state_updated_at
  BEFORE UPDATE ON public.training_category_church_state
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- training_courses
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.training_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid REFERENCES public.churches (id) ON DELETE CASCADE,
  training_category_id uuid NOT NULL REFERENCES public.training_categories (id) ON DELETE RESTRICT,
  system_key text,
  course_code text,
  name text NOT NULL,
  description text,
  objective text,
  default_duration_minutes integer
    CHECK (default_duration_minutes IS NULL OR default_duration_minutes BETWEEN 1 AND 10080),
  delivery_method public.training_delivery_method NOT NULL DEFAULT 'in_person_classroom',
  recommended_audience text,
  renewal_months integer
    CHECK (renewal_months IS NULL OR renewal_months BETWEEN 1 AND 120),
  required boolean NOT NULL DEFAULT false,
  passing_score numeric(5,2)
    CHECK (passing_score IS NULL OR (passing_score >= 0 AND passing_score <= 100)),
  prerequisites text,
  completion_requirements text,
  instructor_requirements text,
  creates_certification boolean NOT NULL DEFAULT false,
  certification_type text,
  is_system boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_courses_name_len CHECK (char_length(name) BETWEEN 1 AND 200),
  CONSTRAINT training_courses_system_key_unique UNIQUE (system_key),
  CONSTRAINT training_courses_system_church_check CHECK (
    (is_system = true AND church_id IS NULL AND system_key IS NOT NULL)
    OR (is_system = false AND church_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS training_courses_church_idx
  ON public.training_courses (church_id, active, name);

CREATE INDEX IF NOT EXISTS training_courses_category_idx
  ON public.training_courses (training_category_id, active);

DROP TRIGGER IF EXISTS training_courses_updated_at ON public.training_courses;
CREATE TRIGGER training_courses_updated_at
  BEFORE UPDATE ON public.training_courses
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.training_course_church_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.training_courses (id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  required boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_course_church_state_unique UNIQUE (church_id, course_id)
);

DROP TRIGGER IF EXISTS training_course_church_state_updated_at ON public.training_course_church_state;
CREATE TRIGGER training_course_church_state_updated_at
  BEFORE UPDATE ON public.training_course_church_state
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- training_events
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.training_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  campus_id uuid REFERENCES public.campuses (id) ON DELETE SET NULL,
  training_course_id uuid REFERENCES public.training_courses (id) ON DELETE SET NULL,
  training_category_id uuid REFERENCES public.training_categories (id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  objective text,
  format public.training_delivery_method NOT NULL DEFAULT 'in_person_classroom',
  location text,
  room text,
  instructor_name text,
  instructor_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  provider_name text,
  start_at timestamptz,
  end_at timestamptz,
  time_zone text NOT NULL DEFAULT 'America/Chicago',
  duration_minutes integer
    CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 1 AND 10080),
  maximum_participants integer
    CHECK (maximum_participants IS NULL OR maximum_participants BETWEEN 1 AND 10000),
  registration_deadline timestamptz,
  required boolean NOT NULL DEFAULT false,
  status public.training_event_status NOT NULL DEFAULT 'draft',
  target_audience text,
  materials_required text,
  completion_requirements text,
  passing_score numeric(5,2)
    CHECK (passing_score IS NULL OR (passing_score >= 0 AND passing_score <= 100)),
  notes text,
  allow_self_registration boolean NOT NULL DEFAULT false,
  is_drill boolean NOT NULL DEFAULT false,
  drill_scenario text,
  drill_objectives text,
  drill_areas_involved text,
  drill_expected_participants integer,
  drill_actual_participants integer,
  drill_observers text,
  drill_results text,
  drill_issues text,
  drill_corrective_actions text,
  drill_follow_up_owner text,
  drill_follow_up_due_at date,
  drill_overall_result public.training_drill_result,
  cost_instructor numeric(12,2),
  cost_facility numeric(12,2),
  cost_materials numeric(12,2),
  cost_travel numeric(12,2),
  cost_participant_fee numeric(12,2),
  cost_equipment numeric(12,2),
  cost_other numeric(12,2),
  cost_total numeric(12,2),
  creates_certification boolean NOT NULL DEFAULT false,
  certification_type text,
  archived_at timestamptz,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_events_name_len CHECK (char_length(name) BETWEEN 1 AND 200),
  CONSTRAINT training_events_time_order CHECK (
    start_at IS NULL OR end_at IS NULL OR end_at >= start_at
  )
);

CREATE INDEX IF NOT EXISTS training_events_church_start_idx
  ON public.training_events (church_id, start_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS training_events_church_status_idx
  ON public.training_events (church_id, status);

CREATE INDEX IF NOT EXISTS training_events_campus_idx
  ON public.training_events (church_id, campus_id);

CREATE INDEX IF NOT EXISTS training_events_course_idx
  ON public.training_events (training_course_id);

DROP TRIGGER IF EXISTS training_events_updated_at ON public.training_events;
CREATE TRIGGER training_events_updated_at
  BEFORE UPDATE ON public.training_events
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.enforce_training_event_campus_church()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.campus_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.campuses c
    WHERE c.id = NEW.campus_id AND c.church_id = NEW.church_id
  ) THEN
    RAISE EXCEPTION 'VALIDATION: campus does not belong to this church';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS training_events_campus_church ON public.training_events;
CREATE TRIGGER training_events_campus_church
  BEFORE INSERT OR UPDATE OF campus_id, church_id
  ON public.training_events
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_training_event_campus_church();

-- ---------------------------------------------------------------------------
-- Assignments & participants
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.training_event_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  training_event_id uuid NOT NULL REFERENCES public.training_events (id) ON DELETE CASCADE,
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  assignment_type public.training_assignment_type NOT NULL,
  user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  security_group_id uuid,
  team_id uuid,
  role_key text,
  campus_id uuid REFERENCES public.campuses (id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_event_assignments_target_check CHECK (
    (assignment_type = 'user' AND user_id IS NOT NULL)
    OR (assignment_type = 'security_group' AND security_group_id IS NOT NULL)
    OR (assignment_type = 'team' AND team_id IS NOT NULL)
    OR (assignment_type = 'role' AND role_key IS NOT NULL)
    OR (assignment_type = 'campus' AND campus_id IS NOT NULL)
    OR (assignment_type = 'all_security')
  )
);

CREATE INDEX IF NOT EXISTS training_event_assignments_event_idx
  ON public.training_event_assignments (training_event_id);

CREATE TABLE IF NOT EXISTS public.training_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  training_event_id uuid NOT NULL REFERENCES public.training_events (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  enrollment_status public.training_enrollment_status NOT NULL DEFAULT 'assigned',
  attendance_status public.training_attendance_status NOT NULL DEFAULT 'not_recorded',
  completion_status public.training_completion_status NOT NULL DEFAULT 'not_started',
  registered_at timestamptz,
  attended_at timestamptz,
  completed_at timestamptz,
  score numeric(5,2)
    CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  passed boolean,
  training_hours numeric(8,2)
    CHECK (training_hours IS NULL OR training_hours >= 0),
  exemption_status boolean NOT NULL DEFAULT false,
  exemption_reason text,
  instructor_notes text,
  administrative_notes text,
  recorded_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  recorded_at timestamptz,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_participants_event_user_unique UNIQUE (training_event_id, user_id)
);

CREATE INDEX IF NOT EXISTS training_participants_church_user_idx
  ON public.training_participants (church_id, user_id);

CREATE INDEX IF NOT EXISTS training_participants_event_idx
  ON public.training_participants (training_event_id, enrollment_status);

DROP TRIGGER IF EXISTS training_participants_updated_at ON public.training_participants;
CREATE TRIGGER training_participants_updated_at
  BEFORE UPDATE ON public.training_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Requirements
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.training_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  name text NOT NULL,
  training_course_id uuid REFERENCES public.training_courses (id) ON DELETE SET NULL,
  training_category_id uuid REFERENCES public.training_categories (id) ON DELETE SET NULL,
  assignment_type public.training_assignment_type NOT NULL DEFAULT 'all_security',
  user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  security_group_id uuid,
  team_id uuid,
  role_key text,
  campus_id uuid REFERENCES public.campuses (id) ON DELETE SET NULL,
  effective_at date NOT NULL DEFAULT CURRENT_DATE,
  due_at date,
  renewal_months integer
    CHECK (renewal_months IS NULL OR renewal_months BETWEEN 1 AND 120),
  grace_period_days integer NOT NULL DEFAULT 0
    CHECK (grace_period_days BETWEEN 0 AND 365),
  minimum_hours numeric(8,2)
    CHECK (minimum_hours IS NULL OR minimum_hours >= 0),
  minimum_score numeric(5,2)
    CHECK (minimum_score IS NULL OR (minimum_score >= 0 AND minimum_score <= 100)),
  exemption_allowed boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_requirements_name_len CHECK (char_length(name) BETWEEN 1 AND 200),
  CONSTRAINT training_requirements_target_check CHECK (
    training_course_id IS NOT NULL OR training_category_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS training_requirements_church_idx
  ON public.training_requirements (church_id, active);

DROP TRIGGER IF EXISTS training_requirements_updated_at ON public.training_requirements;
CREATE TRIGGER training_requirements_updated_at
  BEFORE UPDATE ON public.training_requirements
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Permanent completion history
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.training_completion_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  campus_id uuid REFERENCES public.campuses (id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  training_event_id uuid REFERENCES public.training_events (id) ON DELETE SET NULL,
  training_course_id uuid REFERENCES public.training_courses (id) ON DELETE SET NULL,
  training_category_id uuid REFERENCES public.training_categories (id) ON DELETE SET NULL,
  training_participant_id uuid REFERENCES public.training_participants (id) ON DELETE SET NULL,
  course_name text NOT NULL,
  category_name text,
  event_name text,
  instructor_name text,
  provider_name text,
  training_date date,
  completed_at timestamptz NOT NULL DEFAULT now(),
  training_hours numeric(8,2)
    CHECK (training_hours IS NULL OR training_hours >= 0),
  score numeric(5,2)
    CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  passed boolean,
  completion_status public.training_completion_status NOT NULL DEFAULT 'completed',
  renewal_due_at date,
  source_type public.training_completion_source NOT NULL DEFAULT 'event',
  sensitive boolean NOT NULL DEFAULT false,
  archived boolean NOT NULL DEFAULT false,
  verified_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  verified_at timestamptz,
  notes text,
  recorded_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS training_completion_records_church_user_idx
  ON public.training_completion_records (church_id, user_id, completed_at DESC);

CREATE INDEX IF NOT EXISTS training_completion_records_renewal_idx
  ON public.training_completion_records (church_id, renewal_due_at)
  WHERE renewal_due_at IS NOT NULL AND archived = false;

CREATE INDEX IF NOT EXISTS training_completion_records_event_idx
  ON public.training_completion_records (training_event_id);

DROP TRIGGER IF EXISTS training_completion_records_updated_at ON public.training_completion_records;
CREATE TRIGGER training_completion_records_updated_at
  BEFORE UPDATE ON public.training_completion_records
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- External training
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.training_external_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  training_category_id uuid REFERENCES public.training_categories (id) ON DELETE SET NULL,
  course_name text NOT NULL,
  category_name text,
  provider_name text,
  instructor_name text,
  location text,
  completion_date date NOT NULL,
  training_hours numeric(8,2)
    CHECK (training_hours IS NULL OR training_hours >= 0),
  score numeric(5,2)
    CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  renewal_due_at date,
  verification_status public.training_external_verification_status NOT NULL DEFAULT 'not_reviewed',
  verified_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  verified_at timestamptz,
  completion_record_id uuid REFERENCES public.training_completion_records (id) ON DELETE SET NULL,
  notes text,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_external_records_name_len CHECK (char_length(course_name) BETWEEN 1 AND 200)
);

CREATE INDEX IF NOT EXISTS training_external_records_church_idx
  ON public.training_external_records (church_id, verification_status);

DROP TRIGGER IF EXISTS training_external_records_updated_at ON public.training_external_records;
CREATE TRIGGER training_external_records_updated_at
  BEFORE UPDATE ON public.training_external_records
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Documents (metadata; files in storage)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.training_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  training_category_id uuid REFERENCES public.training_categories (id) ON DELETE CASCADE,
  training_course_id uuid REFERENCES public.training_courses (id) ON DELETE CASCADE,
  training_event_id uuid REFERENCES public.training_events (id) ON DELETE CASCADE,
  training_participant_id uuid REFERENCES public.training_participants (id) ON DELETE CASCADE,
  completion_record_id uuid REFERENCES public.training_completion_records (id) ON DELETE CASCADE,
  external_record_id uuid REFERENCES public.training_external_records (id) ON DELETE CASCADE,
  document_type public.training_document_type NOT NULL DEFAULT 'other',
  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  file_size_bytes bigint,
  uploaded_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  active boolean NOT NULL DEFAULT true,
  CONSTRAINT training_documents_file_name_len CHECK (char_length(file_name) BETWEEN 1 AND 500)
);

CREATE INDEX IF NOT EXISTS training_documents_church_idx
  ON public.training_documents (church_id, active);

CREATE INDEX IF NOT EXISTS training_documents_event_idx
  ON public.training_documents (training_event_id)
  WHERE training_event_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Church settings
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.training_church_settings (
  church_id uuid PRIMARY KEY REFERENCES public.churches (id) ON DELETE CASCADE,
  due_soon_days integer NOT NULL DEFAULT 30
    CHECK (due_soon_days IN (7, 14, 30, 60, 90)),
  reminder_at_assignment boolean NOT NULL DEFAULT true,
  reminder_days_before integer[] NOT NULL DEFAULT ARRAY[30, 14, 7, 1],
  reminder_day_of boolean NOT NULL DEFAULT true,
  reminder_days_after_missed integer NOT NULL DEFAULT 7,
  notify_on_completion boolean NOT NULL DEFAULT true,
  notify_on_cancel boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS training_church_settings_updated_at ON public.training_church_settings;
CREATE TRIGGER training_church_settings_updated_at
  BEFORE UPDATE ON public.training_church_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.training_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_category_church_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_course_church_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_event_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_completion_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_external_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_church_settings ENABLE ROW LEVEL SECURITY;

-- Categories: system templates readable by authenticated; church rows by membership
DROP POLICY IF EXISTS training_categories_select ON public.training_categories;
CREATE POLICY training_categories_select ON public.training_categories
  FOR SELECT TO authenticated
  USING (
    is_system = true
    OR public.has_active_church_membership(church_id)
  );

DROP POLICY IF EXISTS training_categories_insert ON public.training_categories;
CREATE POLICY training_categories_insert ON public.training_categories
  FOR INSERT TO authenticated
  WITH CHECK (
    is_system = false
    AND church_id IS NOT NULL
    AND public.has_active_church_membership(church_id)
  );

DROP POLICY IF EXISTS training_categories_update ON public.training_categories;
CREATE POLICY training_categories_update ON public.training_categories
  FOR UPDATE TO authenticated
  USING (
    is_system = false
    AND public.has_active_church_membership(church_id)
  )
  WITH CHECK (
    is_system = false
    AND public.has_active_church_membership(church_id)
  );

DROP POLICY IF EXISTS training_categories_delete ON public.training_categories;
CREATE POLICY training_categories_delete ON public.training_categories
  FOR DELETE TO authenticated
  USING (
    is_system = false
    AND public.has_active_church_membership(church_id)
  );

-- Helper macro-style policies for church-scoped tables
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'training_category_church_state',
    'training_course_church_state',
    'training_events',
    'training_event_assignments',
    'training_participants',
    'training_requirements',
    'training_completion_records',
    'training_external_records',
    'training_documents',
    'training_church_settings'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (public.has_active_church_membership(church_id))',
      t, t
    );
    EXECUTE format('DROP POLICY IF EXISTS %I_insert ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (public.has_active_church_membership(church_id))',
      t, t
    );
    EXECUTE format('DROP POLICY IF EXISTS %I_update ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_update ON public.%I FOR UPDATE TO authenticated USING (public.has_active_church_membership(church_id)) WITH CHECK (public.has_active_church_membership(church_id))',
      t, t
    );
    EXECUTE format('DROP POLICY IF EXISTS %I_delete ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_delete ON public.%I FOR DELETE TO authenticated USING (public.has_active_church_membership(church_id))',
      t, t
    );
  END LOOP;
END $$;

-- Courses: system + church
DROP POLICY IF EXISTS training_courses_select ON public.training_courses;
CREATE POLICY training_courses_select ON public.training_courses
  FOR SELECT TO authenticated
  USING (
    is_system = true
    OR public.has_active_church_membership(church_id)
  );

DROP POLICY IF EXISTS training_courses_insert ON public.training_courses;
CREATE POLICY training_courses_insert ON public.training_courses
  FOR INSERT TO authenticated
  WITH CHECK (
    is_system = false
    AND church_id IS NOT NULL
    AND public.has_active_church_membership(church_id)
  );

DROP POLICY IF EXISTS training_courses_update ON public.training_courses;
CREATE POLICY training_courses_update ON public.training_courses
  FOR UPDATE TO authenticated
  USING (
    is_system = false
    AND public.has_active_church_membership(church_id)
  )
  WITH CHECK (
    is_system = false
    AND public.has_active_church_membership(church_id)
  );

DROP POLICY IF EXISTS training_courses_delete ON public.training_courses;
CREATE POLICY training_courses_delete ON public.training_courses
  FOR DELETE TO authenticated
  USING (
    is_system = false
    AND public.has_active_church_membership(church_id)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_category_church_state TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_courses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_course_church_state TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_event_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_participants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_requirements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_completion_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_external_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_church_settings TO authenticated;

GRANT ALL ON public.training_categories TO service_role;
GRANT ALL ON public.training_category_church_state TO service_role;
GRANT ALL ON public.training_courses TO service_role;
GRANT ALL ON public.training_course_church_state TO service_role;
GRANT ALL ON public.training_events TO service_role;
GRANT ALL ON public.training_event_assignments TO service_role;
GRANT ALL ON public.training_participants TO service_role;
GRANT ALL ON public.training_requirements TO service_role;
GRANT ALL ON public.training_completion_records TO service_role;
GRANT ALL ON public.training_external_records TO service_role;
GRANT ALL ON public.training_documents TO service_role;
GRANT ALL ON public.training_church_settings TO service_role;

-- ---------------------------------------------------------------------------
-- Seed system categories
-- ---------------------------------------------------------------------------

INSERT INTO public.training_categories (
  system_key, name, description, is_system, sensitive, display_order, default_renewal_months
) VALUES
  ('deescalation_response', 'De-escalation and Response',
   'Verbal de-escalation, conflict recognition, and team-based response documentation.', true, false, 10, 12),
  ('physical_environmental_safety', 'Physical and Environmental Safety',
   'Situational awareness, facility hazards, and environmental preparedness.', true, false, 20, 12),
  ('policies_communication', 'Policies and Communication',
   'Security policies, radio communication, and reporting procedures.', true, false, 30, 12),
  ('lethal_nonlethal', 'Lethal and Non-Lethal Training',
   'Documentation of approved defensive-equipment and use-of-force policy training only.', true, true, 40, 12),
  ('unarmed_self_defense', 'Unarmed Self-Defense',
   'Personal safety, disengagement, and protective positioning documentation.', true, false, 50, 12),
  ('building_fire_safety', 'Building and Fire Safety',
   'Fire awareness, exits, drills, and facility fire-safety documentation.', true, false, 60, 12),
  ('building_evacuation', 'Building Evacuation',
   'Evacuation routes, accountability, and evacuation drill documentation.', true, false, 70, 12),
  ('child_protective', 'Child Protective Strategies',
   'Check-in/out, supervision, and child-protection procedure training.', true, false, 80, 12),
  ('mass_trauma_response', 'Mass Trauma Response',
   'Mass-casualty awareness, trauma-kit locations, and medical coordination documentation.', true, false, 90, 12)
ON CONFLICT (system_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Seed starter topics (system courses)
-- ---------------------------------------------------------------------------

WITH topics(system_key, category_key, name, display_hint) AS (
  VALUES
    -- De-escalation
    ('deesc_verbal', 'deescalation_response', 'Verbal de-escalation', 1),
    ('deesc_conflict', 'deescalation_response', 'Conflict recognition', 2),
    ('deesc_warning', 'deescalation_response', 'Behavioral warning signs', 3),
    ('deesc_disruptive', 'deescalation_response', 'Managing disruptive individuals', 4),
    ('deesc_distressed', 'deescalation_response', 'Responding to emotionally distressed individuals', 5),
    ('deesc_crisis_comm', 'deescalation_response', 'Crisis communication', 6),
    ('deesc_distance', 'deescalation_response', 'Maintaining safe distance and positioning', 7),
    ('deesc_team', 'deescalation_response', 'Team-based response techniques', 8),
    ('deesc_le', 'deescalation_response', 'When to involve law enforcement', 9),
    ('deesc_post', 'deescalation_response', 'Post-incident response', 10),
    -- Physical / environmental
    ('phys_awareness', 'physical_environmental_safety', 'Situational awareness', 1),
    ('phys_parking', 'physical_environmental_safety', 'Parking lot safety', 2),
    ('phys_walkthrough', 'physical_environmental_safety', 'Facility walk-through procedures', 3),
    ('phys_hazard', 'physical_environmental_safety', 'Hazard recognition', 4),
    ('phys_slip', 'physical_environmental_safety', 'Slip, trip, and fall prevention', 5),
    ('phys_lighting', 'physical_environmental_safety', 'Lighting and visibility inspections', 6),
    ('phys_doors', 'physical_environmental_safety', 'Door and window security', 7),
    ('phys_suspicious', 'physical_environmental_safety', 'Suspicious-object awareness', 8),
    ('phys_weather', 'physical_environmental_safety', 'Severe weather preparedness', 9),
    ('phys_utility', 'physical_environmental_safety', 'Utility and infrastructure hazards', 10),
    -- Policies / communication
    ('pol_policies', 'policies_communication', 'Security-team policies', 1),
    ('pol_incident', 'policies_communication', 'Incident-reporting procedures', 2),
    ('pol_radio', 'policies_communication', 'Radio communication', 3),
    ('pol_terminology', 'policies_communication', 'Emergency terminology', 4),
    ('pol_chain', 'policies_communication', 'Chain of command', 5),
    ('pol_confidentiality', 'policies_communication', 'Confidentiality requirements', 6),
    ('pol_info_share', 'policies_communication', 'Information-sharing procedures', 7),
    ('pol_leadership', 'policies_communication', 'Communication with church leadership', 8),
    ('pol_le_comm', 'policies_communication', 'Communication with law enforcement', 9),
    ('pol_docs', 'policies_communication', 'Post-event documentation', 10),
    -- Lethal / non-lethal (documentation only)
    ('lnl_policy', 'lethal_nonlethal', 'Church policies regarding defensive equipment', 1),
    ('lnl_legal', 'lethal_nonlethal', 'Legal and ethical considerations', 2),
    ('lnl_decision', 'lethal_nonlethal', 'Use-of-force decision-making', 3),
    ('lnl_firearm_safety', 'lethal_nonlethal', 'Firearm safety', 4),
    ('lnl_storage', 'lethal_nonlethal', 'Safe storage and handling', 5),
    ('lnl_nonlethal', 'lethal_nonlethal', 'Non-lethal defensive tools', 6),
    ('lnl_medical', 'lethal_nonlethal', 'Medical response following a use-of-force incident', 7),
    ('lnl_scenario', 'lethal_nonlethal', 'Scenario-based judgment training', 8),
    ('lnl_deesc_first', 'lethal_nonlethal', 'De-escalation before force', 9),
    ('lnl_reporting', 'lethal_nonlethal', 'Reporting and review requirements', 10),
    -- Unarmed
    ('usd_awareness', 'unarmed_self_defense', 'Personal safety awareness', 1),
    ('usd_escape', 'unarmed_self_defense', 'Escape and disengagement', 2),
    ('usd_position', 'unarmed_self_defense', 'Defensive positioning', 3),
    ('usd_protect', 'unarmed_self_defense', 'Protecting vulnerable individuals', 4),
    ('usd_team', 'unarmed_self_defense', 'Team coordination', 5),
    ('usd_avoid', 'unarmed_self_defense', 'Avoidance and retreat', 6),
    ('usd_restraint', 'unarmed_self_defense', 'Basic restraint-policy awareness', 7),
    ('usd_medical', 'unarmed_self_defense', 'Post-incident medical evaluation', 8),
    ('usd_reporting', 'unarmed_self_defense', 'Reporting requirements', 9),
    ('usd_scenario', 'unarmed_self_defense', 'Scenario-based practice', 10),
    -- Building / fire
    ('fire_ext', 'building_fire_safety', 'Fire extinguisher awareness', 1),
    ('fire_alarm', 'building_fire_safety', 'Fire alarm procedures', 2),
    ('fire_exits', 'building_fire_safety', 'Emergency exits', 3),
    ('fire_recog', 'building_fire_safety', 'Smoke and fire recognition', 4),
    ('fire_utility', 'building_fire_safety', 'Utility shutoff awareness', 5),
    ('fire_fd', 'building_fire_safety', 'Fire-department coordination', 6),
    ('fire_kitchen', 'building_fire_safety', 'Kitchen and electrical hazards', 7),
    ('fire_occupancy', 'building_fire_safety', 'Occupancy and pathway safety', 8),
    ('fire_drill', 'building_fire_safety', 'Fire drill procedures', 9),
    ('fire_account', 'building_fire_safety', 'Post-event accountability', 10),
    -- Evacuation
    ('evac_routes', 'building_evacuation', 'Evacuation routes', 1),
    ('evac_alt', 'building_evacuation', 'Alternate evacuation routes', 2),
    ('evac_assembly', 'building_evacuation', 'Assembly areas', 3),
    ('evac_account', 'building_evacuation', 'Member accountability', 4),
    ('evac_children', 'building_evacuation', 'Children''s ministry evacuation', 5),
    ('evac_mobility', 'building_evacuation', 'Mobility assistance', 6),
    ('evac_comm', 'building_evacuation', 'Communication during evacuation', 7),
    ('evac_assign', 'building_evacuation', 'Floor or area assignments', 8),
    ('evac_reentry', 'building_evacuation', 'Re-entry procedures', 9),
    ('evac_drills', 'building_evacuation', 'Evacuation drills', 10),
    -- Child protective
    ('cps_checkin', 'child_protective', 'Child check-in and check-out procedures', 1),
    ('cps_pickup', 'child_protective', 'Authorized pickup verification', 2),
    ('cps_two_adult', 'child_protective', 'Two-adult supervision practices', 3),
    ('cps_restricted', 'child_protective', 'Restricted-area access', 4),
    ('cps_missing', 'child_protective', 'Missing-child response', 5),
    ('cps_custody', 'child_protective', 'Custody concern procedures', 6),
    ('cps_conduct', 'child_protective', 'Volunteer conduct expectations', 7),
    ('cps_abuse', 'child_protective', 'Reporting suspected abuse', 8),
    ('cps_parents', 'child_protective', 'Communication with parents or guardians', 9),
    ('cps_docs', 'child_protective', 'Documentation requirements', 10),
    -- Mass trauma
    ('mtr_medical', 'mass_trauma_response', 'Emergency medical coordination', 1),
    ('mtr_masscas', 'mass_trauma_response', 'Mass-casualty awareness', 2),
    ('mtr_triage', 'mass_trauma_response', 'Triage awareness', 3),
    ('mtr_kits', 'mass_trauma_response', 'Trauma-kit locations', 4),
    ('mtr_stb', 'mass_trauma_response', 'Stop-the-Bleed training documentation', 5),
    ('mtr_ems', 'mass_trauma_response', 'Communication with emergency services', 6),
    ('mtr_scene', 'mass_trauma_response', 'Scene safety', 7),
    ('mtr_reunify', 'mass_trauma_response', 'Family reunification', 8),
    ('mtr_collection', 'mass_trauma_response', 'Casualty collection areas', 9),
    ('mtr_post', 'mass_trauma_response', 'Post-event support and documentation', 10)
)
INSERT INTO public.training_courses (
  system_key,
  training_category_id,
  name,
  description,
  is_system,
  delivery_method,
  default_duration_minutes,
  objective
)
SELECT
  t.system_key,
  c.id,
  t.name,
  'Starter topic for church training documentation. Edit or deactivate as needed.',
  true,
  'in_person_classroom'::public.training_delivery_method,
  60,
  'Document completion of approved training for accountability and readiness.'
FROM topics t
JOIN public.training_categories c ON c.system_key = t.category_key AND c.is_system = true
ON CONFLICT (system_key) DO NOTHING;
