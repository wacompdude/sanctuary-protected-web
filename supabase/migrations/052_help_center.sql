-- =============================================================================
-- 052_help_center.sql
-- Help Center — platform-managed global documentation (categories, articles,
-- ordered steps, relations, versions, search, feedback, analytics events).
--
-- PHASE 2 ARTIFACT: Review before applying to production Supabase.
-- Requires: 051_help_center_permission_category.sql (enum value 'help').
-- Additive / non-destructive. Safe to re-run (IF NOT EXISTS / ON CONFLICT /
-- DROP POLICY IF EXISTS / CREATE OR REPLACE).
--
-- Architecture:
--   Platform Help Content (global; NOT church-scoped)
--     → help_categories (tree)
--     → help_articles (working draft + publication pointer)
--     → help_article_steps (working draft steps; versioned copies on publish)
--     → help_article_relations
--     → help_article_versions (immutable publish snapshots)
--     → help_article_features / roles / plan_visibility (presentation metadata)
--     → help_article_feedback / help_search_events / help_article_views
--
-- Critical rules:
--   - Available to all subscription tiers (no feature entitlement gate)
--   - Church users SELECT published content only; never write
--   - Platform writes via service_role after app permission checks
--   - Draft / in_review content never exposed to church users
--   - Deep links are internal path strings only (validated in app + CHECK)
--   - No secrets or tenant/customer PII in help content
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.help_category_status AS ENUM (
    'draft',
    'active',
    'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.help_article_status AS ENUM (
    'draft',
    'in_review',
    'published',
    'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.help_article_type AS ENUM (
    'overview',
    'how_to',
    'workflow',
    'reference',
    'troubleshooting',
    'faq',
    'release_note'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.help_body_format AS ENUM (
    'markdown',
    'structured_json',
    'rich_text'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.help_audience_scope AS ENUM (
    'all_authenticated',
    'church_members',
    'security_team',
    'church_admins',
    'platform_operators'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.help_difficulty AS ENUM (
    'beginner',
    'intermediate',
    'advanced'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.help_relation_type AS ENUM (
    'related',
    'prerequisite',
    'next_step',
    'previous_step',
    'troubleshooting',
    'upgrade_information'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.help_feedback_rating AS ENUM (
    'yes',
    'no'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Helpers available before tables (plpgsql; resolved at runtime)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_read_help_drafts()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_platform_permission('help.read_drafts')
      OR public.has_platform_permission('help.manage')
      OR public.has_platform_permission('help.create')
      OR public.has_platform_permission('help.update')
      OR public.has_platform_permission('help.publish');
$$;

CREATE OR REPLACE FUNCTION public.can_read_help_analytics()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_platform_permission('help.analytics.read')
      OR public.has_platform_permission('help.manage');
$$;

-- Prevent circular category parents (self + ancestor cycles).
CREATE OR REPLACE FUNCTION public.prevent_help_category_parent_cycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_walker uuid;
  v_guard integer := 0;
BEGIN
  IF NEW.parent_category_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_category_id = NEW.id THEN
    RAISE EXCEPTION 'help_categories parent_category_id cannot reference itself';
  END IF;

  v_walker := NEW.parent_category_id;
  WHILE v_walker IS NOT NULL LOOP
    v_guard := v_guard + 1;
    IF v_guard > 64 THEN
      RAISE EXCEPTION 'help_categories parent chain too deep or cyclic';
    END IF;
    IF v_walker = NEW.id THEN
      RAISE EXCEPTION 'help_categories parent_category_id would create a cycle';
    END IF;
    SELECT parent_category_id INTO v_walker
    FROM public.help_categories
    WHERE id = v_walker;
  END LOOP;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- help_categories
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.help_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_category_id uuid REFERENCES public.help_categories (id) ON DELETE RESTRICT,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  icon text,
  display_order integer NOT NULL DEFAULT 0,
  status public.help_category_status NOT NULL DEFAULT 'draft'::public.help_category_status,
  created_by_platform_account_id uuid REFERENCES public.platform_accounts (id) ON DELETE SET NULL,
  updated_by_platform_account_id uuid REFERENCES public.platform_accounts (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT help_categories_name_len CHECK (char_length(name) BETWEEN 1 AND 120),
  CONSTRAINT help_categories_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT help_categories_slug_len CHECK (char_length(slug) BETWEEN 1 AND 80),
  CONSTRAINT help_categories_icon_len CHECK (icon IS NULL OR char_length(icon) <= 64),
  CONSTRAINT help_categories_description_len CHECK (
    description IS NULL OR char_length(description) <= 2000
  ),
  CONSTRAINT help_categories_archived_consistency CHECK (
    (status = 'archived'::public.help_category_status AND archived_at IS NOT NULL)
    OR (status <> 'archived'::public.help_category_status AND archived_at IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS help_categories_slug_uidx
  ON public.help_categories (slug);

CREATE INDEX IF NOT EXISTS help_categories_parent_order_idx
  ON public.help_categories (parent_category_id, display_order, name);

CREATE INDEX IF NOT EXISTS help_categories_status_idx
  ON public.help_categories (status);

DROP TRIGGER IF EXISTS help_categories_parent_cycle ON public.help_categories;
CREATE TRIGGER help_categories_parent_cycle
  BEFORE INSERT OR UPDATE OF parent_category_id, id
  ON public.help_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_help_category_parent_cycle();

-- ---------------------------------------------------------------------------
-- help_articles (working copy + publication pointer)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.help_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.help_categories (id) ON DELETE RESTRICT,
  article_type public.help_article_type NOT NULL DEFAULT 'how_to'::public.help_article_type,
  title text NOT NULL,
  slug text NOT NULL,
  summary text,
  body_content text NOT NULL DEFAULT '',
  body_format public.help_body_format NOT NULL DEFAULT 'markdown'::public.help_body_format,
  status public.help_article_status NOT NULL DEFAULT 'draft'::public.help_article_status,
  audience_scope public.help_audience_scope NOT NULL
    DEFAULT 'all_authenticated'::public.help_audience_scope,
  estimated_minutes integer,
  difficulty public.help_difficulty,
  is_featured boolean NOT NULL DEFAULT false,
  is_popular boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  search_keywords text[] NOT NULL DEFAULT '{}'::text[],
  context_keys text[] NOT NULL DEFAULT '{}'::text[],
  prerequisites text[] NOT NULL DEFAULT '{}'::text[],
  expected_result text,
  support_cta_label text,
  support_cta_path text,
  published_version_id uuid,
  published_version_number integer,
  published_at timestamptz,
  published_by_platform_account_id uuid REFERENCES public.platform_accounts (id) ON DELETE SET NULL,
  created_by_platform_account_id uuid REFERENCES public.platform_accounts (id) ON DELETE SET NULL,
  updated_by_platform_account_id uuid REFERENCES public.platform_accounts (id) ON DELETE SET NULL,
  review_due_at timestamptz,
  last_reviewed_at timestamptz,
  search_vector tsvector,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT help_articles_title_len CHECK (char_length(title) BETWEEN 1 AND 200),
  CONSTRAINT help_articles_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT help_articles_slug_len CHECK (char_length(slug) BETWEEN 1 AND 120),
  CONSTRAINT help_articles_summary_len CHECK (
    summary IS NULL OR char_length(summary) <= 1000
  ),
  CONSTRAINT help_articles_body_len CHECK (char_length(body_content) <= 200000),
  CONSTRAINT help_articles_estimated_minutes_check CHECK (
    estimated_minutes IS NULL OR estimated_minutes BETWEEN 1 AND 240
  ),
  CONSTRAINT help_articles_published_version_number_check CHECK (
    published_version_number IS NULL OR published_version_number >= 1
  ),
  CONSTRAINT help_articles_support_cta_path_check CHECK (
    support_cta_path IS NULL
    OR support_cta_path ~ '^/[a-zA-Z0-9/_?=&%#.-]*$'
  ),
  CONSTRAINT help_articles_archived_consistency CHECK (
    (status = 'archived'::public.help_article_status AND archived_at IS NOT NULL)
    OR (status <> 'archived'::public.help_article_status)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS help_articles_slug_uidx
  ON public.help_articles (slug);

CREATE INDEX IF NOT EXISTS help_articles_category_status_order_idx
  ON public.help_articles (category_id, status, display_order, title);

CREATE INDEX IF NOT EXISTS help_articles_status_published_idx
  ON public.help_articles (status, published_at DESC)
  WHERE published_version_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS help_articles_featured_idx
  ON public.help_articles (is_featured, updated_at DESC)
  WHERE is_featured = true;

CREATE INDEX IF NOT EXISTS help_articles_popular_idx
  ON public.help_articles (is_popular, updated_at DESC)
  WHERE is_popular = true;

CREATE INDEX IF NOT EXISTS help_articles_context_keys_gin_idx
  ON public.help_articles USING gin (context_keys);

CREATE INDEX IF NOT EXISTS help_articles_search_keywords_gin_idx
  ON public.help_articles USING gin (search_keywords);

CREATE INDEX IF NOT EXISTS help_articles_search_vector_idx
  ON public.help_articles USING gin (search_vector);

-- Customer-visibility helpers (SQL; require tables above)
CREATE OR REPLACE FUNCTION public.help_article_is_customer_visible(p_article_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.help_articles a
    WHERE a.id = p_article_id
      AND a.published_version_id IS NOT NULL
      AND a.status <> 'archived'::public.help_article_status
      AND a.archived_at IS NULL
      AND a.audience_scope <> 'platform_operators'::public.help_audience_scope
  );
$$;

CREATE OR REPLACE FUNCTION public.help_category_is_customer_visible(p_category_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.help_categories c
    WHERE c.id = p_category_id
      AND c.status = 'active'::public.help_category_status
      AND c.archived_at IS NULL
  );
$$;

-- ---------------------------------------------------------------------------
-- help_article_versions (immutable publish snapshots)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.help_article_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES public.help_articles (id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  title text NOT NULL,
  summary text,
  body_content text NOT NULL DEFAULT '',
  body_format public.help_body_format NOT NULL DEFAULT 'markdown'::public.help_body_format,
  article_type public.help_article_type NOT NULL,
  audience_scope public.help_audience_scope NOT NULL,
  estimated_minutes integer,
  difficulty public.help_difficulty,
  search_keywords text[] NOT NULL DEFAULT '{}'::text[],
  context_keys text[] NOT NULL DEFAULT '{}'::text[],
  prerequisites text[] NOT NULL DEFAULT '{}'::text[],
  expected_result text,
  steps_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  change_summary text,
  published_at timestamptz NOT NULL DEFAULT now(),
  published_by_platform_account_id uuid REFERENCES public.platform_accounts (id) ON DELETE SET NULL,
  search_vector tsvector,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT help_article_versions_version_number_check CHECK (version_number >= 1),
  CONSTRAINT help_article_versions_title_len CHECK (char_length(title) BETWEEN 1 AND 200),
  CONSTRAINT help_article_versions_article_version_unique UNIQUE (article_id, version_number)
);

CREATE INDEX IF NOT EXISTS help_article_versions_article_idx
  ON public.help_article_versions (article_id, version_number DESC);

CREATE INDEX IF NOT EXISTS help_article_versions_search_vector_idx
  ON public.help_article_versions USING gin (search_vector);

DO $$ BEGIN
  ALTER TABLE public.help_articles
    ADD CONSTRAINT help_articles_published_version_id_fkey
    FOREIGN KEY (published_version_id)
    REFERENCES public.help_article_versions (id)
    ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- help_article_steps
--   version_id IS NULL  → working draft steps on the article
--   version_id IS SET   → immutable steps belonging to a published version
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.help_article_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES public.help_articles (id) ON DELETE CASCADE,
  version_id uuid REFERENCES public.help_article_versions (id) ON DELETE CASCADE,
  step_number integer NOT NULL,
  title text NOT NULL,
  instruction text NOT NULL DEFAULT '',
  expected_result text,
  tip_text text,
  warning_text text,
  deep_link_path text,
  deep_link_label text,
  required_permission text,
  required_feature_key text,
  screenshot_storage_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT help_article_steps_step_number_check CHECK (step_number >= 1),
  CONSTRAINT help_article_steps_title_len CHECK (char_length(title) BETWEEN 1 AND 200),
  CONSTRAINT help_article_steps_instruction_len CHECK (char_length(instruction) <= 20000),
  CONSTRAINT help_article_steps_deep_link_path_check CHECK (
    deep_link_path IS NULL
    OR (
      deep_link_path ~ '^/[a-zA-Z0-9/_?=&%#.-]*$'
      AND deep_link_path !~* 'javascript:'
      AND deep_link_path !~* 'data:'
      AND deep_link_path !~* '^//'
    )
  ),
  CONSTRAINT help_article_steps_feature_key_format CHECK (
    required_feature_key IS NULL
    OR required_feature_key ~ '^[a-z][a-z0-9_.]*$'
  )
);

-- One step_number per article for draft steps; one per version for published copies.
CREATE UNIQUE INDEX IF NOT EXISTS help_article_steps_draft_step_uidx
  ON public.help_article_steps (article_id, step_number)
  WHERE version_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS help_article_steps_version_step_uidx
  ON public.help_article_steps (version_id, step_number)
  WHERE version_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS help_article_steps_article_idx
  ON public.help_article_steps (article_id, step_number);

CREATE INDEX IF NOT EXISTS help_article_steps_version_idx
  ON public.help_article_steps (version_id, step_number)
  WHERE version_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- help_article_relations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.help_article_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_article_id uuid NOT NULL REFERENCES public.help_articles (id) ON DELETE CASCADE,
  target_article_id uuid NOT NULL REFERENCES public.help_articles (id) ON DELETE CASCADE,
  relationship_type public.help_relation_type NOT NULL
    DEFAULT 'related'::public.help_relation_type,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT help_article_relations_no_self CHECK (source_article_id <> target_article_id),
  CONSTRAINT help_article_relations_unique
    UNIQUE (source_article_id, target_article_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS help_article_relations_source_idx
  ON public.help_article_relations (source_article_id, relationship_type, display_order);

CREATE INDEX IF NOT EXISTS help_article_relations_target_idx
  ON public.help_article_relations (target_article_id);

-- ---------------------------------------------------------------------------
-- Audience / feature / plan presentation metadata (not authorization)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.help_article_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES public.help_articles (id) ON DELETE CASCADE,
  role_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT help_article_roles_role_key_len CHECK (char_length(role_key) BETWEEN 1 AND 64),
  CONSTRAINT help_article_roles_unique UNIQUE (article_id, role_key)
);

CREATE INDEX IF NOT EXISTS help_article_roles_article_idx
  ON public.help_article_roles (article_id);

CREATE TABLE IF NOT EXISTS public.help_article_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES public.help_articles (id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT help_article_features_feature_key_format CHECK (
    feature_key ~ '^[a-z][a-z0-9_.]*$'
  ),
  CONSTRAINT help_article_features_unique UNIQUE (article_id, feature_key)
);

CREATE INDEX IF NOT EXISTS help_article_features_article_idx
  ON public.help_article_features (article_id);

CREATE INDEX IF NOT EXISTS help_article_features_feature_key_idx
  ON public.help_article_features (feature_key);

CREATE TABLE IF NOT EXISTS public.help_article_plan_visibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES public.help_articles (id) ON DELETE CASCADE,
  plan_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT help_article_plan_visibility_plan_key_format CHECK (
    plan_key ~ '^[a-z][a-z0-9_]*$'
  ),
  CONSTRAINT help_article_plan_visibility_unique UNIQUE (article_id, plan_key)
);

CREATE INDEX IF NOT EXISTS help_article_plan_visibility_article_idx
  ON public.help_article_plan_visibility (article_id);

-- ---------------------------------------------------------------------------
-- Feedback, search analytics, views
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.help_article_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES public.help_articles (id) ON DELETE CASCADE,
  article_version_id uuid REFERENCES public.help_article_versions (id) ON DELETE SET NULL,
  rating public.help_feedback_rating NOT NULL,
  comment text,
  church_id uuid REFERENCES public.churches (id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT help_article_feedback_comment_len CHECK (
    comment IS NULL OR char_length(comment) <= 2000
  )
);

CREATE INDEX IF NOT EXISTS help_article_feedback_article_idx
  ON public.help_article_feedback (article_id, created_at DESC);

CREATE INDEX IF NOT EXISTS help_article_feedback_rating_idx
  ON public.help_article_feedback (rating, created_at DESC);

CREATE TABLE IF NOT EXISTS public.help_search_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_text text NOT NULL,
  result_count integer NOT NULL DEFAULT 0,
  church_id uuid REFERENCES public.churches (id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  selected_article_id uuid REFERENCES public.help_articles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT help_search_events_query_len CHECK (char_length(query_text) BETWEEN 1 AND 500),
  CONSTRAINT help_search_events_result_count_check CHECK (result_count >= 0)
);

CREATE INDEX IF NOT EXISTS help_search_events_created_idx
  ON public.help_search_events (created_at DESC);

CREATE INDEX IF NOT EXISTS help_search_events_zero_results_idx
  ON public.help_search_events (created_at DESC)
  WHERE result_count = 0;

CREATE INDEX IF NOT EXISTS help_search_events_query_lower_idx
  ON public.help_search_events (lower(query_text));

CREATE TABLE IF NOT EXISTS public.help_article_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES public.help_articles (id) ON DELETE CASCADE,
  article_version_id uuid REFERENCES public.help_article_versions (id) ON DELETE SET NULL,
  church_id uuid REFERENCES public.churches (id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS help_article_views_article_idx
  ON public.help_article_views (article_id, created_at DESC);

CREATE INDEX IF NOT EXISTS help_article_views_created_idx
  ON public.help_article_views (created_at DESC);

-- ---------------------------------------------------------------------------
-- Optional: attachments metadata (private bucket; signed URLs in app)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.help_article_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES public.help_articles (id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  alt_text text,
  caption text,
  created_by_platform_account_id uuid REFERENCES public.platform_accounts (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT help_article_attachments_storage_path_key UNIQUE (storage_path),
  CONSTRAINT help_article_attachments_file_name_len CHECK (char_length(file_name) BETWEEN 1 AND 255),
  CONSTRAINT help_article_attachments_size_check CHECK (
    size_bytes > 0 AND size_bytes <= 10485760
  ),
  CONSTRAINT help_article_attachments_mime_check CHECK (
    mime_type IN ('image/png', 'image/jpeg', 'image/webp', 'image/gif')
  )
);

CREATE INDEX IF NOT EXISTS help_article_attachments_article_idx
  ON public.help_article_attachments (article_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Full-text search refresh (weighted)
--   A: title, keywords
--   B: summary, step titles/instructions, category name
--   C: body
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.refresh_help_article_search(p_article_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a public.help_articles%ROWTYPE;
  v_category_name text := '';
  v_steps text := '';
  v_keywords text := '';
BEGIN
  SELECT * INTO a FROM public.help_articles WHERE id = p_article_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT coalesce(c.name, '') INTO v_category_name
  FROM public.help_categories c
  WHERE c.id = a.category_id;

  SELECT coalesce(string_agg(s.title || ' ' || coalesce(s.instruction, ''), ' '), '')
  INTO v_steps
  FROM public.help_article_steps s
  WHERE s.article_id = p_article_id
    AND s.version_id IS NULL;

  v_keywords := coalesce(array_to_string(a.search_keywords, ' '), '');

  UPDATE public.help_articles
  SET search_vector =
    setweight(to_tsvector('english', coalesce(a.title, '')), 'A')
    || setweight(to_tsvector('english', v_keywords), 'A')
    || setweight(to_tsvector('english', coalesce(a.summary, '')), 'B')
    || setweight(to_tsvector('english', v_category_name), 'B')
    || setweight(to_tsvector('english', v_steps), 'B')
    || setweight(to_tsvector('english', coalesce(a.body_content, '')), 'C')
  WHERE id = p_article_id;

  UPDATE public.help_article_versions v
  SET search_vector =
    setweight(to_tsvector('english', coalesce(v.title, '')), 'A')
    || setweight(
      to_tsvector('english', coalesce(array_to_string(v.search_keywords, ' '), '')),
      'A'
    )
    || setweight(to_tsvector('english', coalesce(v.summary, '')), 'B')
    || setweight(to_tsvector('english', coalesce(v.steps_snapshot::text, '')), 'B')
    || setweight(to_tsvector('english', coalesce(v.body_content, '')), 'C')
  WHERE v.article_id = p_article_id;
END;
$$;

-- Separate trigger functions per table: PostgreSQL resolves NEW.<col> against the
-- firing table's row type, so a shared CASE on NEW.article_id / NEW.id fails on
-- help_articles (no article_id) with: record "new" has no field "article_id".
CREATE OR REPLACE FUNCTION public.trg_refresh_help_article_search_from_article()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_help_article_search(COALESCE(NEW.id, OLD.id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_refresh_help_article_search_from_step()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_help_article_search(
    COALESCE(NEW.article_id, OLD.article_id)
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS help_articles_search_refresh ON public.help_articles;
CREATE TRIGGER help_articles_search_refresh
  AFTER INSERT OR UPDATE OF title, summary, body_content, search_keywords, category_id
  ON public.help_articles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_refresh_help_article_search_from_article();

DROP TRIGGER IF EXISTS help_article_steps_search_refresh ON public.help_article_steps;
CREATE TRIGGER help_article_steps_search_refresh
  AFTER INSERT OR UPDATE OF title, instruction, step_number OR DELETE
  ON public.help_article_steps
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_refresh_help_article_search_from_step();

-- Safe customer search RPC (parameterized; published content only).
CREATE OR REPLACE FUNCTION public.search_help_articles(
  p_query text,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_category_id uuid DEFAULT NULL,
  p_article_type public.help_article_type DEFAULT NULL
)
RETURNS TABLE (
  article_id uuid,
  slug text,
  title text,
  summary text,
  category_id uuid,
  article_type public.help_article_type,
  rank real
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_tsquery tsquery;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_query IS NULL OR btrim(p_query) = '' THEN
    RETURN;
  END IF;

  v_tsquery := websearch_to_tsquery('english', left(btrim(p_query), 200));

  RETURN QUERY
  SELECT
    a.id,
    a.slug,
    coalesce(v.title, a.title) AS title,
    coalesce(v.summary, a.summary) AS summary,
    a.category_id,
    a.article_type,
    ts_rank_cd(
      coalesce(v.search_vector, a.search_vector),
      v_tsquery
    )::real AS rank
  FROM public.help_articles a
  LEFT JOIN public.help_article_versions v
    ON v.id = a.published_version_id
  WHERE public.help_article_is_customer_visible(a.id)
    AND (p_category_id IS NULL OR a.category_id = p_category_id)
    AND (p_article_type IS NULL OR a.article_type = p_article_type)
    AND coalesce(v.search_vector, a.search_vector) @@ v_tsquery
  ORDER BY rank DESC, a.title ASC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

-- ---------------------------------------------------------------------------
-- Storage bucket (private; signed URLs only)
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'help-center-assets',
  'help-center-assets',
  false,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- No authenticated storage policies: uploads/reads go through service_role
-- after platform permission checks (signed URLs for customers).

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Strategy:
--   - Church / authenticated users: SELECT published customer-visible content
--   - Platform accounts with help.* : SELECT drafts / versions / analytics
--   - ALL writes: service_role only (trusted server workflows)
--   - Feedback / search / view events: authenticated INSERT for own rows
-- ---------------------------------------------------------------------------

ALTER TABLE public.help_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.help_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.help_article_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.help_article_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.help_article_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.help_article_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.help_article_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.help_article_plan_visibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.help_article_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.help_search_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.help_article_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.help_article_attachments ENABLE ROW LEVEL SECURITY;

-- Categories
DROP POLICY IF EXISTS "Help categories readable by customers"
  ON public.help_categories;
CREATE POLICY "Help categories readable by customers"
  ON public.help_categories
  FOR SELECT
  TO authenticated
  USING (
    public.help_category_is_customer_visible(id)
    OR public.can_read_help_drafts()
  );

-- Articles
DROP POLICY IF EXISTS "Help articles readable by customers"
  ON public.help_articles;
CREATE POLICY "Help articles readable by customers"
  ON public.help_articles
  FOR SELECT
  TO authenticated
  USING (
    public.help_article_is_customer_visible(id)
    OR public.can_read_help_drafts()
    OR (
      audience_scope = 'platform_operators'::public.help_audience_scope
      AND public.is_active_platform_account()
    )
  );

-- Published versions only for customers; all versions for draft readers
DROP POLICY IF EXISTS "Help article versions readable"
  ON public.help_article_versions;
CREATE POLICY "Help article versions readable"
  ON public.help_article_versions
  FOR SELECT
  TO authenticated
  USING (
    public.can_read_help_drafts()
    OR (
      public.help_article_is_customer_visible(article_id)
      AND id = (
        SELECT a.published_version_id
        FROM public.help_articles a
        WHERE a.id = article_id
      )
    )
  );

-- Draft steps: platform only. Published version steps: customers of visible articles.
DROP POLICY IF EXISTS "Help article steps readable"
  ON public.help_article_steps;
CREATE POLICY "Help article steps readable"
  ON public.help_article_steps
  FOR SELECT
  TO authenticated
  USING (
    public.can_read_help_drafts()
    OR (
      version_id IS NOT NULL
      AND public.help_article_is_customer_visible(article_id)
      AND version_id = (
        SELECT a.published_version_id
        FROM public.help_articles a
        WHERE a.id = article_id
      )
    )
  );

DROP POLICY IF EXISTS "Help article relations readable"
  ON public.help_article_relations;
CREATE POLICY "Help article relations readable"
  ON public.help_article_relations
  FOR SELECT
  TO authenticated
  USING (
    public.can_read_help_drafts()
    OR (
      public.help_article_is_customer_visible(source_article_id)
      AND public.help_article_is_customer_visible(target_article_id)
    )
  );

DROP POLICY IF EXISTS "Help article roles readable"
  ON public.help_article_roles;
CREATE POLICY "Help article roles readable"
  ON public.help_article_roles
  FOR SELECT
  TO authenticated
  USING (
    public.can_read_help_drafts()
    OR public.help_article_is_customer_visible(article_id)
  );

DROP POLICY IF EXISTS "Help article features readable"
  ON public.help_article_features;
CREATE POLICY "Help article features readable"
  ON public.help_article_features
  FOR SELECT
  TO authenticated
  USING (
    public.can_read_help_drafts()
    OR public.help_article_is_customer_visible(article_id)
  );

DROP POLICY IF EXISTS "Help article plan visibility readable"
  ON public.help_article_plan_visibility;
CREATE POLICY "Help article plan visibility readable"
  ON public.help_article_plan_visibility
  FOR SELECT
  TO authenticated
  USING (
    public.can_read_help_drafts()
    OR public.help_article_is_customer_visible(article_id)
  );

DROP POLICY IF EXISTS "Help article attachments readable by platform"
  ON public.help_article_attachments;
CREATE POLICY "Help article attachments readable by platform"
  ON public.help_article_attachments
  FOR SELECT
  TO authenticated
  USING (
    public.can_read_help_drafts()
    OR public.help_article_is_customer_visible(article_id)
  );

-- Feedback: users insert own; platform analytics read
DROP POLICY IF EXISTS "Help feedback insert own"
  ON public.help_article_feedback;
CREATE POLICY "Help feedback insert own"
  ON public.help_article_feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.help_article_is_customer_visible(article_id)
  );

DROP POLICY IF EXISTS "Help feedback readable by analytics"
  ON public.help_article_feedback;
CREATE POLICY "Help feedback readable by analytics"
  ON public.help_article_feedback
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.can_read_help_analytics()
  );

DROP POLICY IF EXISTS "Help search events insert own"
  ON public.help_search_events;
CREATE POLICY "Help search events insert own"
  ON public.help_search_events
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Help search events readable by analytics"
  ON public.help_search_events;
CREATE POLICY "Help search events readable by analytics"
  ON public.help_search_events
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.can_read_help_analytics()
  );

DROP POLICY IF EXISTS "Help article views insert own"
  ON public.help_article_views;
CREATE POLICY "Help article views insert own"
  ON public.help_article_views
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.help_article_is_customer_visible(article_id)
  );

DROP POLICY IF EXISTS "Help article views readable by analytics"
  ON public.help_article_views;
CREATE POLICY "Help article views readable by analytics"
  ON public.help_article_views
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.can_read_help_analytics()
  );

-- Grants
GRANT SELECT ON public.help_categories TO authenticated;
GRANT SELECT ON public.help_articles TO authenticated;
GRANT SELECT ON public.help_article_versions TO authenticated;
GRANT SELECT ON public.help_article_steps TO authenticated;
GRANT SELECT ON public.help_article_relations TO authenticated;
GRANT SELECT ON public.help_article_roles TO authenticated;
GRANT SELECT ON public.help_article_features TO authenticated;
GRANT SELECT ON public.help_article_plan_visibility TO authenticated;
GRANT SELECT ON public.help_article_attachments TO authenticated;

GRANT SELECT, INSERT ON public.help_article_feedback TO authenticated;
GRANT SELECT, INSERT ON public.help_search_events TO authenticated;
GRANT SELECT, INSERT ON public.help_article_views TO authenticated;

GRANT ALL ON public.help_categories TO service_role;
GRANT ALL ON public.help_articles TO service_role;
GRANT ALL ON public.help_article_versions TO service_role;
GRANT ALL ON public.help_article_steps TO service_role;
GRANT ALL ON public.help_article_relations TO service_role;
GRANT ALL ON public.help_article_roles TO service_role;
GRANT ALL ON public.help_article_features TO service_role;
GRANT ALL ON public.help_article_plan_visibility TO service_role;
GRANT ALL ON public.help_article_feedback TO service_role;
GRANT ALL ON public.help_search_events TO service_role;
GRANT ALL ON public.help_article_views TO service_role;
GRANT ALL ON public.help_article_attachments TO service_role;

REVOKE ALL ON FUNCTION public.help_article_is_customer_visible(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.help_category_is_customer_visible(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_read_help_drafts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_read_help_analytics() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_help_article_search(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_help_articles(
  text, integer, integer, uuid, public.help_article_type
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.help_article_is_customer_visible(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.help_category_is_customer_visible(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_read_help_drafts()
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_read_help_analytics()
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refresh_help_article_search(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.search_help_articles(
  text, integer, integer, uuid, public.help_article_type
) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Platform permission seeds
-- ---------------------------------------------------------------------------

SELECT public.seed_platform_permission(
  'help.console.access',
  'Access Help Center console',
  'Enter the /platform/help administration area.',
  'help'
);

SELECT public.seed_platform_permission(
  'help.manage',
  'Manage Help Center',
  'Full Help Center management (categories, articles, publish, archive).',
  'help'
);

SELECT public.seed_platform_permission(
  'help.read_drafts',
  'Read Help drafts',
  'View unpublished Help Center drafts and in-review articles.',
  'help'
);

SELECT public.seed_platform_permission(
  'help.create',
  'Create Help content',
  'Create Help categories and articles.',
  'help'
);

SELECT public.seed_platform_permission(
  'help.update',
  'Update Help content',
  'Edit Help categories, articles, and ordered steps.',
  'help'
);

SELECT public.seed_platform_permission(
  'help.publish',
  'Publish Help content',
  'Publish or unpublish Help articles and create version snapshots.',
  'help'
);

SELECT public.seed_platform_permission(
  'help.archive',
  'Archive Help content',
  'Archive Help categories and articles.',
  'help'
);

SELECT public.seed_platform_permission(
  'help.categories.manage',
  'Manage Help categories',
  'Create, reorder, and archive Help Center categories.',
  'help'
);

SELECT public.seed_platform_permission(
  'help.versions.read',
  'Read Help versions',
  'View Help article version history.',
  'help'
);

SELECT public.seed_platform_permission(
  'help.analytics.read',
  'Read Help analytics',
  'View Help search analytics, views, and feedback reports.',
  'help'
);

-- super_admin: all help permissions
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT permission_key
    FROM public.platform_permissions
    WHERE category = 'help'::public.platform_permission_category
      AND status = 'active'::public.platform_permission_status
  LOOP
    PERFORM public.seed_platform_role_permission('super_admin', r.permission_key);
  END LOOP;
END $$;

-- platform_admin: full help management
SELECT public.seed_platform_role_permission('platform_admin', 'help.console.access');
SELECT public.seed_platform_role_permission('platform_admin', 'help.manage');
SELECT public.seed_platform_role_permission('platform_admin', 'help.read_drafts');
SELECT public.seed_platform_role_permission('platform_admin', 'help.create');
SELECT public.seed_platform_role_permission('platform_admin', 'help.update');
SELECT public.seed_platform_role_permission('platform_admin', 'help.publish');
SELECT public.seed_platform_role_permission('platform_admin', 'help.archive');
SELECT public.seed_platform_role_permission('platform_admin', 'help.categories.manage');
SELECT public.seed_platform_role_permission('platform_admin', 'help.versions.read');
SELECT public.seed_platform_role_permission('platform_admin', 'help.analytics.read');

-- support: read drafts + analytics (no publish)
SELECT public.seed_platform_role_permission('support', 'help.console.access');
SELECT public.seed_platform_role_permission('support', 'help.read_drafts');
SELECT public.seed_platform_role_permission('support', 'help.versions.read');
SELECT public.seed_platform_role_permission('support', 'help.analytics.read');

-- developer: read drafts only (explicitly no publish/create by default)
SELECT public.seed_platform_role_permission('developer', 'help.console.access');
SELECT public.seed_platform_role_permission('developer', 'help.read_drafts');
SELECT public.seed_platform_role_permission('developer', 'help.versions.read');

-- auditor: analytics + draft read
SELECT public.seed_platform_role_permission('auditor', 'help.console.access');
SELECT public.seed_platform_role_permission('auditor', 'help.read_drafts');
SELECT public.seed_platform_role_permission('auditor', 'help.versions.read');
SELECT public.seed_platform_role_permission('auditor', 'help.analytics.read');
