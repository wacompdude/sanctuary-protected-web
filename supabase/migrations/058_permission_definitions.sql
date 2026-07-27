-- =============================================================================
-- 058_permission_definitions.sql
-- Permission catalog: structured permission keys with metadata.
-- Additive / non-destructive. Safe to re-run.
--
-- Architecture:
--   permission_definitions — master catalog of permissions
--   Keys are stable and app-level; do not encode permission logic in SQL
--
-- Tier mapping:
--   minimum_tier indicates the lowest subscription plan that includes this permission
--   App resolves tier availability via subscription resolver
--
-- Risk levels guide UI/UX:
--   'low' — standard operations (view, create)
--   'medium' — modifications (edit)
--   'high' — administrative/dangerous (delete, security admin, emergency)
--
-- Seed policy:
--   INSERT permissions ON CONFLICT DO NOTHING (safe to re-run)
--   Manual edits to descriptions/metadata not overwritten
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.permission_risk_level AS ENUM (
    'low',
    'medium',
    'high'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- permission_definitions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.permission_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_key text NOT NULL UNIQUE,
  category text NOT NULL,
  display_name text NOT NULL,
  description text,
  risk_level public.permission_risk_level NOT NULL DEFAULT 'low',
  minimum_tier text NOT NULL DEFAULT 'servant_standard',
  supports_campus_scope boolean NOT NULL DEFAULT true,
  supports_resource_scope boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  
  UNIQUE (permission_key)
);

CREATE INDEX IF NOT EXISTS idx_permission_definitions_category ON public.permission_definitions(category);
CREATE INDEX IF NOT EXISTS idx_permission_definitions_active ON public.permission_definitions(active);
CREATE INDEX IF NOT EXISTS idx_permission_definitions_key ON public.permission_definitions(permission_key);

-- ---------------------------------------------------------------------------
-- RLS Policies
-- ---------------------------------------------------------------------------

ALTER TABLE public.permission_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "permission_definitions_read" ON public.permission_definitions;
DROP POLICY IF EXISTS "permission_definitions_write" ON public.permission_definitions;
DROP POLICY IF EXISTS "permission_definitions_update" ON public.permission_definitions;

-- Anyone can read permission definitions (public catalog)
CREATE POLICY "permission_definitions_read" ON public.permission_definitions
  FOR SELECT
  USING (true);

-- Only service role can insert/update (admin-controlled)
CREATE POLICY "permission_definitions_write" ON public.permission_definitions
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role'::text);

CREATE POLICY "permission_definitions_update" ON public.permission_definitions
  FOR UPDATE
  USING (auth.role() = 'service_role'::text)
  WITH CHECK (auth.role() = 'service_role'::text);

-- ---------------------------------------------------------------------------
-- Permissions Seed Data
-- ---------------------------------------------------------------------------

INSERT INTO public.permission_definitions (
  permission_key, category, display_name, description, risk_level, minimum_tier, supports_campus_scope
) VALUES
  -- Dashboard
  ('dashboard.view', 'dashboard', 'View Dashboard', 'Access the main dashboard and overview', 'low', 'servant_standard', false),

  -- Members / Users
  ('members.view', 'members', 'View Members', 'View church members and user list', 'low', 'servant_standard', false),
  ('members.create', 'members', 'Create Members', 'Invite and create new users', 'medium', 'steward_pro', false),
  ('members.edit', 'members', 'Edit Members', 'Modify member information', 'medium', 'steward_pro', false),
  ('members.deactivate', 'members', 'Deactivate Members', 'Deactivate or remove members', 'high', 'steward_pro', false),

  -- Security Groups
  ('groups.view', 'security', 'View Security Groups', 'View security groups and members', 'low', 'omni_enterprise', false),
  ('groups.create', 'security', 'Create Security Groups', 'Create new security groups', 'medium', 'omni_enterprise', false),
  ('groups.edit', 'security', 'Edit Security Groups', 'Modify security group settings', 'medium', 'omni_enterprise', false),
  ('groups.delete', 'security', 'Delete Security Groups', 'Delete security groups', 'high', 'omni_enterprise', false),
  ('groups.manage', 'security', 'Manage Security Groups', 'Manage all aspects of security groups', 'high', 'omni_enterprise', false),
  ('groups.manage_members', 'security', 'Manage Group Members', 'Add and remove users from groups', 'medium', 'omni_enterprise', false),

  -- Incidents
  ('incidents.view', 'incidents', 'View Incidents', 'View incident reports', 'low', 'servant_standard', true),
  ('incidents.create', 'incidents', 'Create Incidents', 'Create new incident reports', 'medium', 'steward_pro', true),
  ('incidents.edit', 'incidents', 'Edit Incidents', 'Modify incident reports', 'medium', 'steward_pro', true),
  ('incidents.delete', 'incidents', 'Delete Incidents', 'Delete incident reports', 'high', 'shepherd_plus', true),
  ('incidents.export', 'incidents', 'Export Incidents', 'Export incident data', 'high', 'shepherd_plus', true),
  ('incidents.view_sensitive', 'incidents', 'View Sensitive Incidents', 'View incidents marked sensitive', 'high', 'shepherd_plus', true),
  ('incidents.edit_sensitive', 'incidents', 'Edit Sensitive Incidents', 'Modify sensitive incident reports', 'high', 'shepherd_plus', true),
  ('incidents.view_all_campuses', 'incidents', 'View All Campus Incidents', 'View incidents across all campuses', 'high', 'omni_enterprise', false),
  ('incidents.delete_archive', 'incidents', 'Archive Incidents', 'Delete or archive incident records', 'high', 'omni_enterprise', true),

  -- Reports
  ('reports.view', 'reports', 'View Reports', 'Access reports section', 'low', 'servant_standard', true),
  ('reports.run', 'reports', 'Run Reports', 'Execute and view reports', 'medium', 'steward_pro', true),
  ('reports.save', 'reports', 'Save Reports', 'Save custom report definitions', 'medium', 'steward_pro', true),
  ('reports.edit', 'reports', 'Edit Reports', 'Modify saved report definitions', 'medium', 'shepherd_plus', true),
  ('reports.delete', 'reports', 'Delete Reports', 'Delete report definitions', 'high', 'shepherd_plus', true),
  ('reports.export', 'reports', 'Export Reports', 'Export report data', 'high', 'steward_pro', true),
  ('reports.schedule', 'reports', 'Schedule Reports', 'Schedule automated report runs', 'high', 'omni_enterprise', true),
  ('reports.manage_definitions', 'reports', 'Manage Report Definitions', 'Manage system report definitions', 'high', 'omni_enterprise', false),
  ('reports.view_all_campuses', 'reports', 'View All Campus Reports', 'Run reports across all campuses', 'high', 'omni_enterprise', false),

  -- Cameras
  ('cameras.view_live', 'cameras', 'View Live Camera Feeds', 'Watch live camera streams', 'low', 'shepherd_plus', true),
  ('cameras.view_recordings', 'cameras', 'View Camera Recordings', 'View recorded camera footage', 'medium', 'omni_enterprise', true),
  ('cameras.download_recordings', 'cameras', 'Download Recordings', 'Download camera recordings', 'high', 'omni_enterprise', true),
  ('cameras.manage', 'cameras', 'Manage Cameras', 'Add, configure, and remove cameras', 'high', 'omni_enterprise', true),

  -- Notifications
  ('notifications.send', 'notifications', 'Send Notifications', 'Send general notifications', 'medium', 'shepherd_plus', false),
  ('notifications.send_emergency', 'notifications', 'Send Emergency Notifications', 'Send emergency/alert notifications', 'high', 'omni_enterprise', false),
  ('notifications.manage_templates', 'notifications', 'Manage Notification Templates', 'Create and modify notification templates', 'high', 'omni_enterprise', false),

  -- Events
  ('events.view', 'events', 'View Events', 'View scheduled events', 'low', 'servant_standard', true),
  ('events.create', 'events', 'Create Events', 'Create new events', 'medium', 'steward_pro', true),
  ('events.edit', 'events', 'Edit Events', 'Modify event details', 'medium', 'steward_pro', true),
  ('events.assign_team', 'events', 'Assign Team Members', 'Assign staff to events', 'medium', 'steward_pro', true),
  ('events.manage', 'events', 'Manage Events', 'Full event management', 'high', 'shepherd_plus', true),

  -- Policies
  ('policies.view', 'policies', 'View Policies', 'View policy documents', 'low', 'servant_standard', false),
  ('policies.create', 'policies', 'Create Policies', 'Create new policy documents', 'medium', 'steward_pro', false),
  ('policies.edit', 'policies', 'Edit Policies', 'Modify policy documents', 'medium', 'steward_pro', false),
  ('policies.publish', 'policies', 'Publish Policies', 'Publish policies for staff', 'high', 'shepherd_plus', false),

  -- Training & Certifications
  ('training.view', 'training', 'View Training', 'View training materials', 'low', 'shepherd_plus', false),
  ('training.manage', 'training', 'Manage Training', 'Create and manage training', 'high', 'shepherd_plus', false),
  ('certifications.view', 'certifications', 'View Certifications', 'View certification records', 'low', 'servant_standard', false),
  ('certifications.manage', 'certifications', 'Manage Certifications', 'Manage certifications', 'high', 'steward_pro', false),

  -- Equipment
  ('equipment.view', 'equipment', 'View Equipment', 'View security equipment inventory', 'low', 'shepherd_plus', false),
  ('equipment.manage', 'equipment', 'Manage Equipment', 'Manage equipment records', 'high', 'shepherd_plus', false),

  -- Campuses
  ('campuses.view', 'campuses', 'View Campuses', 'View campus information', 'low', 'servant_standard', false),
  ('campuses.manage', 'campuses', 'Manage Campuses', 'Add and configure campuses', 'high', 'steward_pro', false),

  -- Security Administration
  ('security.view', 'security', 'View Security Settings', 'View security configuration', 'low', 'omni_enterprise', false),
  ('security.manage_groups', 'security', 'Manage Security Groups', 'Create and modify security groups', 'high', 'omni_enterprise', false),
  ('security.manage_users', 'security', 'Manage User Access', 'Manage individual user permissions', 'high', 'omni_enterprise', false),
  ('security.grant_direct_permissions', 'security', 'Grant Direct Permissions', 'Grant permissions to individual users', 'high', 'omni_enterprise', false),
  ('security.manage_temporary_access', 'security', 'Manage Temporary Access', 'Create and manage temporary access grants', 'high', 'omni_enterprise', false),
  ('security.view_audit_log', 'security', 'View Security Audit Log', 'View security-related audit logs', 'high', 'omni_enterprise', false),
  ('security.preview_access', 'security', 'Preview User Access', 'Test access for users and permissions', 'medium', 'omni_enterprise', false),

  -- Church Settings
  ('church_settings.view', 'settings', 'View Church Settings', 'View church configuration', 'low', 'servant_standard', false),
  ('church_settings.manage', 'settings', 'Manage Church Settings', 'Modify church configuration', 'high', 'steward_pro', false)
ON CONFLICT (permission_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

GRANT SELECT ON public.permission_definitions TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.permission_definitions TO service_role;
