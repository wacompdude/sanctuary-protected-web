-- =============================================================================
-- 083_platform_plan_feature_management.sql
-- Grant platform administrators permission to manage plan-feature assignments.
-- Super admin already inherits all platform permissions.
-- =============================================================================

SELECT public.seed_platform_role_permission('platform_admin', 'plans.manage');
SELECT public.seed_platform_role_permission('platform_admin', 'features.manage');
