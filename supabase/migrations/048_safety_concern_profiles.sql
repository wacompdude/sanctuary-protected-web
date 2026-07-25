-- =============================================================================
-- 048_safety_concern_profiles.sql
-- Known Safety Concerns — profiles, photos, campus scope, incident links,
-- reviews, private storage, RLS helpers, and subscription feature seeds.
--
-- PHASE 4: Apply this migration to create tables, RLS, storage bucket, and
-- feature seeds. Safe to re-run (IF NOT EXISTS / ON CONFLICT / DROP POLICY).
--
-- Privacy principles:
--   - Church-scoped only; never public
--   - No biometric / facial recognition fields
--   - Soft-archive preferred over hard delete
--   - Private storage bucket + short-lived signed URLs (app layer)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.safety_concern_scope_type AS ENUM (
    'church_wide',
    'campus_specific',
    'selected_campuses'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.safety_concern_profile_status AS ENUM (
    'draft',
    'active',
    'under_review',
    'expired',
    'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.safety_concern_risk_context AS ENUM (
    'no_trespass_order',
    'documented_threat',
    'previous_security_incident',
    'harassment',
    'stalking_concern',
    'violent_behavior',
    'weapon_related_concern',
    'disruptive_behavior',
    'restricted_access',
    'law_enforcement_advisory',
    'other_documented_concern'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.safety_concern_restriction_type AS ENUM (
    'none',
    'verbal_no_trespass',
    'written_no_trespass',
    'court_order',
    'restraining_order',
    'limited_access',
    'staff_escort_required',
    'law_enforcement_contact_required',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.safety_concern_restriction_status AS ENUM (
    'active',
    'expired',
    'rescinded',
    'pending_review',
    'not_applicable'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.safety_concern_photo_source AS ENUM (
    'incident_attachment',
    'church_provided',
    'law_enforcement_provided',
    'publicly_available',
    'security_camera_still',
    'other_authorized_source'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.safety_concern_incident_relationship AS ENUM (
    'created_from_incident',
    'person_involved',
    'person_observed',
    'restriction_violation',
    'follow_up',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.safety_concern_review_outcome AS ENUM (
    'confirmed_active',
    'updated',
    'expired',
    'archived',
    'needs_follow_up'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Church settings columns (cannot bypass subscription entitlements)
-- ---------------------------------------------------------------------------

ALTER TABLE public.churches
  ADD COLUMN IF NOT EXISTS safety_concerns_allow_security_member_view boolean
    NOT NULL DEFAULT true;

ALTER TABLE public.churches
  ADD COLUMN IF NOT EXISTS safety_concerns_review_interval_days integer
    NOT NULL DEFAULT 180
    CHECK (
      safety_concerns_review_interval_days IN (90, 180, 365)
    );

ALTER TABLE public.churches
  ADD COLUMN IF NOT EXISTS safety_concerns_require_linked_incident boolean
    NOT NULL DEFAULT false;

ALTER TABLE public.churches
  ADD COLUMN IF NOT EXISTS safety_concerns_require_photo_to_activate boolean
    NOT NULL DEFAULT true;

COMMENT ON COLUMN public.churches.safety_concerns_allow_security_member_view IS
  'When false, only security_leader+ may view Safety Concern Profiles. Entitlement still required.';

-- ---------------------------------------------------------------------------
-- Permission helpers (role-based; app maps logical permissions → these)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_manage_safety_concerns(p_church_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_church_role(
    p_church_id,
    ARRAY['owner', 'co_owner', 'administrator', 'security_leader']
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_safety_concerns(p_church_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.can_manage_safety_concerns(p_church_id)
    OR (
      public.has_church_role(p_church_id, ARRAY['security_member'])
      AND EXISTS (
        SELECT 1
        FROM public.churches c
        WHERE c.id = p_church_id
          AND c.safety_concerns_allow_security_member_view = true
      )
    );
$$;

REVOKE ALL ON FUNCTION public.can_manage_safety_concerns(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_safety_concerns(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_safety_concerns(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_safety_concerns(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- safety_concern_profiles
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.safety_concern_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  scope_type public.safety_concern_scope_type NOT NULL
    DEFAULT 'church_wide'::public.safety_concern_scope_type,
  primary_campus_id uuid REFERENCES public.campuses (id) ON DELETE SET NULL,

  display_name text NOT NULL,
  known_aliases text,
  profile_status public.safety_concern_profile_status NOT NULL
    DEFAULT 'draft'::public.safety_concern_profile_status,
  risk_context public.safety_concern_risk_context NOT NULL
    DEFAULT 'other_documented_concern'::public.safety_concern_risk_context,

  restriction_type public.safety_concern_restriction_type NOT NULL
    DEFAULT 'none'::public.safety_concern_restriction_type,
  restriction_status public.safety_concern_restriction_status NOT NULL
    DEFAULT 'not_applicable'::public.safety_concern_restriction_status,
  restriction_start_date date,
  restriction_end_date date,
  restriction_reference text,

  -- Concise operational note (browse card / mobile)
  short_note text,
  response_guidance text,
  general_notes text,
  last_known_context text,
  related_incident_summary text,

  approved_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  approved_at timestamptz,
  reviewed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  last_reviewed_at timestamptz,
  next_review_date date,
  expires_at date,

  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  archive_reason text,

  CONSTRAINT safety_concern_profiles_display_name_len
    CHECK (char_length(display_name) BETWEEN 1 AND 200),
  CONSTRAINT safety_concern_profiles_aliases_len
    CHECK (known_aliases IS NULL OR char_length(known_aliases) <= 500),
  CONSTRAINT safety_concern_profiles_short_note_len
    CHECK (short_note IS NULL OR char_length(short_note) <= 500),
  CONSTRAINT safety_concern_profiles_response_guidance_len
    CHECK (response_guidance IS NULL OR char_length(response_guidance) <= 2000),
  CONSTRAINT safety_concern_profiles_general_notes_len
    CHECK (general_notes IS NULL OR char_length(general_notes) <= 5000),
  CONSTRAINT safety_concern_profiles_last_known_context_len
    CHECK (last_known_context IS NULL OR char_length(last_known_context) <= 1000),
  CONSTRAINT safety_concern_profiles_related_incident_summary_len
    CHECK (
      related_incident_summary IS NULL
      OR char_length(related_incident_summary) <= 1000
    ),
  CONSTRAINT safety_concern_profiles_restriction_reference_len
    CHECK (
      restriction_reference IS NULL OR char_length(restriction_reference) <= 500
    ),
  CONSTRAINT safety_concern_profiles_archive_reason_len
    CHECK (archive_reason IS NULL OR char_length(archive_reason) <= 500),
  CONSTRAINT safety_concern_profiles_restriction_dates_check
    CHECK (
      restriction_end_date IS NULL
      OR restriction_start_date IS NULL
      OR restriction_end_date >= restriction_start_date
    ),
  CONSTRAINT safety_concern_profiles_campus_scope_check
    CHECK (
      (
        scope_type = 'church_wide'::public.safety_concern_scope_type
        AND primary_campus_id IS NULL
      )
      OR (
        scope_type = 'campus_specific'::public.safety_concern_scope_type
        AND primary_campus_id IS NOT NULL
      )
      OR (
        scope_type = 'selected_campuses'::public.safety_concern_scope_type
      )
    )
);

CREATE INDEX IF NOT EXISTS safety_concern_profiles_church_status_idx
  ON public.safety_concern_profiles (church_id, profile_status);

CREATE INDEX IF NOT EXISTS safety_concern_profiles_church_review_idx
  ON public.safety_concern_profiles (church_id, next_review_date)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS safety_concern_profiles_church_expires_idx
  ON public.safety_concern_profiles (church_id, expires_at)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS safety_concern_profiles_primary_campus_idx
  ON public.safety_concern_profiles (primary_campus_id)
  WHERE primary_campus_id IS NOT NULL;

DROP TRIGGER IF EXISTS safety_concern_profiles_updated_at
  ON public.safety_concern_profiles;
CREATE TRIGGER safety_concern_profiles_updated_at
  BEFORE UPDATE ON public.safety_concern_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.safety_concern_profiles IS
  'Church-scoped operational awareness records (Known Safety Concerns). Not a public watch list.';

-- ---------------------------------------------------------------------------
-- safety_concern_profile_campuses (junction)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.safety_concern_profile_campuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  profile_id uuid NOT NULL
    REFERENCES public.safety_concern_profiles (id) ON DELETE CASCADE,
  campus_id uuid NOT NULL REFERENCES public.campuses (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT safety_concern_profile_campuses_unique
    UNIQUE (profile_id, campus_id)
);

CREATE INDEX IF NOT EXISTS safety_concern_profile_campuses_profile_idx
  ON public.safety_concern_profile_campuses (profile_id, campus_id);

CREATE INDEX IF NOT EXISTS safety_concern_profile_campuses_campus_idx
  ON public.safety_concern_profile_campuses (campus_id);

CREATE INDEX IF NOT EXISTS safety_concern_profile_campuses_church_idx
  ON public.safety_concern_profile_campuses (church_id);

-- Profile-level visibility (requires tables above)
CREATE OR REPLACE FUNCTION public.can_view_safety_concern_profile(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.safety_concern_profiles p
    WHERE p.id = p_profile_id
      AND (
        -- Managers see all statuses / scopes in their church
        public.can_manage_safety_concerns(p.church_id)
        OR (
          public.can_view_safety_concerns(p.church_id)
          AND p.profile_status IN (
            'active'::public.safety_concern_profile_status,
            'expired'::public.safety_concern_profile_status,
            'under_review'::public.safety_concern_profile_status
          )
          AND (
            p.scope_type = 'church_wide'::public.safety_concern_scope_type
            OR public.has_church_wide_campus_ops_access(p.church_id)
            OR EXISTS (
              SELECT 1
              FROM public.safety_concern_profile_campuses pc
              WHERE pc.profile_id = p.id
                AND public.can_access_campus(pc.campus_id)
            )
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_view_safety_concern_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_safety_concern_profile(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- safety_concern_photos
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.safety_concern_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  profile_id uuid NOT NULL
    REFERENCES public.safety_concern_profiles (id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text,
  mime_type text NOT NULL,
  file_size_bytes integer NOT NULL CHECK (file_size_bytes > 0),
  width integer,
  height integer,
  photo_context_note text,
  is_primary boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  source_type public.safety_concern_photo_source NOT NULL
    DEFAULT 'church_provided'::public.safety_concern_photo_source,
  source_reference text,
  taken_at timestamptz,
  uploaded_by uuid NOT NULL REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT safety_concern_photos_storage_path_key UNIQUE (storage_path),
  CONSTRAINT safety_concern_photos_mime_type_check CHECK (
    mime_type IN ('image/jpeg', 'image/png', 'image/webp')
  ),
  CONSTRAINT safety_concern_photos_context_note_len
    CHECK (photo_context_note IS NULL OR char_length(photo_context_note) <= 500),
  CONSTRAINT safety_concern_photos_source_reference_len
    CHECK (source_reference IS NULL OR char_length(source_reference) <= 500),
  CONSTRAINT safety_concern_photos_file_name_len
    CHECK (file_name IS NULL OR char_length(file_name) <= 255)
);

CREATE INDEX IF NOT EXISTS safety_concern_photos_profile_order_idx
  ON public.safety_concern_photos (profile_id, display_order)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS safety_concern_photos_church_idx
  ON public.safety_concern_photos (church_id);

DROP TRIGGER IF EXISTS safety_concern_photos_updated_at
  ON public.safety_concern_photos;
CREATE TRIGGER safety_concern_photos_updated_at
  BEFORE UPDATE ON public.safety_concern_photos
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- safety_concern_incidents (junction)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.safety_concern_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  profile_id uuid NOT NULL
    REFERENCES public.safety_concern_profiles (id) ON DELETE CASCADE,
  incident_id uuid NOT NULL REFERENCES public.incidents (id) ON DELETE CASCADE,
  relationship_type public.safety_concern_incident_relationship NOT NULL
    DEFAULT 'other'::public.safety_concern_incident_relationship,
  notes text,
  linked_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT safety_concern_incidents_unique UNIQUE (profile_id, incident_id),
  CONSTRAINT safety_concern_incidents_notes_len
    CHECK (notes IS NULL OR char_length(notes) <= 1000)
);

CREATE INDEX IF NOT EXISTS safety_concern_incidents_profile_idx
  ON public.safety_concern_incidents (profile_id);

CREATE INDEX IF NOT EXISTS safety_concern_incidents_incident_idx
  ON public.safety_concern_incidents (incident_id);

CREATE INDEX IF NOT EXISTS safety_concern_incidents_church_idx
  ON public.safety_concern_incidents (church_id);

-- ---------------------------------------------------------------------------
-- safety_concern_reviews
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.safety_concern_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  profile_id uuid NOT NULL
    REFERENCES public.safety_concern_profiles (id) ON DELETE CASCADE,
  reviewed_by uuid NOT NULL REFERENCES auth.users (id),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  outcome public.safety_concern_review_outcome NOT NULL,
  notes text,
  previous_next_review_date date,
  new_next_review_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT safety_concern_reviews_notes_len
    CHECK (notes IS NULL OR char_length(notes) <= 2000)
);

CREATE INDEX IF NOT EXISTS safety_concern_reviews_profile_idx
  ON public.safety_concern_reviews (profile_id, reviewed_at DESC);

CREATE INDEX IF NOT EXISTS safety_concern_reviews_church_idx
  ON public.safety_concern_reviews (church_id);

-- ---------------------------------------------------------------------------
-- Same-church integrity triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_safety_concern_same_church()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_church_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'safety_concern_profile_campuses' THEN
    SELECT p.church_id INTO v_church_id
    FROM public.safety_concern_profiles p
    WHERE p.id = NEW.profile_id;
    IF v_church_id IS NULL OR v_church_id <> NEW.church_id THEN
      RAISE EXCEPTION 'Profile church mismatch';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.campuses c
      WHERE c.id = NEW.campus_id AND c.church_id = NEW.church_id
    ) THEN
      RAISE EXCEPTION 'Campus does not belong to church';
    END IF;
  ELSIF TG_TABLE_NAME = 'safety_concern_photos' THEN
    SELECT p.church_id INTO v_church_id
    FROM public.safety_concern_profiles p
    WHERE p.id = NEW.profile_id;
    IF v_church_id IS NULL OR v_church_id <> NEW.church_id THEN
      RAISE EXCEPTION 'Profile church mismatch';
    END IF;
  ELSIF TG_TABLE_NAME = 'safety_concern_incidents' THEN
    SELECT p.church_id INTO v_church_id
    FROM public.safety_concern_profiles p
    WHERE p.id = NEW.profile_id;
    IF v_church_id IS NULL OR v_church_id <> NEW.church_id THEN
      RAISE EXCEPTION 'Profile church mismatch';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.incidents i
      WHERE i.id = NEW.incident_id AND i.church_id = NEW.church_id
    ) THEN
      RAISE EXCEPTION 'Incident does not belong to church';
    END IF;
  ELSIF TG_TABLE_NAME = 'safety_concern_reviews' THEN
    SELECT p.church_id INTO v_church_id
    FROM public.safety_concern_profiles p
    WHERE p.id = NEW.profile_id;
    IF v_church_id IS NULL OR v_church_id <> NEW.church_id THEN
      RAISE EXCEPTION 'Profile church mismatch';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS safety_concern_profile_campuses_same_church
  ON public.safety_concern_profile_campuses;
CREATE TRIGGER safety_concern_profile_campuses_same_church
  BEFORE INSERT OR UPDATE ON public.safety_concern_profile_campuses
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_safety_concern_same_church();

DROP TRIGGER IF EXISTS safety_concern_photos_same_church
  ON public.safety_concern_photos;
CREATE TRIGGER safety_concern_photos_same_church
  BEFORE INSERT OR UPDATE ON public.safety_concern_photos
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_safety_concern_same_church();

DROP TRIGGER IF EXISTS safety_concern_incidents_same_church
  ON public.safety_concern_incidents;
CREATE TRIGGER safety_concern_incidents_same_church
  BEFORE INSERT OR UPDATE ON public.safety_concern_incidents
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_safety_concern_same_church();

DROP TRIGGER IF EXISTS safety_concern_reviews_same_church
  ON public.safety_concern_reviews;
CREATE TRIGGER safety_concern_reviews_same_church
  BEFORE INSERT OR UPDATE ON public.safety_concern_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_safety_concern_same_church();

-- Ensure primary_campus is also represented in junction for campus scopes
CREATE OR REPLACE FUNCTION public.sync_safety_concern_primary_campus()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.scope_type = 'campus_specific'::public.safety_concern_scope_type
     AND NEW.primary_campus_id IS NOT NULL THEN
    INSERT INTO public.safety_concern_profile_campuses (
      church_id, profile_id, campus_id
    )
    VALUES (NEW.church_id, NEW.id, NEW.primary_campus_id)
    ON CONFLICT (profile_id, campus_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS safety_concern_profiles_sync_primary_campus
  ON public.safety_concern_profiles;
CREATE TRIGGER safety_concern_profiles_sync_primary_campus
  AFTER INSERT OR UPDATE OF scope_type, primary_campus_id
  ON public.safety_concern_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_safety_concern_primary_campus();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.safety_concern_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_concern_profile_campuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_concern_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_concern_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_concern_reviews ENABLE ROW LEVEL SECURITY;

-- Profiles
DROP POLICY IF EXISTS "Authorized members can view safety concern profiles"
  ON public.safety_concern_profiles;
DROP POLICY IF EXISTS "Managers can insert safety concern profiles"
  ON public.safety_concern_profiles;
DROP POLICY IF EXISTS "Managers can update safety concern profiles"
  ON public.safety_concern_profiles;

CREATE POLICY "Authorized members can view safety concern profiles"
  ON public.safety_concern_profiles
  FOR SELECT
  TO authenticated
  USING (
    public.can_manage_safety_concerns(church_id)
    OR public.can_view_safety_concern_profile(id)
  );

CREATE POLICY "Managers can insert safety concern profiles"
  ON public.safety_concern_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_safety_concerns(church_id));

CREATE POLICY "Managers can update safety concern profiles"
  ON public.safety_concern_profiles
  FOR UPDATE
  TO authenticated
  USING (public.can_manage_safety_concerns(church_id))
  WITH CHECK (public.can_manage_safety_concerns(church_id));

-- No DELETE policy — soft archive only

GRANT SELECT, INSERT, UPDATE ON public.safety_concern_profiles TO authenticated;

-- Campuses junction
DROP POLICY IF EXISTS "Authorized members can view safety concern campuses"
  ON public.safety_concern_profile_campuses;
DROP POLICY IF EXISTS "Managers can insert safety concern campuses"
  ON public.safety_concern_profile_campuses;
DROP POLICY IF EXISTS "Managers can delete safety concern campuses"
  ON public.safety_concern_profile_campuses;

CREATE POLICY "Authorized members can view safety concern campuses"
  ON public.safety_concern_profile_campuses
  FOR SELECT
  TO authenticated
  USING (public.can_view_safety_concern_profile(profile_id));

CREATE POLICY "Managers can insert safety concern campuses"
  ON public.safety_concern_profile_campuses
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_safety_concerns(church_id));

CREATE POLICY "Managers can delete safety concern campuses"
  ON public.safety_concern_profile_campuses
  FOR DELETE
  TO authenticated
  USING (public.can_manage_safety_concerns(church_id));

GRANT SELECT, INSERT, DELETE ON public.safety_concern_profile_campuses TO authenticated;

-- Photos
DROP POLICY IF EXISTS "Authorized members can view safety concern photos"
  ON public.safety_concern_photos;
DROP POLICY IF EXISTS "Managers can insert safety concern photos"
  ON public.safety_concern_photos;
DROP POLICY IF EXISTS "Managers can update safety concern photos"
  ON public.safety_concern_photos;

CREATE POLICY "Authorized members can view safety concern photos"
  ON public.safety_concern_photos
  FOR SELECT
  TO authenticated
  USING (public.can_view_safety_concern_profile(profile_id));

CREATE POLICY "Managers can insert safety concern photos"
  ON public.safety_concern_photos
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_manage_safety_concerns(church_id)
    AND uploaded_by = auth.uid()
  );

CREATE POLICY "Managers can update safety concern photos"
  ON public.safety_concern_photos
  FOR UPDATE
  TO authenticated
  USING (public.can_manage_safety_concerns(church_id))
  WITH CHECK (public.can_manage_safety_concerns(church_id));

GRANT SELECT, INSERT, UPDATE ON public.safety_concern_photos TO authenticated;

-- Incident links
DROP POLICY IF EXISTS "Authorized members can view safety concern incidents"
  ON public.safety_concern_incidents;
DROP POLICY IF EXISTS "Managers can insert safety concern incidents"
  ON public.safety_concern_incidents;
DROP POLICY IF EXISTS "Managers can delete safety concern incidents"
  ON public.safety_concern_incidents;

CREATE POLICY "Authorized members can view safety concern incidents"
  ON public.safety_concern_incidents
  FOR SELECT
  TO authenticated
  USING (public.can_view_safety_concern_profile(profile_id));

CREATE POLICY "Managers can insert safety concern incidents"
  ON public.safety_concern_incidents
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_safety_concerns(church_id));

CREATE POLICY "Managers can delete safety concern incidents"
  ON public.safety_concern_incidents
  FOR DELETE
  TO authenticated
  USING (public.can_manage_safety_concerns(church_id));

GRANT SELECT, INSERT, DELETE ON public.safety_concern_incidents TO authenticated;

-- Reviews (managers only for write; viewers who can see profile can read history)
DROP POLICY IF EXISTS "Authorized members can view safety concern reviews"
  ON public.safety_concern_reviews;
DROP POLICY IF EXISTS "Managers can insert safety concern reviews"
  ON public.safety_concern_reviews;

CREATE POLICY "Authorized members can view safety concern reviews"
  ON public.safety_concern_reviews
  FOR SELECT
  TO authenticated
  USING (
    public.can_view_safety_concern_profile(profile_id)
    AND public.can_manage_safety_concerns(church_id)
  );

CREATE POLICY "Managers can insert safety concern reviews"
  ON public.safety_concern_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_manage_safety_concerns(church_id)
    AND reviewed_by = auth.uid()
  );

GRANT SELECT, INSERT ON public.safety_concern_reviews TO authenticated;

-- ---------------------------------------------------------------------------
-- Storage bucket: safety-concern-photos (private)
-- Path: churches/{church_id}/safety-concerns/{profile_id}/{uuid}.{ext}
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'safety-concern-photos',
  'safety-concern-photos',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.church_id_from_safety_concern_photo_path(object_name text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  parts text[];
  church_id uuid;
BEGIN
  parts := string_to_array(object_name, '/');
  -- churches / {church_id} / safety-concerns / {profile_id} / file
  IF array_length(parts, 1) < 5 THEN
    RETURN NULL;
  END IF;
  IF parts[1] <> 'churches' OR parts[3] <> 'safety-concerns' THEN
    RETURN NULL;
  END IF;
  BEGIN
    church_id := parts[2]::uuid;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  RETURN church_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.profile_id_from_safety_concern_photo_path(object_name text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  parts text[];
  profile_id uuid;
BEGIN
  parts := string_to_array(object_name, '/');
  IF array_length(parts, 1) < 5 THEN
    RETURN NULL;
  END IF;
  IF parts[1] <> 'churches' OR parts[3] <> 'safety-concerns' THEN
    RETURN NULL;
  END IF;
  BEGIN
    profile_id := parts[4]::uuid;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  RETURN profile_id;
END;
$$;

REVOKE ALL ON FUNCTION public.church_id_from_safety_concern_photo_path(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.profile_id_from_safety_concern_photo_path(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.church_id_from_safety_concern_photo_path(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.profile_id_from_safety_concern_photo_path(text) TO authenticated;

DROP POLICY IF EXISTS "Authorized members can read safety concern photos"
  ON storage.objects;
DROP POLICY IF EXISTS "Managers can upload safety concern photos"
  ON storage.objects;
DROP POLICY IF EXISTS "Managers can update safety concern photos objects"
  ON storage.objects;
DROP POLICY IF EXISTS "Managers can delete safety concern photos objects"
  ON storage.objects;

CREATE POLICY "Authorized members can read safety concern photos"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'safety-concern-photos'
    AND public.can_view_safety_concern_profile(
      public.profile_id_from_safety_concern_photo_path(name)
    )
  );

CREATE POLICY "Managers can upload safety concern photos"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'safety-concern-photos'
    AND public.can_manage_safety_concerns(
      public.church_id_from_safety_concern_photo_path(name)
    )
  );

CREATE POLICY "Managers can update safety concern photos objects"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'safety-concern-photos'
    AND public.can_manage_safety_concerns(
      public.church_id_from_safety_concern_photo_path(name)
    )
  )
  WITH CHECK (
    bucket_id = 'safety-concern-photos'
    AND public.can_manage_safety_concerns(
      public.church_id_from_safety_concern_photo_path(name)
    )
  );

CREATE POLICY "Managers can delete safety concern photos objects"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'safety-concern-photos'
    AND public.can_manage_safety_concerns(
      public.church_id_from_safety_concern_photo_path(name)
    )
  );

-- ---------------------------------------------------------------------------
-- Subscription feature definitions + plan seeds
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
  (
    'safety_concerns.profiles.enabled',
    'Known Safety Concerns',
    'Restricted Safety Concern Profiles with photos and operational notes for authorized security personnel.',
    'incidents',
    'boolean',
    false,
    NULL,
    NULL,
    true,
    'Known Safety Concerns',
    'incidents',
    60
  ),
  (
    'safety_concerns.photos.max_per_profile',
    'Safety concern photos per profile',
    'Maximum photos allowed on a single Safety Concern Profile.',
    'incidents',
    'integer',
    NULL,
    3,
    'photos',
    true,
    'Photos per safety profile',
    'incidents',
    70
  ),
  (
    'safety_concerns.photos.max_size_mb',
    'Safety concern photo size',
    'Maximum size of each Safety Concern Profile photo in megabytes.',
    'incidents',
    'integer',
    NULL,
    10,
    'MB',
    true,
    'Safety photo size',
    'incidents',
    80
  ),
  (
    'safety_concerns.profiles.max_active',
    'Active safety concern profiles',
    'Maximum active Safety Concern Profiles. NULL means unlimited when the feature is enabled.',
    'incidents',
    'integer',
    NULL,
    25,
    'profiles',
    true,
    'Active safety profiles',
    'incidents',
    90
  )
ON CONFLICT (feature_key) DO NOTHING;

-- Default matrix: off on Servant Standard; on Steward Pro and above.
SELECT public.seed_plan_feature_boolean(
  'servant_standard', 'safety_concerns.profiles.enabled', false, false, NULL
);
SELECT public.seed_plan_feature_integer(
  'servant_standard', 'safety_concerns.photos.max_per_profile', 0, false, NULL
);
SELECT public.seed_plan_feature_integer(
  'servant_standard', 'safety_concerns.photos.max_size_mb', 0, false, NULL
);
SELECT public.seed_plan_feature_integer(
  'servant_standard', 'safety_concerns.profiles.max_active', 0, false, NULL
);

SELECT public.seed_plan_feature_boolean(
  'steward_pro', 'safety_concerns.profiles.enabled', true, false, NULL
);
SELECT public.seed_plan_feature_integer(
  'steward_pro', 'safety_concerns.photos.max_per_profile', 3, false, NULL
);
SELECT public.seed_plan_feature_integer(
  'steward_pro', 'safety_concerns.photos.max_size_mb', 10, false, NULL
);
SELECT public.seed_plan_feature_integer(
  'steward_pro', 'safety_concerns.profiles.max_active', 25, false, NULL
);

SELECT public.seed_plan_feature_boolean(
  'shepherd_plus', 'safety_concerns.profiles.enabled', true, true, 'steward_pro'
);
SELECT public.seed_plan_feature_integer(
  'shepherd_plus', 'safety_concerns.photos.max_per_profile', 3, true, 'steward_pro'
);
SELECT public.seed_plan_feature_integer(
  'shepherd_plus', 'safety_concerns.photos.max_size_mb', 10, true, 'steward_pro'
);
SELECT public.seed_plan_feature_integer(
  'shepherd_plus', 'safety_concerns.profiles.max_active', 50, false, NULL
);

SELECT public.seed_plan_feature_boolean(
  'omni_enterprise', 'safety_concerns.profiles.enabled', true, true, 'shepherd_plus'
);
SELECT public.seed_plan_feature_integer(
  'omni_enterprise', 'safety_concerns.photos.max_per_profile', 3, true, 'shepherd_plus'
);
SELECT public.seed_plan_feature_integer(
  'omni_enterprise', 'safety_concerns.photos.max_size_mb', 10, true, 'shepherd_plus'
);
-- Unlimited active profiles on Omni (NULL)
INSERT INTO public.plan_features (plan_id, feature_id, integer_value, is_inherited, source_plan_id)
SELECT p.id, f.id, NULL, false, NULL
FROM public.subscription_plans p
CROSS JOIN public.features f
WHERE p.plan_key = 'omni_enterprise'
  AND f.feature_key = 'safety_concerns.profiles.max_active'
ON CONFLICT (plan_id, feature_id) DO NOTHING;
