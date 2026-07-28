-- =============================================================================
-- 064_training_feature_and_permissions.sql
-- Feature key training.management.enabled for Steward Pro+
-- Granular training permission definitions
-- Requires 063 (feature_category 'training') to be committed first.
-- =============================================================================

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
VALUES (
  'training.management.enabled',
  'Training Management',
  'Document security training events, attendance, requirements, and transcripts.',
  'training',
  'boolean',
  false,
  NULL,
  NULL,
  true,
  'Training Management',
  'training',
  10
)
ON CONFLICT (feature_key) DO NOTHING;

-- Explicitly disabled on Servant Standard
SELECT public.seed_plan_feature_boolean(
  'servant_standard', 'training.management.enabled', false, false, NULL
);

-- Enabled on Steward Pro, Shepherd Plus, Omni Enterprise
SELECT public.seed_plan_feature_boolean(
  'steward_pro', 'training.management.enabled', true, false, NULL
);
SELECT public.seed_plan_feature_boolean(
  'shepherd_plus', 'training.management.enabled', true, true, 'steward_pro'
);
SELECT public.seed_plan_feature_boolean(
  'omni_enterprise', 'training.management.enabled', true, true, 'steward_pro'
);

-- Update legacy training permission minimum tiers to steward_pro
UPDATE public.permission_definitions
SET
  minimum_tier = 'steward_pro',
  updated_at = now()
WHERE permission_key IN ('training.view', 'training.manage')
  AND minimum_tier IS DISTINCT FROM 'steward_pro';

-- Granular training permissions (additive)
INSERT INTO public.permission_definitions (
  permission_key, category, display_name, description, risk_level, minimum_tier, supports_campus_scope
) VALUES
  ('training.events.view', 'training', 'View Training Events', 'View training events and schedules', 'low', 'steward_pro', true),
  ('training.events.create', 'training', 'Create Training Events', 'Create training events', 'medium', 'steward_pro', true),
  ('training.events.edit', 'training', 'Edit Training Events', 'Edit training events', 'medium', 'steward_pro', true),
  ('training.events.cancel', 'training', 'Cancel Training Events', 'Cancel or postpone training events', 'medium', 'steward_pro', true),
  ('training.events.archive', 'training', 'Archive Training Events', 'Archive completed training events', 'medium', 'steward_pro', true),
  ('training.events.delete_draft', 'training', 'Delete Draft Training Events', 'Delete draft training events only', 'high', 'steward_pro', true),
  ('training.courses.view', 'training', 'View Training Courses', 'View the training course catalog', 'low', 'steward_pro', false),
  ('training.courses.manage', 'training', 'Manage Training Courses', 'Create and edit training courses', 'medium', 'steward_pro', false),
  ('training.categories.view', 'training', 'View Training Categories', 'View training categories', 'low', 'steward_pro', false),
  ('training.categories.manage', 'training', 'Manage Training Categories', 'Create and manage training categories', 'medium', 'steward_pro', false),
  ('training.participants.view', 'training', 'View Training Participants', 'View training participant rosters', 'low', 'steward_pro', true),
  ('training.participants.manage', 'training', 'Manage Training Participants', 'Enroll and manage participants', 'medium', 'steward_pro', true),
  ('training.attendance.record', 'training', 'Record Training Attendance', 'Record attendance for training events', 'medium', 'steward_pro', true),
  ('training.completion.record', 'training', 'Record Training Completion', 'Record completion and hours', 'medium', 'steward_pro', true),
  ('training.requirements.view', 'training', 'View Training Requirements', 'View required-training rules', 'low', 'steward_pro', true),
  ('training.requirements.manage', 'training', 'Manage Training Requirements', 'Define required training rules', 'high', 'steward_pro', true),
  ('training.external_records.create', 'training', 'Submit External Training', 'Record external training completions', 'medium', 'steward_pro', true),
  ('training.external_records.verify', 'training', 'Verify External Training', 'Verify or reject external training', 'high', 'steward_pro', true),
  ('training.documents.view', 'training', 'View Training Documents', 'View training attachments', 'low', 'steward_pro', true),
  ('training.documents.upload', 'training', 'Upload Training Documents', 'Upload training attachments', 'medium', 'steward_pro', true),
  ('training.documents.delete', 'training', 'Delete Training Documents', 'Remove training attachments', 'high', 'steward_pro', true),
  ('training.costs.view', 'training', 'View Training Costs', 'View training cost fields', 'high', 'steward_pro', true),
  ('training.costs.manage', 'training', 'Manage Training Costs', 'Edit training cost fields', 'high', 'steward_pro', true),
  ('training.reports.view', 'training', 'View Training Reports', 'Access training reports', 'low', 'steward_pro', true),
  ('training.reports.run', 'training', 'Run Training Reports', 'Run training reports', 'medium', 'steward_pro', true),
  ('training.reports.export', 'training', 'Export Training Reports', 'Export training report data', 'high', 'steward_pro', true),
  ('training.transcripts.view', 'training', 'View Training Transcripts', 'View member training transcripts', 'low', 'steward_pro', true),
  ('training.transcripts.export', 'training', 'Export Training Transcripts', 'Export member training transcripts', 'medium', 'steward_pro', true),
  ('training.settings.manage', 'training', 'Manage Training Settings', 'Configure training module settings', 'high', 'steward_pro', false),
  ('training.audit.view', 'training', 'View Training Audit Log', 'View training-related audit entries', 'high', 'steward_pro', false),
  ('training.sensitive.view', 'training', 'View Sensitive Training', 'View lethal/non-lethal and sensitive training records', 'high', 'steward_pro', true),
  ('training.sensitive.manage', 'training', 'Manage Sensitive Training', 'Manage sensitive training records', 'high', 'steward_pro', true),
  ('training.sensitive.reports', 'training', 'Sensitive Training Reports', 'Run reports that include sensitive training', 'high', 'steward_pro', true)
ON CONFLICT (permission_key) DO NOTHING;
