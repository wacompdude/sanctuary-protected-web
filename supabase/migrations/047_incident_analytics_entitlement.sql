-- Incident analytics as a plan-gated module (incidents.analytics.enabled).
-- Default matrix: off on Servant Standard; on for Steward Pro and above.
-- Platform admins can change per-plan values after seeding.

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
  'incidents.analytics.enabled',
  'Incident analytics',
  'Charts and reports for incidents by type, severity, and status.',
  'incidents',
  'boolean',
  false,
  NULL,
  NULL,
  true,
  'Incident analytics',
  'incidents',
  50
)
ON CONFLICT (feature_key) DO NOTHING;

SELECT public.seed_plan_feature_boolean(
  'servant_standard',
  'incidents.analytics.enabled',
  false,
  false,
  NULL
);

SELECT public.seed_plan_feature_boolean(
  'steward_pro',
  'incidents.analytics.enabled',
  true,
  false,
  NULL
);

SELECT public.seed_plan_feature_boolean(
  'shepherd_plus',
  'incidents.analytics.enabled',
  true,
  true,
  'steward_pro'
);

SELECT public.seed_plan_feature_boolean(
  'omni_enterprise',
  'incidents.analytics.enabled',
  true,
  true,
  'shepherd_plus'
);
