-- =============================================================================
-- 033_policy_management.sql
-- Policies & Procedures: documents, versions, categories, tags, attachments,
-- approvals, assignments, acknowledgments, review history, private storage.
-- Safe to re-run.
--
-- ROLE-PERMISSION MATRIX (application + RLS):
--   View published (audience-permitted) → active member (viewer+)
--   View drafts / manage workflow
--     → owner | co_owner | administrator | security_leader
--   Manage church policy settings / categories
--     → owner | co_owner | administrator
--   Acknowledge assigned policy (self only) → active member
--   View acknowledgment reports
--     → owner | co_owner | administrator | security_leader
--   Permanent delete of versions → not allowed in v1
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.policy_document_type AS ENUM (
    'policy',
    'procedure',
    'standard_operating_procedure',
    'emergency_plan',
    'checklist',
    'guideline',
    'training_document',
    'reference',
    'form',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.policy_document_status AS ENUM (
    'draft',
    'under_review',
    'changes_requested',
    'approved',
    'published',
    'retired',
    'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.policy_version_status AS ENUM (
    'draft',
    'under_review',
    'changes_requested',
    'approved',
    'published',
    'superseded'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.policy_content_format AS ENUM (
    'markdown',
    'rich_text_json',
    'plain_text'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.policy_audience_scope AS ENUM (
    'all_members',
    'security_team',
    'security_leadership',
    'administrators',
    'custom'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.policy_acknowledgment_status AS ENUM (
    'assigned',
    'viewed',
    'acknowledged',
    'overdue',
    'waived'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.policy_assignment_type AS ENUM (
    'all_members',
    'role',
    'security_team',
    'campus',
    'user'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.policy_attachment_type AS ENUM (
    'supporting',
    'form',
    'checklist',
    'image',
    'reference',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.policy_approval_decision AS ENUM (
    'submitted',
    'changes_requested',
    'approved',
    'published'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Permission helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_manage_policy_documents(requested_church_id uuid)
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

CREATE OR REPLACE FUNCTION public.can_manage_policy_settings(requested_church_id uuid)
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

CREATE OR REPLACE FUNCTION public.can_view_policy_acknowledgment_reports(
  requested_church_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_manage_policy_documents(requested_church_id);
$$;

-- Active membership role text for current user in a church (NULL if none).
CREATE OR REPLACE FUNCTION public.active_membership_role(requested_church_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.role::text
  FROM public.church_memberships m
  JOIN public.churches c ON c.id = m.church_id
  WHERE m.user_id = auth.uid()
    AND m.church_id = requested_church_id
    AND m.status = 'active'::public.membership_status
    AND c.status IN (
      'trial'::public.church_status,
      'active'::public.church_status
    )
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.can_manage_policy_documents(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_policy_settings(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_policy_acknowledgment_reports(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.active_membership_role(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.can_manage_policy_documents(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_policy_settings(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_policy_acknowledgment_reports(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.active_membership_role(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Church policy settings (admin defaults)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.church_policy_settings (
  church_id uuid PRIMARY KEY REFERENCES public.churches (id) ON DELETE CASCADE,
  default_review_period_days integer NOT NULL DEFAULT 365
    CHECK (default_review_period_days BETWEEN 30 AND 3650),
  default_requires_acknowledgment boolean NOT NULL DEFAULT false,
  default_acknowledgment_due_days integer NOT NULL DEFAULT 14
    CHECK (default_acknowledgment_due_days BETWEEN 1 AND 365),
  default_reacknowledge_on_publish boolean NOT NULL DEFAULT true,
  default_mobile_available boolean NOT NULL DEFAULT true,
  default_offline_mobile_allowed boolean NOT NULL DEFAULT false,
  max_attachment_bytes integer NOT NULL DEFAULT 15728640
    CHECK (max_attachment_bytes BETWEEN 1048576 AND 52428800),
  allowed_attachment_mime_types text[] NOT NULL DEFAULT ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ],
  version_numbering_strategy text NOT NULL DEFAULT 'major_minor'
    CHECK (version_numbering_strategy IN ('major_minor')),
  retention_years integer
    CHECK (retention_years IS NULL OR retention_years BETWEEN 1 AND 100),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS church_policy_settings_updated_at ON public.church_policy_settings;
CREATE TRIGGER church_policy_settings_updated_at
  BEFORE UPDATE ON public.church_policy_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.church_policy_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view church policy settings"
  ON public.church_policy_settings;
DROP POLICY IF EXISTS "Admins manage church policy settings"
  ON public.church_policy_settings;

CREATE POLICY "Members can view church policy settings"
  ON public.church_policy_settings FOR SELECT TO authenticated
  USING (public.is_active_church_member(church_id));

CREATE POLICY "Admins manage church policy settings"
  ON public.church_policy_settings FOR ALL TO authenticated
  USING (public.can_manage_policy_settings(church_id))
  WITH CHECK (public.can_manage_policy_settings(church_id));

GRANT SELECT, INSERT, UPDATE ON public.church_policy_settings TO authenticated;

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.policy_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 100,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT policy_categories_key_format CHECK (
    key ~ '^[a-z][a-z0-9_]{1,62}$'
  ),
  CONSTRAINT policy_categories_label_len CHECK (char_length(label) BETWEEN 1 AND 120),
  CONSTRAINT policy_categories_church_key_unique UNIQUE (church_id, key)
);

CREATE INDEX IF NOT EXISTS policy_categories_church_id_idx
  ON public.policy_categories (church_id)
  WHERE archived_at IS NULL;

DROP TRIGGER IF EXISTS policy_categories_updated_at ON public.policy_categories;
CREATE TRIGGER policy_categories_updated_at
  BEFORE UPDATE ON public.policy_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.policy_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view policy categories" ON public.policy_categories;
DROP POLICY IF EXISTS "Admins manage policy categories" ON public.policy_categories;

CREATE POLICY "Members can view policy categories"
  ON public.policy_categories FOR SELECT TO authenticated
  USING (public.is_active_church_member(church_id));

CREATE POLICY "Admins manage policy categories"
  ON public.policy_categories FOR ALL TO authenticated
  USING (public.can_manage_policy_settings(church_id))
  WITH CHECK (public.can_manage_policy_settings(church_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.policy_categories TO authenticated;

-- Seed default categories for a church (idempotent).
CREATE OR REPLACE FUNCTION public.ensure_default_policy_categories(p_church_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  defaults text[][] := ARRAY[
    ARRAY['emergency_response', 'Emergency Response', '10'],
    ARRAY['medical_response', 'Medical Response', '20'],
    ARRAY['security_operations', 'Security Operations', '30'],
    ARRAY['communications', 'Communications', '40'],
    ARRAY['facility_security', 'Facility Security', '50'],
    ARRAY['child_safety', 'Child Safety', '60'],
    ARRAY['volunteer_conduct', 'Volunteer Conduct', '70'],
    ARRAY['access_control', 'Access Control', '80'],
    ARRAY['camera_operations', 'Camera Operations', '90'],
    ARRAY['incident_management', 'Incident Management', '100'],
    ARRAY['cybersecurity', 'Cybersecurity', '110'],
    ARRAY['data_privacy', 'Data Privacy', '120'],
    ARRAY['equipment', 'Equipment', '130'],
    ARRAY['training', 'Training', '140'],
    ARRAY['administration', 'Administration', '150'],
    ARRAY['other', 'Other', '999']
  ];
  row_def text[];
BEGIN
  IF p_church_id IS NULL THEN
    RAISE EXCEPTION 'VALIDATION: church_id is required';
  END IF;

  FOREACH row_def SLICE 1 IN ARRAY defaults LOOP
    INSERT INTO public.policy_categories (
      church_id, key, label, is_system, sort_order
    )
    VALUES (
      p_church_id,
      row_def[1],
      row_def[2],
      true,
      row_def[3]::integer
    )
    ON CONFLICT (church_id, key) DO NOTHING;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_default_policy_categories(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_default_policy_categories(uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tags
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.policy_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT policy_tags_name_len CHECK (char_length(name) BETWEEN 1 AND 60),
  CONSTRAINT policy_tags_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,58}$'),
  CONSTRAINT policy_tags_church_slug_unique UNIQUE (church_id, slug)
);

CREATE INDEX IF NOT EXISTS policy_tags_church_id_idx ON public.policy_tags (church_id);

ALTER TABLE public.policy_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view policy tags" ON public.policy_tags;
DROP POLICY IF EXISTS "Managers manage policy tags" ON public.policy_tags;

CREATE POLICY "Members can view policy tags"
  ON public.policy_tags FOR SELECT TO authenticated
  USING (public.is_active_church_member(church_id));

CREATE POLICY "Managers manage policy tags"
  ON public.policy_tags FOR ALL TO authenticated
  USING (public.can_manage_policy_documents(church_id))
  WITH CHECK (public.can_manage_policy_documents(church_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.policy_tags TO authenticated;

-- ---------------------------------------------------------------------------
-- Documents (current_version_id FK added after versions table)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.policy_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  campus_id uuid REFERENCES public.campuses (id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.policy_categories (id) ON DELETE SET NULL,
  document_type public.policy_document_type NOT NULL DEFAULT 'policy'::public.policy_document_type,
  title text NOT NULL,
  slug text NOT NULL,
  summary text,
  status public.policy_document_status NOT NULL DEFAULT 'draft'::public.policy_document_status,
  current_version_id uuid,
  owner_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  published_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  published_at timestamptz,
  effective_date date,
  review_due_date date,
  retired_at timestamptz,
  archived_at timestamptz,
  requires_acknowledgment boolean NOT NULL DEFAULT false,
  acknowledgment_due_days integer
    CHECK (
      acknowledgment_due_days IS NULL
      OR acknowledgment_due_days BETWEEN 1 AND 365
    ),
  reacknowledge_on_publish boolean NOT NULL DEFAULT true,
  is_emergency_document boolean NOT NULL DEFAULT false,
  is_featured boolean NOT NULL DEFAULT false,
  mobile_available boolean NOT NULL DEFAULT true,
  offline_mobile_allowed boolean NOT NULL DEFAULT false,
  audience_scope public.policy_audience_scope NOT NULL
    DEFAULT 'all_members'::public.policy_audience_scope,
  minimum_role text NOT NULL DEFAULT 'viewer',
  search_vector tsvector,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT policy_documents_title_len CHECK (char_length(title) BETWEEN 1 AND 200),
  CONSTRAINT policy_documents_slug_format CHECK (
    slug ~ '^[a-z0-9][a-z0-9-]{0,78}$'
  ),
  CONSTRAINT policy_documents_summary_len CHECK (
    summary IS NULL OR char_length(summary) <= 2000
  ),
  CONSTRAINT policy_documents_church_slug_unique UNIQUE (church_id, slug),
  CONSTRAINT policy_documents_minimum_role_check CHECK (
    minimum_role IN (
      'viewer',
      'security_member',
      'security_leader',
      'administrator',
      'co_owner',
      'owner'
    )
  )
);

CREATE INDEX IF NOT EXISTS policy_documents_church_status_idx
  ON public.policy_documents (church_id, status);

CREATE INDEX IF NOT EXISTS policy_documents_church_updated_idx
  ON public.policy_documents (church_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS policy_documents_church_emergency_idx
  ON public.policy_documents (church_id, is_emergency_document)
  WHERE status = 'published'::public.policy_document_status
    AND is_emergency_document = true;

CREATE INDEX IF NOT EXISTS policy_documents_review_due_idx
  ON public.policy_documents (church_id, review_due_date)
  WHERE status = 'published'::public.policy_document_status
    AND review_due_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS policy_documents_search_idx
  ON public.policy_documents USING gin (search_vector);

DROP TRIGGER IF EXISTS policy_documents_updated_at ON public.policy_documents;
CREATE TRIGGER policy_documents_updated_at
  BEFORE UPDATE ON public.policy_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Campus must belong to same church.
CREATE OR REPLACE FUNCTION public.enforce_policy_document_campus_church()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.campus_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.campuses c
    WHERE c.id = NEW.campus_id
      AND c.church_id = NEW.church_id
  ) THEN
    RAISE EXCEPTION 'VALIDATION: campus does not belong to this church';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS policy_documents_campus_church ON public.policy_documents;
CREATE TRIGGER policy_documents_campus_church
  BEFORE INSERT OR UPDATE OF campus_id, church_id
  ON public.policy_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_policy_document_campus_church();

-- Category must belong to same church.
CREATE OR REPLACE FUNCTION public.enforce_policy_document_category_church()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.category_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.policy_categories c
    WHERE c.id = NEW.category_id
      AND c.church_id = NEW.church_id
  ) THEN
    RAISE EXCEPTION 'VALIDATION: category does not belong to this church';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS policy_documents_category_church ON public.policy_documents;
CREATE TRIGGER policy_documents_category_church
  BEFORE INSERT OR UPDATE OF category_id, church_id
  ON public.policy_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_policy_document_category_church();

-- Audience / view helpers (custom scope refined after policy_assignments exists).
CREATE OR REPLACE FUNCTION public.policy_audience_allows(
  p_church_id uuid,
  p_audience_scope public.policy_audience_scope,
  p_minimum_role text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  IF NOT public.is_active_church_member(p_church_id) THEN
    RETURN false;
  END IF;

  v_role := public.active_membership_role(p_church_id);
  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  IF public.membership_role_rank(v_role)
     < public.membership_role_rank(coalesce(nullif(trim(p_minimum_role), ''), 'viewer'))
  THEN
    RETURN false;
  END IF;

  CASE p_audience_scope
    WHEN 'all_members' THEN
      RETURN true;
    WHEN 'security_team' THEN
      RETURN public.membership_role_rank(v_role)
        >= public.membership_role_rank('security_member');
    WHEN 'security_leadership' THEN
      RETURN public.membership_role_rank(v_role)
        >= public.membership_role_rank('security_leader');
    WHEN 'administrators' THEN
      RETURN public.membership_role_rank(v_role)
        >= public.membership_role_rank('administrator');
    WHEN 'custom' THEN
      RETURN public.can_manage_policy_documents(p_church_id);
    ELSE
      RETURN false;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_view_policy_document(p_document_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d public.policy_documents%ROWTYPE;
BEGIN
  SELECT * INTO d FROM public.policy_documents WHERE id = p_document_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF NOT public.is_active_church_member(d.church_id) THEN
    RETURN false;
  END IF;

  IF public.can_manage_policy_documents(d.church_id) THEN
    RETURN true;
  END IF;

  IF d.status <> 'published'::public.policy_document_status THEN
    RETURN false;
  END IF;

  RETURN public.policy_audience_allows(
    d.church_id,
    d.audience_scope,
    d.minimum_role
  );
END;
$$;

REVOKE ALL ON FUNCTION public.policy_audience_allows(
  uuid, public.policy_audience_scope, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_policy_document(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.policy_audience_allows(
  uuid, public.policy_audience_scope, text
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_policy_document(uuid)
  TO authenticated, service_role;

ALTER TABLE public.policy_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view permitted policy documents"
  ON public.policy_documents;
DROP POLICY IF EXISTS "Managers insert policy documents"
  ON public.policy_documents;
DROP POLICY IF EXISTS "Managers update policy documents"
  ON public.policy_documents;

CREATE POLICY "Members can view permitted policy documents"
  ON public.policy_documents FOR SELECT TO authenticated
  USING (public.can_view_policy_document(id));

CREATE POLICY "Managers insert policy documents"
  ON public.policy_documents FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_policy_documents(church_id));

CREATE POLICY "Managers update policy documents"
  ON public.policy_documents FOR UPDATE TO authenticated
  USING (public.can_manage_policy_documents(church_id))
  WITH CHECK (public.can_manage_policy_documents(church_id));

-- No DELETE policy — retire/archive only.

GRANT SELECT, INSERT, UPDATE ON public.policy_documents TO authenticated;

-- ---------------------------------------------------------------------------
-- Versions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.policy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  policy_document_id uuid NOT NULL REFERENCES public.policy_documents (id) ON DELETE CASCADE,
  version_number numeric(8, 2) NOT NULL,
  version_label text NOT NULL,
  title_snapshot text NOT NULL,
  summary_snapshot text,
  content text NOT NULL DEFAULT '',
  content_format public.policy_content_format NOT NULL
    DEFAULT 'markdown'::public.policy_content_format,
  change_summary text,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  submitted_for_review_at timestamptz,
  approved_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  approved_at timestamptz,
  published_at timestamptz,
  superseded_at timestamptz,
  status public.policy_version_status NOT NULL DEFAULT 'draft'::public.policy_version_status,
  word_count integer NOT NULL DEFAULT 0 CHECK (word_count >= 0),
  checksum text,
  search_vector tsvector,
  CONSTRAINT policy_versions_label_len CHECK (char_length(version_label) BETWEEN 1 AND 32),
  CONSTRAINT policy_versions_title_len CHECK (char_length(title_snapshot) BETWEEN 1 AND 200),
  CONSTRAINT policy_versions_content_len CHECK (char_length(content) <= 500000),
  CONSTRAINT policy_versions_change_summary_len CHECK (
    change_summary IS NULL OR char_length(change_summary) <= 4000
  ),
  CONSTRAINT policy_versions_doc_number_unique UNIQUE (policy_document_id, version_number)
);

CREATE INDEX IF NOT EXISTS policy_versions_document_idx
  ON public.policy_versions (policy_document_id, version_number DESC);

CREATE INDEX IF NOT EXISTS policy_versions_church_status_idx
  ON public.policy_versions (church_id, status);

CREATE INDEX IF NOT EXISTS policy_versions_search_idx
  ON public.policy_versions USING gin (search_vector);

-- Keep church_id aligned with parent document.
CREATE OR REPLACE FUNCTION public.enforce_policy_version_church()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  doc_church uuid;
BEGIN
  SELECT church_id INTO doc_church
  FROM public.policy_documents
  WHERE id = NEW.policy_document_id;

  IF doc_church IS NULL THEN
    RAISE EXCEPTION 'VALIDATION: policy document not found';
  END IF;
  IF NEW.church_id <> doc_church THEN
    RAISE EXCEPTION 'VALIDATION: version church_id must match document';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS policy_versions_church ON public.policy_versions;
CREATE TRIGGER policy_versions_church
  BEFORE INSERT OR UPDATE OF church_id, policy_document_id
  ON public.policy_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_policy_version_church();

-- Published / superseded versions are immutable (content + number).
CREATE OR REPLACE FUNCTION public.enforce_policy_version_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IN (
    'published'::public.policy_version_status,
    'superseded'::public.policy_version_status
  ) THEN
    IF NEW.content IS DISTINCT FROM OLD.content
      OR NEW.content_format IS DISTINCT FROM OLD.content_format
      OR NEW.version_number IS DISTINCT FROM OLD.version_number
      OR NEW.version_label IS DISTINCT FROM OLD.version_label
      OR NEW.title_snapshot IS DISTINCT FROM OLD.title_snapshot
      OR NEW.summary_snapshot IS DISTINCT FROM OLD.summary_snapshot
      OR NEW.checksum IS DISTINCT FROM OLD.checksum
    THEN
      RAISE EXCEPTION 'VALIDATION: published versions cannot be edited';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS policy_versions_immutability ON public.policy_versions;
CREATE TRIGGER policy_versions_immutability
  BEFORE UPDATE ON public.policy_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_policy_version_immutability();

ALTER TABLE public.policy_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view permitted policy versions"
  ON public.policy_versions;
DROP POLICY IF EXISTS "Managers insert policy versions"
  ON public.policy_versions;
DROP POLICY IF EXISTS "Managers update policy versions"
  ON public.policy_versions;

CREATE POLICY "Members can view permitted policy versions"
  ON public.policy_versions FOR SELECT TO authenticated
  USING (
    public.can_view_policy_document(policy_document_id)
    AND (
      public.can_manage_policy_documents(church_id)
      OR status IN (
        'published'::public.policy_version_status,
        'superseded'::public.policy_version_status
      )
    )
  );

CREATE POLICY "Managers insert policy versions"
  ON public.policy_versions FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_policy_documents(church_id));

CREATE POLICY "Managers update policy versions"
  ON public.policy_versions FOR UPDATE TO authenticated
  USING (public.can_manage_policy_documents(church_id))
  WITH CHECK (public.can_manage_policy_documents(church_id));

GRANT SELECT, INSERT, UPDATE ON public.policy_versions TO authenticated;

-- Circular FK: document.current_version_id → versions.id
DO $$ BEGIN
  ALTER TABLE public.policy_documents
    ADD CONSTRAINT policy_documents_current_version_id_fkey
    FOREIGN KEY (current_version_id)
    REFERENCES public.policy_versions (id)
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Document tags (junction)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.policy_document_tags (
  policy_document_id uuid NOT NULL REFERENCES public.policy_documents (id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.policy_tags (id) ON DELETE CASCADE,
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (policy_document_id, tag_id)
);

CREATE INDEX IF NOT EXISTS policy_document_tags_church_id_idx
  ON public.policy_document_tags (church_id);

ALTER TABLE public.policy_document_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view policy document tags"
  ON public.policy_document_tags;
DROP POLICY IF EXISTS "Managers manage policy document tags"
  ON public.policy_document_tags;

CREATE POLICY "Members can view policy document tags"
  ON public.policy_document_tags FOR SELECT TO authenticated
  USING (public.can_view_policy_document(policy_document_id));

CREATE POLICY "Managers manage policy document tags"
  ON public.policy_document_tags FOR ALL TO authenticated
  USING (public.can_manage_policy_documents(church_id))
  WITH CHECK (public.can_manage_policy_documents(church_id));

GRANT SELECT, INSERT, DELETE ON public.policy_document_tags TO authenticated;

-- Maintain search vectors on document + current published version content.
CREATE OR REPLACE FUNCTION public.refresh_policy_document_search(p_document_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d public.policy_documents%ROWTYPE;
  v_content text := '';
  v_tags text := '';
BEGIN
  SELECT * INTO d FROM public.policy_documents WHERE id = p_document_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF d.current_version_id IS NOT NULL THEN
    SELECT coalesce(content, '') INTO v_content
    FROM public.policy_versions
    WHERE id = d.current_version_id;
  END IF;

  SELECT coalesce(string_agg(t.name, ' '), '') INTO v_tags
  FROM public.policy_document_tags dt
  JOIN public.policy_tags t ON t.id = dt.tag_id
  WHERE dt.policy_document_id = p_document_id;

  UPDATE public.policy_documents
  SET search_vector =
    setweight(to_tsvector('english', coalesce(title, '')), 'A')
    || setweight(to_tsvector('english', coalesce(summary, '')), 'B')
    || setweight(to_tsvector('english', coalesce(v_tags, '')), 'B')
    || setweight(to_tsvector('english', coalesce(document_type::text, '')), 'C')
    || setweight(to_tsvector('english', coalesce(v_content, '')), 'D')
  WHERE id = p_document_id;

  UPDATE public.policy_versions
  SET search_vector =
    setweight(to_tsvector('english', coalesce(title_snapshot, '')), 'A')
    || setweight(to_tsvector('english', coalesce(summary_snapshot, '')), 'B')
    || setweight(to_tsvector('english', coalesce(change_summary, '')), 'C')
    || setweight(to_tsvector('english', coalesce(content, '')), 'D')
  WHERE policy_document_id = p_document_id;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_policy_document_search(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_policy_document_search(uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Attachments
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.policy_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  policy_document_id uuid NOT NULL REFERENCES public.policy_documents (id) ON DELETE CASCADE,
  policy_version_id uuid REFERENCES public.policy_versions (id) ON DELETE SET NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 52428800),
  attachment_type public.policy_attachment_type NOT NULL
    DEFAULT 'supporting'::public.policy_attachment_type,
  description text,
  uploaded_by uuid NOT NULL REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT policy_attachments_storage_path_key UNIQUE (storage_path),
  CONSTRAINT policy_attachments_file_name_len CHECK (char_length(file_name) BETWEEN 1 AND 255),
  CONSTRAINT policy_attachments_mime_check CHECK (
    mime_type IN (
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'image/png',
      'image/jpeg',
      'image/webp',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'
    )
  )
);

CREATE INDEX IF NOT EXISTS policy_attachments_document_idx
  ON public.policy_attachments (policy_document_id, created_at DESC);

CREATE INDEX IF NOT EXISTS policy_attachments_church_id_idx
  ON public.policy_attachments (church_id);

ALTER TABLE public.policy_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view policy attachments" ON public.policy_attachments;
DROP POLICY IF EXISTS "Managers insert policy attachments" ON public.policy_attachments;
DROP POLICY IF EXISTS "Managers update policy attachments" ON public.policy_attachments;

CREATE POLICY "Members can view policy attachments"
  ON public.policy_attachments FOR SELECT TO authenticated
  USING (
    archived_at IS NULL
    AND public.can_view_policy_document(policy_document_id)
  );

CREATE POLICY "Managers insert policy attachments"
  ON public.policy_attachments FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_policy_documents(church_id)
    AND uploaded_by = auth.uid()
  );

CREATE POLICY "Managers update policy attachments"
  ON public.policy_attachments FOR UPDATE TO authenticated
  USING (public.can_manage_policy_documents(church_id))
  WITH CHECK (public.can_manage_policy_documents(church_id));

GRANT SELECT, INSERT, UPDATE ON public.policy_attachments TO authenticated;

-- ---------------------------------------------------------------------------
-- Approvals / workflow trail
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.policy_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  policy_document_id uuid NOT NULL REFERENCES public.policy_documents (id) ON DELETE CASCADE,
  policy_version_id uuid NOT NULL REFERENCES public.policy_versions (id) ON DELETE CASCADE,
  decision public.policy_approval_decision NOT NULL,
  notes text,
  actor_user_id uuid NOT NULL REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT policy_approvals_notes_len CHECK (
    notes IS NULL OR char_length(notes) <= 4000
  )
);

CREATE INDEX IF NOT EXISTS policy_approvals_version_idx
  ON public.policy_approvals (policy_version_id, created_at DESC);

ALTER TABLE public.policy_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers view policy approvals" ON public.policy_approvals;
DROP POLICY IF EXISTS "Managers insert policy approvals" ON public.policy_approvals;

CREATE POLICY "Managers view policy approvals"
  ON public.policy_approvals FOR SELECT TO authenticated
  USING (public.can_manage_policy_documents(church_id));

CREATE POLICY "Managers insert policy approvals"
  ON public.policy_approvals FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_policy_documents(church_id)
    AND actor_user_id = auth.uid()
  );

GRANT SELECT, INSERT ON public.policy_approvals TO authenticated;

-- ---------------------------------------------------------------------------
-- Assignments
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.policy_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  policy_document_id uuid NOT NULL REFERENCES public.policy_documents (id) ON DELETE CASCADE,
  policy_version_id uuid REFERENCES public.policy_versions (id) ON DELETE SET NULL,
  assignment_type public.policy_assignment_type NOT NULL,
  role public.membership_role,
  campus_id uuid REFERENCES public.campuses (id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  due_days integer CHECK (due_days IS NULL OR due_days BETWEEN 1 AND 365),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT policy_assignments_target_check CHECK (
    (
      assignment_type = 'all_members'::public.policy_assignment_type
      AND role IS NULL AND campus_id IS NULL AND user_id IS NULL
    )
    OR (
      assignment_type = 'role'::public.policy_assignment_type
      AND role IS NOT NULL AND campus_id IS NULL AND user_id IS NULL
    )
    OR (
      assignment_type = 'security_team'::public.policy_assignment_type
      AND role IS NULL AND campus_id IS NULL AND user_id IS NULL
    )
    OR (
      assignment_type = 'campus'::public.policy_assignment_type
      AND campus_id IS NOT NULL AND role IS NULL AND user_id IS NULL
    )
    OR (
      assignment_type = 'user'::public.policy_assignment_type
      AND user_id IS NOT NULL AND role IS NULL AND campus_id IS NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS policy_assignments_document_idx
  ON public.policy_assignments (policy_document_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS policy_assignments_user_idx
  ON public.policy_assignments (church_id, user_id)
  WHERE revoked_at IS NULL AND user_id IS NOT NULL;

ALTER TABLE public.policy_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view relevant policy assignments"
  ON public.policy_assignments;
DROP POLICY IF EXISTS "Managers manage policy assignments"
  ON public.policy_assignments;

CREATE POLICY "Members view relevant policy assignments"
  ON public.policy_assignments FOR SELECT TO authenticated
  USING (
    public.is_active_church_member(church_id)
    AND (
      public.can_manage_policy_documents(church_id)
      OR user_id = auth.uid()
      OR assignment_type IN (
        'all_members'::public.policy_assignment_type,
        'security_team'::public.policy_assignment_type,
        'role'::public.policy_assignment_type,
        'campus'::public.policy_assignment_type
      )
    )
  );

CREATE POLICY "Managers manage policy assignments"
  ON public.policy_assignments FOR ALL TO authenticated
  USING (public.can_manage_policy_documents(church_id))
  WITH CHECK (public.can_manage_policy_documents(church_id));

GRANT SELECT, INSERT, UPDATE ON public.policy_assignments TO authenticated;

-- Fix custom audience helper: policy_assignments now exists.
-- (Function body already references this table; created above helpers before
-- table — recreate now that table exists.)
CREATE OR REPLACE FUNCTION public.policy_audience_allows(
  p_church_id uuid,
  p_audience_scope public.policy_audience_scope,
  p_minimum_role text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  IF NOT public.is_active_church_member(p_church_id) THEN
    RETURN false;
  END IF;

  v_role := public.active_membership_role(p_church_id);
  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  IF public.membership_role_rank(v_role)
     < public.membership_role_rank(coalesce(nullif(trim(p_minimum_role), ''), 'viewer'))
  THEN
    RETURN false;
  END IF;

  CASE p_audience_scope
    WHEN 'all_members' THEN
      RETURN true;
    WHEN 'security_team' THEN
      RETURN public.membership_role_rank(v_role)
        >= public.membership_role_rank('security_member');
    WHEN 'security_leadership' THEN
      RETURN public.membership_role_rank(v_role)
        >= public.membership_role_rank('security_leader');
    WHEN 'administrators' THEN
      RETURN public.membership_role_rank(v_role)
        >= public.membership_role_rank('administrator');
    WHEN 'custom' THEN
      RETURN public.can_manage_policy_documents(p_church_id)
        OR EXISTS (
          SELECT 1
          FROM public.policy_assignments a
          JOIN public.policy_documents d ON d.id = a.policy_document_id
          WHERE a.church_id = p_church_id
            AND a.revoked_at IS NULL
            AND d.church_id = p_church_id
            AND d.audience_scope = 'custom'::public.policy_audience_scope
            AND (
              a.assignment_type = 'all_members'::public.policy_assignment_type
              OR (
                a.assignment_type = 'role'::public.policy_assignment_type
                AND a.role::text = v_role
              )
              OR (
                a.assignment_type = 'user'::public.policy_assignment_type
                AND a.user_id = auth.uid()
              )
              OR (
                a.assignment_type = 'security_team'::public.policy_assignment_type
                AND public.membership_role_rank(v_role)
                  >= public.membership_role_rank('security_member')
              )
            )
        );
    ELSE
      RETURN false;
  END CASE;
END;
$$;

-- Narrower custom check used by can_view_policy_document via document id.
CREATE OR REPLACE FUNCTION public.can_view_policy_document(p_document_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d public.policy_documents%ROWTYPE;
  v_role text;
BEGIN
  SELECT * INTO d FROM public.policy_documents WHERE id = p_document_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF NOT public.is_active_church_member(d.church_id) THEN
    RETURN false;
  END IF;

  IF public.can_manage_policy_documents(d.church_id) THEN
    RETURN true;
  END IF;

  IF d.status <> 'published'::public.policy_document_status THEN
    RETURN false;
  END IF;

  IF d.audience_scope = 'custom'::public.policy_audience_scope THEN
    v_role := public.active_membership_role(d.church_id);
    IF v_role IS NULL THEN
      RETURN false;
    END IF;
    IF public.membership_role_rank(v_role)
       < public.membership_role_rank(coalesce(nullif(trim(d.minimum_role), ''), 'viewer'))
    THEN
      RETURN false;
    END IF;
    RETURN EXISTS (
      SELECT 1
      FROM public.policy_assignments a
      WHERE a.church_id = d.church_id
        AND a.policy_document_id = d.id
        AND a.revoked_at IS NULL
        AND (
          a.assignment_type = 'all_members'::public.policy_assignment_type
          OR (
            a.assignment_type = 'role'::public.policy_assignment_type
            AND a.role::text = v_role
          )
          OR (
            a.assignment_type = 'user'::public.policy_assignment_type
            AND a.user_id = auth.uid()
          )
          OR (
            a.assignment_type = 'security_team'::public.policy_assignment_type
            AND public.membership_role_rank(v_role)
              >= public.membership_role_rank('security_member')
          )
          OR (
            a.assignment_type = 'campus'::public.policy_assignment_type
            AND d.campus_id IS NOT NULL
            AND a.campus_id = d.campus_id
          )
        )
    );
  END IF;

  RETURN public.policy_audience_allows(
    d.church_id,
    d.audience_scope,
    d.minimum_role
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Acknowledgments
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.policy_acknowledgments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  policy_document_id uuid NOT NULL REFERENCES public.policy_documents (id) ON DELETE CASCADE,
  policy_version_id uuid NOT NULL REFERENCES public.policy_versions (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  membership_id uuid REFERENCES public.church_memberships (id) ON DELETE SET NULL,
  acknowledgment_status public.policy_acknowledgment_status NOT NULL
    DEFAULT 'assigned'::public.policy_acknowledgment_status,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz,
  viewed_at timestamptz,
  acknowledged_at timestamptz,
  acknowledgment_text text,
  waived_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  waived_at timestamptz,
  waiver_reason text,
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT policy_acknowledgments_user_version_unique
    UNIQUE (policy_version_id, user_id),
  CONSTRAINT policy_acknowledgments_text_len CHECK (
    acknowledgment_text IS NULL OR char_length(acknowledgment_text) <= 2000
  ),
  CONSTRAINT policy_acknowledgments_waiver_len CHECK (
    waiver_reason IS NULL OR char_length(waiver_reason) <= 2000
  )
);

CREATE INDEX IF NOT EXISTS policy_acknowledgments_user_status_idx
  ON public.policy_acknowledgments (church_id, user_id, acknowledgment_status);

CREATE INDEX IF NOT EXISTS policy_acknowledgments_document_idx
  ON public.policy_acknowledgments (policy_document_id, acknowledgment_status);

CREATE INDEX IF NOT EXISTS policy_acknowledgments_due_idx
  ON public.policy_acknowledgments (church_id, due_at)
  WHERE acknowledgment_status IN (
    'assigned'::public.policy_acknowledgment_status,
    'viewed'::public.policy_acknowledgment_status,
    'overdue'::public.policy_acknowledgment_status
  );

DROP TRIGGER IF EXISTS policy_acknowledgments_updated_at ON public.policy_acknowledgments;
CREATE TRIGGER policy_acknowledgments_updated_at
  BEFORE UPDATE ON public.policy_acknowledgments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Users may only update their own ack rows (viewed/acknowledged); waivers by managers.
CREATE OR REPLACE FUNCTION public.enforce_policy_acknowledgment_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.user_id <> OLD.user_id
    OR NEW.policy_version_id <> OLD.policy_version_id
    OR NEW.policy_document_id <> OLD.policy_document_id
    OR NEW.church_id <> OLD.church_id
  THEN
    RAISE EXCEPTION 'VALIDATION: acknowledgment identity fields are immutable';
  END IF;

  IF auth.uid() = OLD.user_id THEN
    -- Self updates: cannot waive, cannot alter another user's fields.
    IF NEW.waived_by IS DISTINCT FROM OLD.waived_by
      OR NEW.waived_at IS DISTINCT FROM OLD.waived_at
      OR NEW.waiver_reason IS DISTINCT FROM OLD.waiver_reason
    THEN
      RAISE EXCEPTION 'VALIDATION: users cannot waive their own acknowledgment';
    END IF;
    IF NEW.acknowledgment_status = 'waived'::public.policy_acknowledgment_status THEN
      RAISE EXCEPTION 'VALIDATION: users cannot set waived status';
    END IF;
    RETURN NEW;
  END IF;

  IF public.can_manage_policy_documents(OLD.church_id) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'FORBIDDEN: cannot update this acknowledgment';
END;
$$;

DROP TRIGGER IF EXISTS policy_acknowledgments_enforce_update
  ON public.policy_acknowledgments;
CREATE TRIGGER policy_acknowledgments_enforce_update
  BEFORE UPDATE ON public.policy_acknowledgments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_policy_acknowledgment_update();

ALTER TABLE public.policy_acknowledgments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own or report acknowledgments"
  ON public.policy_acknowledgments;
DROP POLICY IF EXISTS "Users insert own acknowledgments"
  ON public.policy_acknowledgments;
DROP POLICY IF EXISTS "Users or managers update acknowledgments"
  ON public.policy_acknowledgments;

CREATE POLICY "Users view own or report acknowledgments"
  ON public.policy_acknowledgments FOR SELECT TO authenticated
  USING (
    public.is_active_church_member(church_id)
    AND (
      user_id = auth.uid()
      OR public.can_view_policy_acknowledgment_reports(church_id)
    )
  );

CREATE POLICY "Users insert own acknowledgments"
  ON public.policy_acknowledgments FOR INSERT TO authenticated
  WITH CHECK (
    public.is_active_church_member(church_id)
    AND user_id = auth.uid()
  );

CREATE POLICY "Users or managers update acknowledgments"
  ON public.policy_acknowledgments FOR UPDATE TO authenticated
  USING (
    public.is_active_church_member(church_id)
    AND (
      user_id = auth.uid()
      OR public.can_manage_policy_documents(church_id)
    )
  )
  WITH CHECK (
    public.is_active_church_member(church_id)
    AND (
      user_id = auth.uid()
      OR public.can_manage_policy_documents(church_id)
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.policy_acknowledgments TO authenticated;

-- ---------------------------------------------------------------------------
-- Review history
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.policy_review_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  policy_document_id uuid NOT NULL REFERENCES public.policy_documents (id) ON DELETE CASCADE,
  previous_review_due_date date,
  new_review_due_date date,
  notes text,
  actor_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT policy_review_history_notes_len CHECK (
    notes IS NULL OR char_length(notes) <= 4000
  )
);

CREATE INDEX IF NOT EXISTS policy_review_history_document_idx
  ON public.policy_review_history (policy_document_id, created_at DESC);

ALTER TABLE public.policy_review_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers view policy review history"
  ON public.policy_review_history;
DROP POLICY IF EXISTS "Managers insert policy review history"
  ON public.policy_review_history;

CREATE POLICY "Managers view policy review history"
  ON public.policy_review_history FOR SELECT TO authenticated
  USING (public.can_manage_policy_documents(church_id));

CREATE POLICY "Managers insert policy review history"
  ON public.policy_review_history FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_policy_documents(church_id));

GRANT SELECT, INSERT ON public.policy_review_history TO authenticated;

-- ---------------------------------------------------------------------------
-- Storage bucket: policy-media (private)
-- Path: churches/{church_id}/policies/{policy_id}/versions/{version_id}/attachments/{file}
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'policy-media',
  'policy-media',
  false,
  15728640,
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.church_id_from_policy_media_path(object_name text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  parts text[];
  church_id uuid;
BEGIN
  parts := string_to_array(object_name, '/');
  -- churches / {church_id} / policies / {policy_id} / versions / {version_id} / attachments / file
  IF array_length(parts, 1) < 5 THEN
    RETURN NULL;
  END IF;
  IF parts[1] <> 'churches' OR parts[3] <> 'policies' THEN
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

REVOKE ALL ON FUNCTION public.church_id_from_policy_media_path(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.church_id_from_policy_media_path(text) TO authenticated;

DROP POLICY IF EXISTS "Members can read policy media" ON storage.objects;
DROP POLICY IF EXISTS "Managers can upload policy media" ON storage.objects;
DROP POLICY IF EXISTS "Managers can update policy media" ON storage.objects;
DROP POLICY IF EXISTS "Managers can delete policy media" ON storage.objects;

CREATE POLICY "Members can read policy media"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'policy-media'
    AND public.is_active_church_member(
      public.church_id_from_policy_media_path(name)
    )
  );

CREATE POLICY "Managers can upload policy media"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'policy-media'
    AND public.can_manage_policy_documents(
      public.church_id_from_policy_media_path(name)
    )
  );

CREATE POLICY "Managers can update policy media"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'policy-media'
    AND public.can_manage_policy_documents(
      public.church_id_from_policy_media_path(name)
    )
  )
  WITH CHECK (
    bucket_id = 'policy-media'
    AND public.can_manage_policy_documents(
      public.church_id_from_policy_media_path(name)
    )
  );

CREATE POLICY "Managers can delete policy media"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'policy-media'
    AND public.can_manage_policy_documents(
      public.church_id_from_policy_media_path(name)
    )
  );
