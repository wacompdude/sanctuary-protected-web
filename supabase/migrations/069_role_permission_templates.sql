-- =============================================================================
-- 069_role_permission_templates.sql
-- Phase 2: role → default permission templates + medical/sensor/scheduling keys.
-- Additive. Seed uses ON CONFLICT DO NOTHING.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. role_permission_templates
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.role_template_kind AS ENUM (
    'church',
    'campus'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.role_permission_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_kind public.role_template_kind NOT NULL,
  role_key text NOT NULL,
  permission_key text NOT NULL REFERENCES public.permission_definitions(permission_key)
    ON UPDATE CASCADE ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (role_kind, role_key, permission_key)
);

CREATE INDEX IF NOT EXISTS role_permission_templates_role_idx
  ON public.role_permission_templates (role_kind, role_key);

COMMENT ON TABLE public.role_permission_templates IS
  'Default permission grants for church and campus roles. Auth engine unions these.';

ALTER TABLE public.role_permission_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS role_permission_templates_read ON public.role_permission_templates;
CREATE POLICY role_permission_templates_read
  ON public.role_permission_templates
  FOR SELECT
  TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- 2. Additional permission definitions
-- ---------------------------------------------------------------------------

INSERT INTO public.permission_definitions (
  permission_key, category, display_name, description, risk_level, minimum_tier, supports_campus_scope
) VALUES
  -- Scheduling
  ('scheduling.view', 'scheduling', 'View Schedules', 'View security and event schedules', 'low', 'servant_standard', true),
  ('scheduling.manage', 'scheduling', 'Manage Schedules', 'Create and edit schedules and shifts', 'medium', 'steward_pro', true),
  ('scheduling.request_coverage', 'scheduling', 'Request Security Coverage', 'Request security coverage for events', 'low', 'steward_pro', true),

  -- Medical inventory
  ('medical.view', 'medical', 'View Medical Inventory', 'View medical supplies and AED inventory', 'low', 'steward_pro', true),
  ('medical.manage', 'medical', 'Manage Medical Inventory', 'Create and update medical inventory items', 'medium', 'steward_pro', true),
  ('medical.inventory', 'medical', 'Adjust Medical Stock', 'Record stock adjustments and restocks', 'medium', 'steward_pro', true),
  ('medical.incident_tracking', 'medical', 'Track Medical Usage on Incidents', 'Record medical supplies used during incidents', 'medium', 'steward_pro', true),
  ('medical.reports', 'medical', 'View Medical Reports', 'View medical inventory and usage reports', 'low', 'steward_pro', true),

  -- Hardware / sensors (supplement equipment.*)
  ('hardware.view', 'hardware', 'View Hardware', 'View security hardware assets', 'low', 'steward_pro', true),
  ('hardware.create', 'hardware', 'Create Hardware', 'Add hardware assets', 'medium', 'guardian_plus', true),
  ('hardware.update', 'hardware', 'Update Hardware', 'Edit hardware assets and assignments', 'medium', 'guardian_plus', true),
  ('hardware.delete', 'hardware', 'Delete Hardware', 'Archive or delete hardware assets', 'high', 'guardian_plus', true),
  ('maintenance.create', 'hardware', 'Create Maintenance Records', 'Create maintenance / warranty records', 'medium', 'guardian_plus', true),
  ('maintenance.update', 'hardware', 'Update Maintenance Records', 'Update maintenance / warranty records', 'medium', 'guardian_plus', true),
  ('sensors.view', 'sensors', 'View Sensors', 'View sensor and alarm status', 'low', 'guardian_plus', true),
  ('sensors.manage', 'sensors', 'Manage Sensors', 'Configure sensors and alarm devices', 'high', 'guardian_plus', true),

  -- Analytics (pastor / leadership)
  ('analytics.view', 'reports', 'View Analytics', 'View dashboard analytics summaries', 'low', 'steward_pro', false),

  -- Volunteers (event coordination)
  ('volunteers.coordinate', 'events', 'Coordinate Volunteers', 'Coordinate volunteers for church events', 'low', 'steward_pro', true)
ON CONFLICT (permission_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Helper: upsert template rows from arrays via INSERT SELECT
-- ---------------------------------------------------------------------------

-- Existing church roles (subset matching app ROLE_PERMISSION_MAPPING; keep in sync with TS)
INSERT INTO public.role_permission_templates (role_kind, role_key, permission_key)
SELECT
  CASE
    WHEN v.role_key LIKE 'campus_%' THEN 'campus'::public.role_template_kind
    ELSE 'church'::public.role_template_kind
  END,
  v.role_key,
  v.permission_key
FROM (VALUES
  -- viewer
  ('viewer', 'dashboard.view'),
  ('viewer', 'members.view'),
  ('viewer', 'incidents.view'),
  ('viewer', 'reports.view'),
  ('viewer', 'events.view'),
  ('viewer', 'policies.view'),
  ('viewer', 'campuses.view'),
  ('viewer', 'certifications.view'),
  ('viewer', 'church_settings.view'),
  ('viewer', 'scheduling.view'),

  -- pastor (read-only executive)
  ('pastor', 'dashboard.view'),
  ('pastor', 'reports.view'),
  ('pastor', 'analytics.view'),
  ('pastor', 'incidents.view'),
  ('pastor', 'scheduling.view'),
  ('pastor', 'policies.view'),
  ('pastor', 'events.view'),
  ('pastor', 'campuses.view'),
  ('pastor', 'church_settings.view'),

  -- event_coordinator
  ('event_coordinator', 'dashboard.view'),
  ('event_coordinator', 'events.view'),
  ('event_coordinator', 'events.create'),
  ('event_coordinator', 'events.edit'),
  ('event_coordinator', 'events.assign_team'),
  ('event_coordinator', 'scheduling.view'),
  ('event_coordinator', 'scheduling.manage'),
  ('event_coordinator', 'scheduling.request_coverage'),
  ('event_coordinator', 'volunteers.coordinate'),
  ('event_coordinator', 'members.view'),
  ('event_coordinator', 'campuses.view'),
  ('event_coordinator', 'reports.view'),

  -- training_coordinator
  ('training_coordinator', 'dashboard.view'),
  ('training_coordinator', 'training.view'),
  ('training_coordinator', 'training.manage'),
  ('training_coordinator', 'training.events.view'),
  ('training_coordinator', 'training.events.create'),
  ('training_coordinator', 'training.events.edit'),
  ('training_coordinator', 'training.events.cancel'),
  ('training_coordinator', 'training.courses.view'),
  ('training_coordinator', 'training.courses.manage'),
  ('training_coordinator', 'training.participants.view'),
  ('training_coordinator', 'training.participants.manage'),
  ('training_coordinator', 'training.attendance.record'),
  ('training_coordinator', 'training.completion.record'),
  ('training_coordinator', 'training.requirements.view'),
  ('training_coordinator', 'training.requirements.manage'),
  ('training_coordinator', 'training.documents.view'),
  ('training_coordinator', 'training.documents.upload'),
  ('training_coordinator', 'training.reports.view'),
  ('training_coordinator', 'training.reports.run'),
  ('training_coordinator', 'training.transcripts.view'),
  ('training_coordinator', 'certifications.view'),
  ('training_coordinator', 'certifications.manage'),
  ('training_coordinator', 'members.view'),
  ('training_coordinator', 'reports.view'),

  -- medical_coordinator
  ('medical_coordinator', 'dashboard.view'),
  ('medical_coordinator', 'medical.view'),
  ('medical_coordinator', 'medical.manage'),
  ('medical_coordinator', 'medical.inventory'),
  ('medical_coordinator', 'medical.incident_tracking'),
  ('medical_coordinator', 'medical.reports'),
  ('medical_coordinator', 'incidents.view'),
  ('medical_coordinator', 'reports.view'),
  ('medical_coordinator', 'campuses.view'),

  -- hardware_manager
  ('hardware_manager', 'dashboard.view'),
  ('hardware_manager', 'hardware.view'),
  ('hardware_manager', 'hardware.create'),
  ('hardware_manager', 'hardware.update'),
  ('hardware_manager', 'hardware.delete'),
  ('hardware_manager', 'maintenance.create'),
  ('hardware_manager', 'maintenance.update'),
  ('hardware_manager', 'equipment.view'),
  ('hardware_manager', 'equipment.manage'),
  ('hardware_manager', 'cameras.view_live'),
  ('hardware_manager', 'cameras.manage'),
  ('hardware_manager', 'sensors.view'),
  ('hardware_manager', 'sensors.manage'),
  ('hardware_manager', 'campuses.view'),
  ('hardware_manager', 'reports.view'),

  -- security_member (core adds)
  ('security_member', 'dashboard.view'),
  ('security_member', 'members.view'),
  ('security_member', 'incidents.view'),
  ('security_member', 'incidents.create'),
  ('security_member', 'events.view'),
  ('security_member', 'reports.view'),
  ('security_member', 'policies.view'),
  ('security_member', 'campuses.view'),
  ('security_member', 'certifications.view'),
  ('security_member', 'church_settings.view'),
  ('security_member', 'scheduling.view'),

  -- security_leader
  ('security_leader', 'dashboard.view'),
  ('security_leader', 'members.view'),
  ('security_leader', 'incidents.view'),
  ('security_leader', 'incidents.create'),
  ('security_leader', 'incidents.edit'),
  ('security_leader', 'events.view'),
  ('security_leader', 'events.edit'),
  ('security_leader', 'events.assign_team'),
  ('security_leader', 'policies.view'),
  ('security_leader', 'notifications.send'),
  ('security_leader', 'reports.view'),
  ('security_leader', 'reports.run'),
  ('security_leader', 'campuses.view'),
  ('security_leader', 'certifications.view'),
  ('security_leader', 'equipment.view'),
  ('security_leader', 'church_settings.view'),
  ('security_leader', 'scheduling.view'),
  ('security_leader', 'scheduling.manage'),
  ('security_leader', 'cameras.view_live'),
  ('security_leader', 'sensors.view'),
  ('security_leader', 'training.view'),
  ('security_leader', 'training.events.view'),
  ('security_leader', 'training.attendance.record'),
  ('security_leader', 'training.completion.record'),

  -- campus_administrator template (campus kind)
  ('campus_administrator', 'dashboard.view'),
  ('campus_administrator', 'campuses.view'),
  ('campus_administrator', 'members.view'),
  ('campus_administrator', 'members.edit'),
  ('campus_administrator', 'scheduling.view'),
  ('campus_administrator', 'scheduling.manage'),
  ('campus_administrator', 'incidents.view'),
  ('campus_administrator', 'incidents.create'),
  ('campus_administrator', 'incidents.edit'),
  ('campus_administrator', 'notifications.send'),
  ('campus_administrator', 'hardware.view'),
  ('campus_administrator', 'hardware.update'),
  ('campus_administrator', 'equipment.view'),
  ('campus_administrator', 'equipment.manage'),
  ('campus_administrator', 'reports.view'),
  ('campus_administrator', 'reports.run'),
  ('campus_administrator', 'events.view'),
  ('campus_administrator', 'events.edit'),

  -- campus_security_leader template (campus kind)
  ('campus_security_leader', 'dashboard.view'),
  ('campus_security_leader', 'incidents.view'),
  ('campus_security_leader', 'incidents.create'),
  ('campus_security_leader', 'incidents.edit'),
  ('campus_security_leader', 'cameras.view_live'),
  ('campus_security_leader', 'sensors.view'),
  ('campus_security_leader', 'scheduling.view'),
  ('campus_security_leader', 'scheduling.manage'),
  ('campus_security_leader', 'notifications.send'),
  ('campus_security_leader', 'reports.view'),
  ('campus_security_leader', 'reports.run'),
  ('campus_security_leader', 'members.view'),
  ('campus_security_leader', 'events.view'),
  ('campus_security_leader', 'events.assign_team')
) AS v(role_key, permission_key)
WHERE EXISTS (
  SELECT 1 FROM public.permission_definitions pd
  WHERE pd.permission_key = v.permission_key
)
AND NOT EXISTS (
  SELECT 1 FROM public.role_permission_templates t
  WHERE t.role_kind = CASE
      WHEN v.role_key LIKE 'campus_%' THEN 'campus'::public.role_template_kind
      ELSE 'church'::public.role_template_kind
    END
    AND t.role_key = v.role_key
    AND t.permission_key = v.permission_key
);

-- Explicit campus kind insert for campus_* keys (re-seed with correct kind if any mis-tagged)
UPDATE public.role_permission_templates
SET role_kind = 'campus'::public.role_template_kind
WHERE role_key IN ('campus_administrator', 'campus_security_leader')
  AND role_kind IS DISTINCT FROM 'campus'::public.role_template_kind;
