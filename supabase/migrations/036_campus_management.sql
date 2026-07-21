-- =============================================================================
-- 036_campus_management.sql
-- Multi-campus architecture: extend campuses, campus_memberships,
-- campus_locations, access helpers, optional campus_id on incidents/events.
-- Additive / non-destructive. Safe to re-run.
-- Review before applying to production Supabase (Phase 2 — do not auto-apply).
--
-- ARCHITECTURE:
--   Church = tenant / ownership boundary (unchanged).
--   Campus = operational subdivision under one church (NOT a separate tenant).
--   campus_memberships = member ↔ campus assignments + campus roles.
--   Owners / co_owners / administrators have implicit all-campus access.
--   Church security_leader has implicit operational campus access by default.
--
-- ROLE-PERMISSION MATRIX (application + RLS):
--   Manage campuses (create/update/archive, set primary)
--     → owner | co_owner | administrator
--   Manage campus memberships (assign/remove/change campus role)
--     → owner | co_owner | administrator
--       | campus_leader | campus_administrator on that campus
--   View campus directory
--     → church-wide access roles OR active campus membership on that campus
--   Access campus-scoped operational records (Phase 6+)
--     → can_access_campus(campus_id) OR church-wide record (campus_id IS NULL)
--
-- EXISTING-DATA STRATEGY:
--   - Ensure every church has ≥1 campus; mark one is_primary.
--   - Do NOT auto-assign historical incidents/events to primary campus
--     (new campus_id columns remain NULL = church-wide).
--   - Seed campus_memberships for active non-admin members onto primary
--     campus so restricted campus SELECT does not blank existing UIs.
--
-- APPLY AFTER: 030 (co_owner), ideally 027–035 already applied.
-- ops_delete_user_by_email.sql clears campus_memberships / campus_locations
-- before membership and campus deletes (authenticated cannot DELETE those rows).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- Expand campus_status beyond active/inactive (additive only).
ALTER TYPE public.campus_status ADD VALUE IF NOT EXISTS 'planned';
ALTER TYPE public.campus_status ADD VALUE IF NOT EXISTS 'suspended';
ALTER TYPE public.campus_status ADD VALUE IF NOT EXISTS 'closed';
ALTER TYPE public.campus_status ADD VALUE IF NOT EXISTS 'archived';

DO $$ BEGIN
  CREATE TYPE public.campus_type AS ENUM (
    'main',
    'satellite',
    'administrative',
    'school',
    'event_center',
    'office',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.campus_membership_status AS ENUM (
    'active',
    'inactive',
    'removed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.campus_role AS ENUM (
    'campus_leader',
    'campus_administrator',
    'campus_security_leader',
    'campus_security_member',
    'campus_staff',
    'campus_viewer'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.campus_location_type AS ENUM (
    'building',
    'floor',
    'room',
    'entrance',
    'parking_area',
    'playground',
    'office',
    'worship_area',
    'classroom',
    'security_office',
    'storage',
    'utility',
    'zone',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.campus_location_status AS ENUM (
    'active',
    'inactive',
    'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Extend campuses
-- ---------------------------------------------------------------------------

ALTER TABLE public.campuses
  ADD COLUMN IF NOT EXISTS short_name text,
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS campus_type public.campus_type
    NOT NULL DEFAULT 'other'::public.campus_type,
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS primary_email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'US',
  ADD COLUMN IF NOT EXISTS emergency_contact_name text,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone text,
  ADD COLUMN IF NOT EXISTS police_non_emergency_phone text,
  ADD COLUMN IF NOT EXISTS fire_non_emergency_phone text,
  ADD COLUMN IF NOT EXISTS nearest_hospital_name text,
  ADD COLUMN IF NOT EXISTS nearest_hospital_phone text,
  ADD COLUMN IF NOT EXISTS nearest_hospital_address text,
  ADD COLUMN IF NOT EXISTS logo_path text,
  ADD COLUMN IF NOT EXISTS primary_brand_color text,
  ADD COLUMN IF NOT EXISTS secondary_brand_color text,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Length / format checks (idempotent via drop/add)
ALTER TABLE public.campuses DROP CONSTRAINT IF EXISTS campuses_name_len;
ALTER TABLE public.campuses
  ADD CONSTRAINT campuses_name_len CHECK (char_length(trim(name)) BETWEEN 1 AND 200);

ALTER TABLE public.campuses DROP CONSTRAINT IF EXISTS campuses_short_name_len;
ALTER TABLE public.campuses
  ADD CONSTRAINT campuses_short_name_len CHECK (
    short_name IS NULL OR char_length(trim(short_name)) BETWEEN 1 AND 64
  );

ALTER TABLE public.campuses DROP CONSTRAINT IF EXISTS campuses_slug_format;
ALTER TABLE public.campuses
  ADD CONSTRAINT campuses_slug_format CHECK (
    slug IS NULL
    OR slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  );

ALTER TABLE public.campuses DROP CONSTRAINT IF EXISTS campuses_description_len;
ALTER TABLE public.campuses
  ADD CONSTRAINT campuses_description_len CHECK (
    description IS NULL OR char_length(description) <= 4000
  );

-- Unique name / slug per church (slugs nullable until backfilled)
CREATE UNIQUE INDEX IF NOT EXISTS campuses_church_name_unique
  ON public.campuses (church_id, lower(trim(name)));

CREATE UNIQUE INDEX IF NOT EXISTS campuses_church_slug_unique
  ON public.campuses (church_id, slug)
  WHERE slug IS NOT NULL;

-- At most one primary campus per church
CREATE UNIQUE INDEX IF NOT EXISTS campuses_one_primary_per_church
  ON public.campuses (church_id)
  WHERE is_primary = true;

CREATE INDEX IF NOT EXISTS campuses_church_status_idx
  ON public.campuses (church_id, status);

CREATE INDEX IF NOT EXISTS campuses_church_type_idx
  ON public.campuses (church_id, campus_type);

-- ---------------------------------------------------------------------------
-- Backfill campuses for churches missing any; set primary + slug
-- ---------------------------------------------------------------------------

-- Create a Main Campus for churches with zero campus rows
INSERT INTO public.campuses (
  church_id,
  name,
  short_name,
  slug,
  campus_type,
  is_primary,
  status,
  timezone,
  address_line_1,
  address_line_2,
  city,
  state,
  postal_code,
  created_at,
  updated_at
)
SELECT
  c.id,
  'Main Campus',
  'Main',
  'main',
  'main'::public.campus_type,
  true,
  'active'::public.campus_status,
  COALESCE(NULLIF(trim(c.timezone), ''), 'America/Los_Angeles'),
  c.address_line_1,
  c.address_line_2,
  c.city,
  c.state,
  c.postal_code,
  now(),
  now()
FROM public.churches c
WHERE NOT EXISTS (
  SELECT 1 FROM public.campuses x WHERE x.church_id = c.id
);

-- Mark exactly one primary when none flagged (prefer oldest active)
WITH ranked AS (
  SELECT
    id,
    church_id,
    row_number() OVER (
      PARTITION BY church_id
      ORDER BY
        CASE WHEN status = 'active'::public.campus_status THEN 0 ELSE 1 END,
        created_at ASC NULLS LAST,
        name ASC
    ) AS rn
  FROM public.campuses
),
churches_without_primary AS (
  SELECT church_id
  FROM public.campuses
  GROUP BY church_id
  HAVING bool_or(is_primary) = false
)
UPDATE public.campuses camp
SET
  is_primary = true,
  campus_type = CASE
    WHEN camp.campus_type = 'other'::public.campus_type THEN 'main'::public.campus_type
    ELSE camp.campus_type
  END,
  updated_at = now()
FROM ranked r
JOIN churches_without_primary w ON w.church_id = r.church_id
WHERE camp.id = r.id
  AND r.rn = 1;

-- Backfill slugs where missing
UPDATE public.campuses
SET slug = CASE
  WHEN is_primary THEN 'main'
  ELSE 'campus-' || replace(left(id::text, 8), '-', '')
END
WHERE slug IS NULL;

UPDATE public.campuses
SET short_name = left(trim(name), 64)
WHERE short_name IS NULL;

-- ---------------------------------------------------------------------------
-- campus_memberships
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.campus_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  campus_id uuid NOT NULL REFERENCES public.campuses (id) ON DELETE CASCADE,
  church_membership_id uuid NOT NULL
    REFERENCES public.church_memberships (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  campus_role public.campus_role NOT NULL
    DEFAULT 'campus_viewer'::public.campus_role,
  status public.campus_membership_status NOT NULL
    DEFAULT 'active'::public.campus_membership_status,
  is_primary_campus boolean NOT NULL DEFAULT false,
  assigned_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS campus_memberships_active_unique
  ON public.campus_memberships (campus_id, church_membership_id)
  WHERE status = 'active'::public.campus_membership_status;

CREATE UNIQUE INDEX IF NOT EXISTS campus_memberships_one_primary_per_member
  ON public.campus_memberships (church_membership_id)
  WHERE is_primary_campus = true
    AND status = 'active'::public.campus_membership_status;

CREATE INDEX IF NOT EXISTS campus_memberships_church_campus_user_idx
  ON public.campus_memberships (church_id, campus_id, user_id, status);

CREATE INDEX IF NOT EXISTS campus_memberships_membership_status_idx
  ON public.campus_memberships (church_membership_id, status);

CREATE INDEX IF NOT EXISTS campus_memberships_user_status_idx
  ON public.campus_memberships (user_id, status);

DROP TRIGGER IF EXISTS campus_memberships_updated_at ON public.campus_memberships;
CREATE TRIGGER campus_memberships_updated_at
  BEFORE UPDATE ON public.campus_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Scope enforcement: campus + church_membership must match church_id
CREATE OR REPLACE FUNCTION public.campus_memberships_enforce_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campus_church uuid;
  v_membership_church uuid;
  v_membership_user uuid;
  v_membership_status public.membership_status;
BEGIN
  SELECT church_id INTO v_campus_church
  FROM public.campuses
  WHERE id = NEW.campus_id;

  IF v_campus_church IS NULL THEN
    RAISE EXCEPTION 'Campus not found.';
  END IF;

  IF v_campus_church IS DISTINCT FROM NEW.church_id THEN
    RAISE EXCEPTION 'Campus does not belong to the given church.';
  END IF;

  SELECT church_id, user_id, status
  INTO v_membership_church, v_membership_user, v_membership_status
  FROM public.church_memberships
  WHERE id = NEW.church_membership_id;

  IF v_membership_church IS NULL THEN
    RAISE EXCEPTION 'Church membership not found.';
  END IF;

  IF v_membership_church IS DISTINCT FROM NEW.church_id THEN
    RAISE EXCEPTION 'Church membership does not belong to the given church.';
  END IF;

  IF v_membership_user IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'Campus membership user_id must match church membership user.';
  END IF;

  IF TG_OP = 'INSERT'
     AND NEW.status = 'active'::public.campus_membership_status
     AND v_membership_status IS DISTINCT FROM 'active'::public.membership_status THEN
    RAISE EXCEPTION 'Only active church members may receive active campus memberships.';
  END IF;

  IF NEW.status = 'removed'::public.campus_membership_status
     AND NEW.removed_at IS NULL THEN
    NEW.removed_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS campus_memberships_enforce_scope
  ON public.campus_memberships;
CREATE TRIGGER campus_memberships_enforce_scope
  BEFORE INSERT OR UPDATE ON public.campus_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.campus_memberships_enforce_scope();

-- When church membership leaves active, deactivate campus memberships
CREATE OR REPLACE FUNCTION public.church_membership_sync_campus_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'active'::public.membership_status
     AND (
       TG_OP = 'INSERT'
       OR OLD.status IS DISTINCT FROM NEW.status
     ) THEN
    UPDATE public.campus_memberships cm
    SET
      status = 'removed'::public.campus_membership_status,
      removed_at = COALESCE(cm.removed_at, now()),
      is_primary_campus = false,
      updated_at = now()
    WHERE cm.church_membership_id = NEW.id
      AND cm.status = 'active'::public.campus_membership_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS church_memberships_sync_campus_access
  ON public.church_memberships;
CREATE TRIGGER church_memberships_sync_campus_access
  AFTER INSERT OR UPDATE OF status ON public.church_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.church_membership_sync_campus_access();

-- Seed non-admin active members onto primary campus (display / filter access)
INSERT INTO public.campus_memberships (
  church_id,
  campus_id,
  church_membership_id,
  user_id,
  campus_role,
  status,
  is_primary_campus,
  assigned_at
)
SELECT
  m.church_id,
  p.id AS campus_id,
  m.id AS church_membership_id,
  m.user_id,
  CASE m.role::text
    WHEN 'security_leader' THEN 'campus_security_leader'::public.campus_role
    WHEN 'security_member' THEN 'campus_security_member'::public.campus_role
    ELSE 'campus_viewer'::public.campus_role
  END,
  'active'::public.campus_membership_status,
  true,
  now()
FROM public.church_memberships m
JOIN public.campuses p
  ON p.church_id = m.church_id
 AND p.is_primary = true
WHERE m.status = 'active'::public.membership_status
  AND m.role::text NOT IN ('owner', 'co_owner', 'administrator')
  AND NOT EXISTS (
    SELECT 1
    FROM public.campus_memberships cm
    WHERE cm.campus_id = p.id
      AND cm.church_membership_id = m.id
      AND cm.status = 'active'::public.campus_membership_status
  );

-- ---------------------------------------------------------------------------
-- campus_locations (hierarchy ready; UI optional in later phases)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.campus_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  campus_id uuid NOT NULL REFERENCES public.campuses (id) ON DELETE CASCADE,
  parent_location_id uuid REFERENCES public.campus_locations (id) ON DELETE SET NULL,
  name text NOT NULL,
  location_type public.campus_location_type NOT NULL
    DEFAULT 'other'::public.campus_location_type,
  building text,
  floor text,
  room text,
  zone text,
  description text,
  status public.campus_location_status NOT NULL
    DEFAULT 'active'::public.campus_location_status,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campus_locations_name_len CHECK (char_length(trim(name)) BETWEEN 1 AND 200),
  CONSTRAINT campus_locations_description_len CHECK (
    description IS NULL OR char_length(description) <= 2000
  )
);

CREATE INDEX IF NOT EXISTS campus_locations_church_campus_idx
  ON public.campus_locations (church_id, campus_id);

CREATE INDEX IF NOT EXISTS campus_locations_parent_idx
  ON public.campus_locations (parent_location_id)
  WHERE parent_location_id IS NOT NULL;

DROP TRIGGER IF EXISTS campus_locations_updated_at ON public.campus_locations;
CREATE TRIGGER campus_locations_updated_at
  BEFORE UPDATE ON public.campus_locations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.campus_locations_enforce_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campus_church uuid;
  v_parent_campus uuid;
BEGIN
  SELECT church_id INTO v_campus_church
  FROM public.campuses
  WHERE id = NEW.campus_id;

  IF v_campus_church IS NULL OR v_campus_church IS DISTINCT FROM NEW.church_id THEN
    RAISE EXCEPTION 'Location campus must belong to the same church.';
  END IF;

  IF NEW.parent_location_id IS NOT NULL THEN
    SELECT campus_id INTO v_parent_campus
    FROM public.campus_locations
    WHERE id = NEW.parent_location_id;

    IF v_parent_campus IS NULL OR v_parent_campus IS DISTINCT FROM NEW.campus_id THEN
      RAISE EXCEPTION 'Parent location must belong to the same campus.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS campus_locations_enforce_scope ON public.campus_locations;
CREATE TRIGGER campus_locations_enforce_scope
  BEFORE INSERT OR UPDATE ON public.campus_locations
  FOR EACH ROW
  EXECUTE FUNCTION public.campus_locations_enforce_scope();

-- ---------------------------------------------------------------------------
-- Optional campus_id on incidents + device events (church-wide = NULL)
-- ---------------------------------------------------------------------------

ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS campus_id uuid
    REFERENCES public.campuses (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS incidents_church_campus_status_idx
  ON public.incidents (church_id, campus_id, status);

CREATE OR REPLACE FUNCTION public.incidents_enforce_campus_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campus_church uuid;
BEGIN
  IF NEW.campus_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT church_id INTO v_campus_church
  FROM public.campuses
  WHERE id = NEW.campus_id;

  IF v_campus_church IS NULL OR v_campus_church IS DISTINCT FROM NEW.church_id THEN
    RAISE EXCEPTION 'Incident campus must belong to the incident church.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS incidents_enforce_campus_scope ON public.incidents;
CREATE TRIGGER incidents_enforce_campus_scope
  BEFORE INSERT OR UPDATE OF campus_id, church_id ON public.incidents
  FOR EACH ROW
  EXECUTE FUNCTION public.incidents_enforce_campus_scope();

-- Device / alarm telemetry table (public.events) — optional campus tag
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS campus_id uuid
    REFERENCES public.campuses (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS events_church_campus_idx
  ON public.events (church_id, campus_id)
  WHERE campus_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.events_enforce_campus_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campus_church uuid;
BEGIN
  IF NEW.campus_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT church_id INTO v_campus_church
  FROM public.campuses
  WHERE id = NEW.campus_id;

  IF v_campus_church IS NULL OR v_campus_church IS DISTINCT FROM NEW.church_id THEN
    RAISE EXCEPTION 'Event campus must belong to the event church.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_enforce_campus_scope ON public.events;
CREATE TRIGGER events_enforce_campus_scope
  BEFORE INSERT OR UPDATE OF campus_id, church_id ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.events_enforce_campus_scope();

-- ---------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.has_church_wide_campus_access(p_church_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Organization-wide campus visibility / management eligibility
  SELECT public.has_church_role(
    p_church_id,
    ARRAY['owner', 'co_owner', 'administrator']
  );
$$;

CREATE OR REPLACE FUNCTION public.has_church_wide_campus_ops_access(p_church_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Operational all-campus access (security leadership included)
  SELECT public.has_church_role(
    p_church_id,
    ARRAY['owner', 'co_owner', 'administrator', 'security_leader']
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_campuses(p_church_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_church_role(
    p_church_id,
    ARRAY['owner', 'co_owner', 'administrator']
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_campus(p_campus_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.campuses camp
    JOIN public.churches c ON c.id = camp.church_id
    WHERE camp.id = p_campus_id
      AND c.status IN (
        'trial'::public.church_status,
        'active'::public.church_status
      )
      AND (
        public.has_church_wide_campus_ops_access(camp.church_id)
        OR EXISTS (
          SELECT 1
          FROM public.campus_memberships cm
          JOIN public.church_memberships m
            ON m.id = cm.church_membership_id
          WHERE cm.campus_id = camp.id
            AND cm.user_id = auth.uid()
            AND cm.status = 'active'::public.campus_membership_status
            AND m.status = 'active'::public.membership_status
            AND m.user_id = auth.uid()
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_campus_memberships(p_campus_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.campuses camp
    WHERE camp.id = p_campus_id
      AND (
        public.can_manage_campuses(camp.church_id)
        OR EXISTS (
          SELECT 1
          FROM public.campus_memberships cm
          JOIN public.church_memberships m
            ON m.id = cm.church_membership_id
          WHERE cm.campus_id = camp.id
            AND cm.user_id = auth.uid()
            AND cm.status = 'active'::public.campus_membership_status
            AND m.status = 'active'::public.membership_status
            AND cm.campus_role IN (
              'campus_leader'::public.campus_role,
              'campus_administrator'::public.campus_role
            )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_campus_directory(p_campus_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Directory visibility: org-wide managers OR any active campus membership
  -- OR church-wide ops roles (security leaders need to see all campus names)
  SELECT EXISTS (
    SELECT 1
    FROM public.campuses camp
    WHERE camp.id = p_campus_id
      AND public.has_active_church_membership(camp.church_id)
      AND (
        public.has_church_wide_campus_ops_access(camp.church_id)
        OR public.can_access_campus(p_campus_id)
      )
  );
$$;

REVOKE ALL ON FUNCTION public.has_church_wide_campus_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_church_wide_campus_ops_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_campuses(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_campus(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_campus_memberships(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_campus_directory(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.has_church_wide_campus_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_church_wide_campus_ops_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_campuses(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_campus(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_campus_memberships(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_campus_directory(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.has_church_wide_campus_access(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_church_wide_campus_ops_access(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_campuses(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_access_campus(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_campus_memberships(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_view_campus_directory(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- RLS: campuses (replace manager gate with can_manage_campuses)
-- ---------------------------------------------------------------------------

ALTER TABLE public.campuses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read campuses" ON public.campuses;
DROP POLICY IF EXISTS "Managers can insert campuses" ON public.campuses;
DROP POLICY IF EXISTS "Managers can update campuses" ON public.campuses;
DROP POLICY IF EXISTS "Members view accessible campuses" ON public.campuses;
DROP POLICY IF EXISTS "Admins manage campuses insert" ON public.campuses;
DROP POLICY IF EXISTS "Admins manage campuses update" ON public.campuses;

CREATE POLICY "Members view accessible campuses"
  ON public.campuses FOR SELECT TO authenticated
  USING (public.can_view_campus_directory(id));

CREATE POLICY "Admins manage campuses insert"
  ON public.campuses FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_campuses(church_id));

CREATE POLICY "Admins manage campuses update"
  ON public.campuses FOR UPDATE TO authenticated
  USING (public.can_manage_campuses(church_id))
  WITH CHECK (public.can_manage_campuses(church_id));

GRANT SELECT ON public.campuses TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.campuses TO authenticated;
REVOKE DELETE ON public.campuses FROM authenticated;

-- ---------------------------------------------------------------------------
-- RLS: campus_memberships
-- ---------------------------------------------------------------------------

ALTER TABLE public.campus_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view campus memberships" ON public.campus_memberships;
DROP POLICY IF EXISTS "Managers insert campus memberships" ON public.campus_memberships;
DROP POLICY IF EXISTS "Managers update campus memberships" ON public.campus_memberships;

CREATE POLICY "Members view campus memberships"
  ON public.campus_memberships FOR SELECT TO authenticated
  USING (
    public.has_church_wide_campus_ops_access(church_id)
    OR user_id = auth.uid()
    OR public.can_manage_campus_memberships(campus_id)
  );

CREATE POLICY "Managers insert campus memberships"
  ON public.campus_memberships FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_campus_memberships(campus_id));

CREATE POLICY "Managers update campus memberships"
  ON public.campus_memberships FOR UPDATE TO authenticated
  USING (public.can_manage_campus_memberships(campus_id))
  WITH CHECK (public.can_manage_campus_memberships(campus_id));

GRANT SELECT ON public.campus_memberships TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.campus_memberships TO authenticated;
REVOKE DELETE ON public.campus_memberships FROM authenticated;

-- ---------------------------------------------------------------------------
-- RLS: campus_locations
-- ---------------------------------------------------------------------------

ALTER TABLE public.campus_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view campus locations" ON public.campus_locations;
DROP POLICY IF EXISTS "Managers insert campus locations" ON public.campus_locations;
DROP POLICY IF EXISTS "Managers update campus locations" ON public.campus_locations;

CREATE POLICY "Members view campus locations"
  ON public.campus_locations FOR SELECT TO authenticated
  USING (public.can_access_campus(campus_id));

CREATE POLICY "Managers insert campus locations"
  ON public.campus_locations FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_campuses(church_id)
    OR public.can_manage_campus_memberships(campus_id)
  );

CREATE POLICY "Managers update campus locations"
  ON public.campus_locations FOR UPDATE TO authenticated
  USING (
    public.can_manage_campuses(church_id)
    OR public.can_manage_campus_memberships(campus_id)
  )
  WITH CHECK (
    public.can_manage_campuses(church_id)
    OR public.can_manage_campus_memberships(campus_id)
  );

GRANT SELECT ON public.campus_locations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.campus_locations TO authenticated;
REVOKE DELETE ON public.campus_locations FROM authenticated;

-- ---------------------------------------------------------------------------
-- Keep create_church_with_owner creating a primary Main campus with new cols
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_church_with_owner(
  p_name text,
  p_primary_email text,
  p_phone text,
  p_address_line_1 text,
  p_city text,
  p_state text,
  p_postal_code text,
  p_timezone text,
  p_campus_name text,
  p_address_line_2 text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_name text := trim(both from coalesce(p_name, ''));
  v_campus_name text := trim(both from coalesce(p_campus_name, ''));
  v_email text := nullif(trim(both from coalesce(p_primary_email, '')), '');
  v_phone text := nullif(trim(both from coalesce(p_phone, '')), '');
  v_address_1 text := nullif(trim(both from coalesce(p_address_line_1, '')), '');
  v_address_2 text := nullif(trim(both from coalesce(p_address_line_2, '')), '');
  v_city text := nullif(trim(both from coalesce(p_city, '')), '');
  v_state text := nullif(trim(both from coalesce(p_state, '')), '');
  v_postal text := nullif(trim(both from coalesce(p_postal_code, '')), '');
  v_timezone text := coalesce(
    nullif(trim(both from coalesce(p_timezone, '')), ''),
    'America/Los_Angeles'
  );
  v_slug text;
  v_base_slug text;
  v_church_id uuid;
  v_campus_id uuid;
  v_membership_id uuid;
  v_i int := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: You must be signed in to create a church.';
  END IF;

  IF v_name = '' THEN
    RAISE EXCEPTION 'VALIDATION: Church name is required.';
  END IF;

  IF v_campus_name = '' THEN
    RAISE EXCEPTION 'VALIDATION: Primary campus name is required.';
  END IF;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'VALIDATION: Primary email is required.';
  END IF;

  IF v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'VALIDATION: Primary email is invalid.';
  END IF;

  v_base_slug := lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_base_slug := trim(both '-' from v_base_slug);
  IF v_base_slug = '' THEN
    v_base_slug := 'church';
  END IF;
  v_slug := v_base_slug;

  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.churches ch WHERE ch.slug = v_slug
    );
    v_i := v_i + 1;
    v_slug := v_base_slug || '-' || v_i::text;
    IF v_i > 1000 THEN
      RAISE EXCEPTION 'Unable to allocate a unique church slug.';
    END IF;
  END LOOP;

  INSERT INTO public.churches (
    name,
    slug,
    primary_email,
    phone,
    address_line_1,
    address_line_2,
    city,
    state,
    postal_code,
    timezone,
    status,
    created_at,
    updated_at
  )
  VALUES (
    v_name,
    v_slug,
    v_email,
    v_phone,
    v_address_1,
    v_address_2,
    v_city,
    v_state,
    v_postal,
    v_timezone,
    'trial'::public.church_status,
    now(),
    now()
  )
  RETURNING id INTO v_church_id;

  INSERT INTO public.campuses (
    church_id,
    name,
    short_name,
    slug,
    campus_type,
    is_primary,
    address_line_1,
    address_line_2,
    city,
    state,
    postal_code,
    timezone,
    status,
    created_by,
    updated_by,
    created_at,
    updated_at
  )
  VALUES (
    v_church_id,
    v_campus_name,
    left(v_campus_name, 64),
    'main',
    'main'::public.campus_type,
    true,
    v_address_1,
    v_address_2,
    v_city,
    v_state,
    v_postal,
    v_timezone,
    'active'::public.campus_status,
    v_user_id,
    v_user_id,
    now(),
    now()
  )
  RETURNING id INTO v_campus_id;

  IF v_campus_id IS NULL THEN
    RAISE EXCEPTION 'Failed to create primary campus.';
  END IF;

  INSERT INTO public.church_memberships (
    church_id,
    user_id,
    role,
    status,
    invited_by,
    joined_at,
    created_at,
    updated_at
  )
  VALUES (
    v_church_id,
    v_user_id,
    'owner'::public.membership_role,
    'active'::public.membership_status,
    v_user_id,
    now(),
    now(),
    now()
  )
  RETURNING id INTO v_membership_id;

  INSERT INTO public.audit_logs (
    church_id,
    user_id,
    action,
    entity_type,
    entity_id,
    metadata,
    created_at
  )
  VALUES (
    v_church_id,
    v_user_id,
    'church.created',
    'church',
    v_church_id,
    jsonb_build_object(
      'campus_id', v_campus_id,
      'membership_id', v_membership_id,
      'role', 'owner',
      'campus_name', v_campus_name
    ),
    now()
  );

  INSERT INTO public.audit_logs (
    church_id,
    user_id,
    action,
    entity_type,
    entity_id,
    metadata,
    created_at
  )
  VALUES (
    v_church_id,
    v_user_id,
    'campus.created',
    'campus',
    v_campus_id,
    jsonb_build_object(
      'name', v_campus_name,
      'is_primary', true,
      'campus_type', 'main'
    ),
    now()
  );

  RETURN jsonb_build_object(
    'church_id', v_church_id,
    'campus_id', v_campus_id,
    'membership_id', v_membership_id,
    'slug', v_slug
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_church_with_owner(
  text, text, text, text, text, text, text, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_church_with_owner(
  text, text, text, text, text, text, text, text, text, text
) TO authenticated;

-- ---------------------------------------------------------------------------
-- Notes for application Phase 5–6 (not enforced here):
--   - Incident / event SELECT policies remain church-membership based.
--     Add campus-aware RLS only when app filter + membership UX ship together.
--   - Hardware / policies / schedule already have campus_id; filter via app
--     using can_access_campus / accessible campus list.
-- =============================================================================
