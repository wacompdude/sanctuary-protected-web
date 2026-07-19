-- =============================================================================
-- 034_policy_acknowledgments_and_templates.sql
-- Bulk acknowledgment assignment RPC + policy notification email templates.
-- Apply in Supabase SQL Editor after 033_policy_management.sql.
-- =============================================================================

-- Resolve active members who should receive acknowledgment for a published policy.
CREATE OR REPLACE FUNCTION public.policy_acknowledgment_audience_memberships(
  p_document_id uuid
)
RETURNS TABLE (
  membership_id uuid,
  user_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d public.policy_documents%ROWTYPE;
  min_rank integer;
BEGIN
  SELECT * INTO d FROM public.policy_documents WHERE id = p_document_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  min_rank := public.membership_role_rank(
    coalesce(nullif(trim(d.minimum_role), ''), 'viewer')
  );

  IF d.audience_scope = 'custom'::public.policy_audience_scope THEN
    RETURN QUERY
    SELECT DISTINCT m.id, m.user_id
    FROM public.policy_assignments a
    JOIN public.church_memberships m
      ON m.church_id = d.church_id
     AND m.status = 'active'::public.membership_status
    WHERE a.policy_document_id = d.id
      AND a.church_id = d.church_id
      AND a.revoked_at IS NULL
      AND public.membership_role_rank(m.role::text) >= min_rank
      AND (
        a.assignment_type = 'all_members'::public.policy_assignment_type
        OR (
          a.assignment_type = 'security_team'::public.policy_assignment_type
          AND public.membership_role_rank(m.role::text)
            >= public.membership_role_rank('security_member')
        )
        OR (
          a.assignment_type = 'role'::public.policy_assignment_type
          AND a.role IS NOT NULL
          AND m.role = a.role
        )
        OR (
          a.assignment_type = 'user'::public.policy_assignment_type
          AND a.user_id IS NOT NULL
          AND m.user_id = a.user_id
        )
        OR (
          a.assignment_type = 'campus'::public.policy_assignment_type
          AND d.campus_id IS NOT NULL
          AND a.campus_id = d.campus_id
        )
      );
    RETURN;
  END IF;

  RETURN QUERY
  SELECT m.id, m.user_id
  FROM public.church_memberships m
  WHERE m.church_id = d.church_id
    AND m.status = 'active'::public.membership_status
    AND public.membership_role_rank(m.role::text) >= min_rank
    AND (
      CASE d.audience_scope
        WHEN 'all_members'::public.policy_audience_scope THEN true
        WHEN 'security_team'::public.policy_audience_scope THEN
          public.membership_role_rank(m.role::text)
            >= public.membership_role_rank('security_member')
        WHEN 'security_leadership'::public.policy_audience_scope THEN
          public.membership_role_rank(m.role::text)
            >= public.membership_role_rank('security_leader')
        WHEN 'administrators'::public.policy_audience_scope THEN
          public.membership_role_rank(m.role::text)
            >= public.membership_role_rank('administrator')
        ELSE false
      END
    );
END;
$$;

REVOKE ALL ON FUNCTION public.policy_acknowledgment_audience_memberships(uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.policy_acknowledgment_audience_memberships(uuid)
  TO authenticated, service_role;

-- Managers assign acknowledgment rows for the current published version.
CREATE OR REPLACE FUNCTION public.assign_policy_acknowledgments(p_document_id uuid)
RETURNS TABLE (
  assigned_user_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d public.policy_documents%ROWTYPE;
  due_days integer;
  due_at timestamptz;
BEGIN
  SELECT * INTO d FROM public.policy_documents WHERE id = p_document_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VALIDATION: policy document not found';
  END IF;

  IF NOT public.can_manage_policy_documents(d.church_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: cannot assign policy acknowledgments';
  END IF;

  IF d.status <> 'published'::public.policy_document_status THEN
    RAISE EXCEPTION 'VALIDATION: acknowledgments require a published policy';
  END IF;

  IF NOT d.requires_acknowledgment THEN
    RETURN;
  END IF;

  IF d.current_version_id IS NULL THEN
    RAISE EXCEPTION 'VALIDATION: published policy has no current version';
  END IF;

  due_days := coalesce(d.acknowledgment_due_days, 14);
  due_at := now() + make_interval(days => due_days);

  RETURN QUERY
  WITH audience AS (
    SELECT membership_id, user_id
    FROM public.policy_acknowledgment_audience_memberships(p_document_id)
  ),
  inserted AS (
    INSERT INTO public.policy_acknowledgments (
      church_id,
      policy_document_id,
      policy_version_id,
      user_id,
      membership_id,
      acknowledgment_status,
      assigned_at,
      due_at
    )
    SELECT
      d.church_id,
      d.id,
      d.current_version_id,
      a.user_id,
      a.membership_id,
      'assigned'::public.policy_acknowledgment_status,
      now(),
      due_at
    FROM audience a
    ON CONFLICT (policy_version_id, user_id) DO NOTHING
    RETURNING user_id
  )
  SELECT inserted.user_id FROM inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_policy_acknowledgments(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_policy_acknowledgments(uuid)
  TO authenticated, service_role;

-- Eligible members can create their own acknowledgment row if missing.
CREATE OR REPLACE FUNCTION public.ensure_my_policy_acknowledgment(p_document_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d public.policy_documents%ROWTYPE;
  v_membership_id uuid;
  v_ack_id uuid;
  due_days integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: authentication required';
  END IF;

  SELECT * INTO d FROM public.policy_documents WHERE id = p_document_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF NOT public.can_view_policy_document(p_document_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: cannot view this policy';
  END IF;

  IF d.status <> 'published'::public.policy_document_status
    OR NOT d.requires_acknowledgment
    OR d.current_version_id IS NULL
  THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.policy_acknowledgment_audience_memberships(p_document_id) a
    WHERE a.user_id = auth.uid()
  ) THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_ack_id
  FROM public.policy_acknowledgments
  WHERE policy_version_id = d.current_version_id
    AND user_id = auth.uid();

  IF v_ack_id IS NOT NULL THEN
    RETURN v_ack_id;
  END IF;

  SELECT membership_id INTO v_membership_id
  FROM public.policy_acknowledgment_audience_memberships(p_document_id)
  WHERE user_id = auth.uid()
  LIMIT 1;

  due_days := coalesce(d.acknowledgment_due_days, 14);

  INSERT INTO public.policy_acknowledgments (
    church_id,
    policy_document_id,
    policy_version_id,
    user_id,
    membership_id,
    acknowledgment_status,
    assigned_at,
    due_at
  )
  VALUES (
    d.church_id,
    d.id,
    d.current_version_id,
    auth.uid(),
    v_membership_id,
    'assigned'::public.policy_acknowledgment_status,
    now(),
    now() + make_interval(days => due_days)
  )
  ON CONFLICT (policy_version_id, user_id) DO UPDATE
    SET updated_at = now()
  RETURNING id INTO v_ack_id;

  RETURN v_ack_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_my_policy_acknowledgment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_my_policy_acknowledgment(uuid)
  TO authenticated, service_role;

-- System email templates for policy notifications (church_id NULL = global defaults).
INSERT INTO public.notification_templates (
  church_id,
  template_key,
  name,
  description,
  channel,
  subject_template,
  body_text_template,
  body_html_template,
  severity,
  is_system_template,
  is_active,
  version,
  allowed_variables
)
SELECT *
FROM (
  VALUES
    (
      NULL::uuid,
      'policy.published',
      'Policy published',
      'Sent when a policy or procedure is published',
      'email',
      '[{{church_name}}] Policy published: {{policy_title}}',
      E'Hello {{recipient_name}},\n\nA policy has been published at {{church_name}}.\n\nTitle: {{policy_title}}\nVersion: {{policy_version}}\n\nReview it in Sanctuary Protected:\n{{action_url}}\n\nDo not reply to this email.',
      '<p>Hello {{recipient_name}},</p><p>A policy has been published at <strong>{{church_name}}</strong>.</p><p><strong>Title:</strong> {{policy_title}}<br/><strong>Version:</strong> {{policy_version}}</p><p><a href="{{action_url}}">Review in Sanctuary Protected</a></p><p>Do not reply to this email.</p>',
      'medium',
      true,
      true,
      1,
      ARRAY['church_name','recipient_name','policy_title','policy_version','action_url']::text[]
    ),
    (
      NULL::uuid,
      'policy.acknowledgment_required',
      'Policy acknowledgment required',
      'Sent when a member must acknowledge a published policy',
      'email',
      '[{{church_name}}] Please acknowledge: {{policy_title}}',
      E'Hello {{recipient_name}},\n\nYou are required to acknowledge a policy at {{church_name}}.\n\nTitle: {{policy_title}}\nDue: {{acknowledgment_due}}\n\nOpen the policy and confirm you have reviewed it:\n{{action_url}}\n\nDo not reply to this email.',
      '<p>Hello {{recipient_name}},</p><p>You are required to acknowledge a policy at <strong>{{church_name}}</strong>.</p><p><strong>Title:</strong> {{policy_title}}<br/><strong>Due:</strong> {{acknowledgment_due}}</p><p><a href="{{action_url}}">Open the policy and acknowledge</a></p><p>Do not reply to this email.</p>',
      'high',
      true,
      true,
      1,
      ARRAY['church_name','recipient_name','policy_title','policy_version','acknowledgment_due','action_url']::text[]
    )
) AS v(
  church_id,
  template_key,
  name,
  description,
  channel,
  subject_template,
  body_text_template,
  body_html_template,
  severity,
  is_system_template,
  is_active,
  version,
  allowed_variables
)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.notification_templates t
  WHERE t.church_id IS NULL
    AND t.template_key = v.template_key
    AND t.channel = v.channel
);
