-- =============================================================================
-- 084_campus_delegated_management.sql
-- Granular campus permissions, protected top-level admin keys, and campus-scoped
-- security group membership (one active assignment per user/group/campus).
-- Additive / non-destructive. Safe to re-run.
-- =============================================================================

INSERT INTO public.permission_definitions (
  permission_key,
  category,
  display_name,
  description,
  risk_level,
  minimum_tier,
  supports_campus_scope
) VALUES
  ('campuses.overview.view', 'campuses', 'View Campus Overview', 'View campus overview information without editing configuration', 'low', 'servant_standard', true),
  ('campuses.create', 'campuses', 'Create Campuses', 'Add a new campus. Restricted to Owner, Co-owner, and Administrator.', 'high', 'steward_pro', false),
  ('campuses.edit', 'campuses', 'Edit Campuses', 'Edit campus identity and configuration. Restricted to Owner, Co-owner, and Administrator.', 'high', 'steward_pro', false),
  ('campuses.deactivate', 'campuses', 'Deactivate Campuses', 'Deactivate a campus while preserving history. Restricted to Owner, Co-owner, and Administrator.', 'high', 'steward_pro', false),
  ('campuses.delete', 'campuses', 'Delete Campuses', 'Archive or delete a campus when permitted. Restricted to Owner, Co-owner, and Administrator.', 'high', 'steward_pro', false),
  ('campuses.settings.manage', 'campuses', 'Manage Campus Settings', 'Change campus-wide settings. Restricted to Owner, Co-owner, and Administrator.', 'high', 'steward_pro', false),
  ('campuses.security.manage', 'campuses', 'Manage Campus Security Delegation', 'Assign or revoke delegated campus managers. Restricted to Owner, Co-owner, and Administrator.', 'high', 'steward_pro', false),
  ('campuses.members.view', 'campuses', 'View Campus Members', 'View members assigned to a campus', 'low', 'servant_standard', true),
  ('campuses.members.add', 'campuses', 'Add Campus Members', 'Add existing organization members to a campus', 'medium', 'servant_standard', true),
  ('campuses.members.remove', 'campuses', 'Remove Campus Members', 'Remove members from a campus without deleting their organization account', 'medium', 'servant_standard', true),
  ('campuses.members.manage', 'campuses', 'Manage Campus Members', 'Update campus membership assignments for a selected campus', 'medium', 'servant_standard', true),
  ('campuses.roles.assign', 'campuses', 'Assign Campus Roles', 'Assign approved campus-level security roles', 'medium', 'servant_standard', true),
  ('campuses.groups.manage', 'campuses', 'Manage Campus Groups', 'Manage approved campus teams or security groups', 'medium', 'servant_standard', true),
  ('campuses.audit.view', 'campuses', 'View Campus Audit History', 'View campus-management audit history. Restricted to Owner, Co-owner, and Administrator.', 'high', 'steward_pro', false)
ON CONFLICT (permission_key) DO NOTHING;

-- Church-role templates: top-level campus administration stays on protected roles.
INSERT INTO public.role_permission_templates (role_kind, role_key, permission_key)
SELECT 'church'::public.role_template_kind, v.role_key, v.permission_key
FROM (VALUES
  ('owner', 'campuses.overview.view'),
  ('owner', 'campuses.create'),
  ('owner', 'campuses.edit'),
  ('owner', 'campuses.deactivate'),
  ('owner', 'campuses.delete'),
  ('owner', 'campuses.settings.manage'),
  ('owner', 'campuses.security.manage'),
  ('owner', 'campuses.members.view'),
  ('owner', 'campuses.members.add'),
  ('owner', 'campuses.members.remove'),
  ('owner', 'campuses.members.manage'),
  ('owner', 'campuses.roles.assign'),
  ('owner', 'campuses.groups.manage'),
  ('owner', 'campuses.audit.view'),
  ('co_owner', 'campuses.overview.view'),
  ('co_owner', 'campuses.create'),
  ('co_owner', 'campuses.edit'),
  ('co_owner', 'campuses.deactivate'),
  ('co_owner', 'campuses.delete'),
  ('co_owner', 'campuses.settings.manage'),
  ('co_owner', 'campuses.security.manage'),
  ('co_owner', 'campuses.members.view'),
  ('co_owner', 'campuses.members.add'),
  ('co_owner', 'campuses.members.remove'),
  ('co_owner', 'campuses.members.manage'),
  ('co_owner', 'campuses.roles.assign'),
  ('co_owner', 'campuses.groups.manage'),
  ('co_owner', 'campuses.audit.view'),
  ('administrator', 'campuses.overview.view'),
  ('administrator', 'campuses.create'),
  ('administrator', 'campuses.edit'),
  ('administrator', 'campuses.deactivate'),
  ('administrator', 'campuses.delete'),
  ('administrator', 'campuses.settings.manage'),
  ('administrator', 'campuses.security.manage'),
  ('administrator', 'campuses.members.view'),
  ('administrator', 'campuses.members.add'),
  ('administrator', 'campuses.members.remove'),
  ('administrator', 'campuses.members.manage'),
  ('administrator', 'campuses.roles.assign'),
  ('administrator', 'campuses.groups.manage'),
  ('administrator', 'campuses.audit.view')
) AS v(role_key, permission_key)
WHERE EXISTS (
  SELECT 1 FROM public.permission_definitions pd
  WHERE pd.permission_key = v.permission_key
)
AND NOT EXISTS (
  SELECT 1 FROM public.role_permission_templates t
  WHERE t.role_kind = 'church'::public.role_template_kind
    AND t.role_key = v.role_key
    AND t.permission_key = v.permission_key
);

-- Campus administrator template: scoped member management, not org members.edit.
INSERT INTO public.role_permission_templates (role_kind, role_key, permission_key)
SELECT 'campus'::public.role_template_kind, v.role_key, v.permission_key
FROM (VALUES
  ('campus_administrator', 'campuses.overview.view'),
  ('campus_administrator', 'campuses.members.view'),
  ('campus_administrator', 'campuses.members.add'),
  ('campus_administrator', 'campuses.members.remove'),
  ('campus_administrator', 'campuses.members.manage'),
  ('campus_administrator', 'campuses.roles.assign'),
  ('campus_administrator', 'campuses.groups.manage'),
  ('campus_leader', 'campuses.overview.view'),
  ('campus_leader', 'campuses.members.view')
) AS v(role_key, permission_key)
WHERE EXISTS (
  SELECT 1 FROM public.permission_definitions pd
  WHERE pd.permission_key = v.permission_key
)
AND NOT EXISTS (
  SELECT 1 FROM public.role_permission_templates t
  WHERE t.role_kind = 'campus'::public.role_template_kind
    AND t.role_key = v.role_key
    AND t.permission_key = v.permission_key
);

DELETE FROM public.role_permission_templates
WHERE role_kind = 'campus'::public.role_template_kind
  AND role_key = 'campus_administrator'
  AND permission_key = 'members.edit';

-- Allow one active membership per user/group/campus so North and South can be
-- delegated independently without granting all-campus access.
DROP INDEX IF EXISTS public.idx_security_group_members_active;

CREATE UNIQUE INDEX IF NOT EXISTS idx_security_group_members_active_campus
  ON public.security_group_members(security_group_id, user_id, campus_id)
  WHERE status = 'active'::public.security_group_member_status
    AND campus_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_security_group_members_active_org
  ON public.security_group_members(security_group_id, user_id)
  WHERE status = 'active'::public.security_group_member_status
    AND campus_id IS NULL;
