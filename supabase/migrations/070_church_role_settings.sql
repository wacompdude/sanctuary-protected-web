-- =============================================================================
-- 070_church_role_settings.sql
-- Per-church overrides for system role catalog (description + active/inactive).
-- System role keys remain membership_role / campus_role enums.
-- Duplicate creates a security group (app); this table supports Edit/Deactivate.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.church_role_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  role_kind public.role_template_kind NOT NULL DEFAULT 'church'::public.role_template_kind,
  role_key text NOT NULL,
  display_name_override text,
  description_override text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (church_id, role_kind, role_key)
);

CREATE INDEX IF NOT EXISTS church_role_settings_church_idx
  ON public.church_role_settings (church_id);

COMMENT ON TABLE public.church_role_settings IS
  'Church-specific role catalog overrides. Inactive roles are hidden from assignment UIs.';

ALTER TABLE public.church_role_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS church_role_settings_select ON public.church_role_settings;
DROP POLICY IF EXISTS church_role_settings_write ON public.church_role_settings;

CREATE POLICY church_role_settings_select
  ON public.church_role_settings
  FOR SELECT
  TO authenticated
  USING (public.is_active_church_member(church_id));

CREATE POLICY church_role_settings_write
  ON public.church_role_settings
  FOR ALL
  TO authenticated
  USING (
    public.has_church_role(
      church_id,
      ARRAY['owner', 'co_owner', 'administrator']::text[]
    )
  )
  WITH CHECK (
    public.has_church_role(
      church_id,
      ARRAY['owner', 'co_owner', 'administrator']::text[]
    )
  );
