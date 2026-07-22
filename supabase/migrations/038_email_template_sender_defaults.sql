-- =============================================================================
-- 038_email_template_sender_defaults.sql
-- Seed default_sender_category on system notification templates from the
-- platform notification-type → sender map. Safe to re-run.
-- APPLY AFTER: 037_email_sender_snapshots.sql
-- =============================================================================

UPDATE public.notification_templates AS t
SET default_sender_category = v.category
FROM (
  VALUES
    ('incident.created', 'incidents'),
    ('incident.critical', 'emergency'),
    ('incident.updated', 'incidents'),
    ('incident.resolved', 'incidents'),
    ('incident.assigned', 'incidents'),
    ('incident.reopened', 'incidents'),
    ('incident.follow_up_required', 'incidents'),
    ('incident.acknowledgment_requested', 'incidents'),
    ('emergency.alert', 'emergency'),
    ('certification.expiring', 'info'),
    ('certification.expired', 'info'),
    ('equipment.maintenance_due', 'hardware'),
    ('equipment.out_of_service', 'hardware'),
    ('equipment.inspection_due', 'hardware'),
    ('equipment.warranty_expiring', 'hardware'),
    ('membership.invited', 'access'),
    ('membership.role_changed', 'access'),
    ('membership.invitation_accepted', 'access'),
    ('general.announcement', 'info'),
    ('policy.published', 'info'),
    ('policy.acknowledgment_required', 'info'),
    ('notification.test', 'no_reply'),
    ('schedule.assignment_created', 'info'),
    ('schedule.assignment_changed', 'info'),
    ('schedule.assignment_cancelled', 'info'),
    ('schedule.assignment_reminder', 'info'),
    ('schedule.assignment_response_required', 'info'),
    ('schedule.assignment_accepted', 'info'),
    ('schedule.assignment_declined', 'info'),
    ('schedule.open_shift_available', 'info'),
    ('schedule.unfilled_shift_warning', 'info'),
    ('schedule.event_cancelled', 'info'),
    ('schedule.conflict_override', 'info'),
    ('schedule.custom_message', 'info'),
    ('schedule.shift_cancelled', 'info'),
    ('schedule.event_created', 'info'),
    ('schedule.event_updated', 'info'),
    ('schedule.shift_created', 'info'),
    ('schedule.shift_updated', 'info')
) AS v(template_key, category)
WHERE t.church_id IS NULL
  AND t.is_system_template = true
  AND t.channel = 'email'
  AND t.template_key = v.template_key
  AND (
    t.default_sender_category IS NULL
    OR t.default_sender_category IS DISTINCT FROM v.category
  );
