-- Phase 8: seed Help Center topic tree + starter published articles.
-- Idempotent: insert-if-absent by slug. Never updates existing rows
-- (platform-admin edits are preserved on re-run).
--
-- Use $helpbody$ / $helpsteps$ dollar-quotes (not $md$) so SQL editors that
-- treat $name as bind parameters do not break string quoting.

-- ---------------------------------------------------------------------------
-- Helpers (dropped at end of migration)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._seed_help_category(
  p_slug text,
  p_name text,
  p_description text,
  p_display_order integer,
  p_parent_slug text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_id uuid;
  v_parent_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.help_categories WHERE slug = p_slug;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  IF p_parent_slug IS NOT NULL THEN
    SELECT id INTO v_parent_id FROM public.help_categories WHERE slug = p_parent_slug;
    IF v_parent_id IS NULL THEN
      RAISE EXCEPTION 'Parent help category % not found', p_parent_slug;
    END IF;
  END IF;

  INSERT INTO public.help_categories (
    parent_category_id,
    name,
    slug,
    description,
    display_order,
    status
  )
  VALUES (
    v_parent_id,
    p_name,
    p_slug,
    p_description,
    p_display_order,
    'active'::public.help_category_status
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public._seed_help_published_article(
  p_category_slug text,
  p_slug text,
  p_title text,
  p_summary text,
  p_body text,
  p_article_type public.help_article_type,
  p_keywords text[],
  p_prerequisites text[],
  p_expected_result text,
  p_estimated_minutes integer,
  p_difficulty public.help_difficulty,
  p_is_featured boolean,
  p_display_order integer,
  p_support_cta_label text,
  p_support_cta_path text,
  p_feature_keys text[],
  p_steps jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_article_id uuid;
  v_category_id uuid;
  v_version_id uuid;
  v_step jsonb;
  v_step_num integer := 0;
  v_feature text;
  v_steps_snapshot jsonb := '[]'::jsonb;
BEGIN
  SELECT id INTO v_article_id FROM public.help_articles WHERE slug = p_slug;
  IF v_article_id IS NOT NULL THEN
    RETURN v_article_id;
  END IF;

  SELECT id INTO v_category_id
  FROM public.help_categories
  WHERE slug = p_category_slug;
  IF v_category_id IS NULL THEN
    RAISE EXCEPTION 'Help category % not found for article %', p_category_slug, p_slug;
  END IF;

  INSERT INTO public.help_articles (
    category_id,
    article_type,
    title,
    slug,
    summary,
    body_content,
    body_format,
    status,
    audience_scope,
    estimated_minutes,
    difficulty,
    is_featured,
    is_popular,
    display_order,
    search_keywords,
    prerequisites,
    expected_result,
    support_cta_label,
    support_cta_path
  )
  VALUES (
    v_category_id,
    p_article_type,
    p_title,
    p_slug,
    p_summary,
    p_body,
    'markdown'::public.help_body_format,
    'draft'::public.help_article_status,
    'all_authenticated'::public.help_audience_scope,
    p_estimated_minutes,
    p_difficulty,
    coalesce(p_is_featured, false),
    false,
    coalesce(p_display_order, 0),
    coalesce(p_keywords, '{}'::text[]),
    coalesce(p_prerequisites, '{}'::text[]),
    p_expected_result,
    p_support_cta_label,
    p_support_cta_path
  )
  RETURNING id INTO v_article_id;

  IF p_steps IS NOT NULL THEN
    FOR v_step IN SELECT * FROM jsonb_array_elements(p_steps)
    LOOP
      v_step_num := v_step_num + 1;
      INSERT INTO public.help_article_steps (
        article_id,
        version_id,
        step_number,
        title,
        instruction,
        expected_result,
        tip_text,
        warning_text,
        deep_link_path,
        deep_link_label,
        required_feature_key
      )
      VALUES (
        v_article_id,
        NULL,
        v_step_num,
        coalesce(v_step->>'title', 'Step ' || v_step_num),
        coalesce(v_step->>'instruction', ''),
        v_step->>'expected_result',
        v_step->>'tip_text',
        v_step->>'warning_text',
        v_step->>'deep_link_path',
        v_step->>'deep_link_label',
        v_step->>'required_feature_key'
      );

      v_steps_snapshot := v_steps_snapshot || jsonb_build_array(
        jsonb_build_object(
          'step_number', v_step_num,
          'title', coalesce(v_step->>'title', 'Step ' || v_step_num),
          'instruction', coalesce(v_step->>'instruction', ''),
          'expected_result', v_step->>'expected_result',
          'tip_text', v_step->>'tip_text',
          'warning_text', v_step->>'warning_text',
          'deep_link_path', v_step->>'deep_link_path',
          'deep_link_label', v_step->>'deep_link_label',
          'required_feature_key', v_step->>'required_feature_key'
        )
      );
    END LOOP;
  END IF;

  INSERT INTO public.help_article_versions (
    article_id,
    version_number,
    title,
    summary,
    body_content,
    body_format,
    article_type,
    audience_scope,
    estimated_minutes,
    difficulty,
    search_keywords,
    prerequisites,
    expected_result,
    steps_snapshot,
    change_summary
  )
  VALUES (
    v_article_id,
    1,
    p_title,
    p_summary,
    p_body,
    'markdown'::public.help_body_format,
    p_article_type,
    'all_authenticated'::public.help_audience_scope,
    p_estimated_minutes,
    p_difficulty,
    coalesce(p_keywords, '{}'::text[]),
    coalesce(p_prerequisites, '{}'::text[]),
    p_expected_result,
    v_steps_snapshot,
    'Initial seed content'
  )
  RETURNING id INTO v_version_id;

  v_step_num := 0;
  IF p_steps IS NOT NULL THEN
    FOR v_step IN SELECT * FROM jsonb_array_elements(p_steps)
    LOOP
      v_step_num := v_step_num + 1;
      INSERT INTO public.help_article_steps (
        article_id,
        version_id,
        step_number,
        title,
        instruction,
        expected_result,
        tip_text,
        warning_text,
        deep_link_path,
        deep_link_label,
        required_feature_key
      )
      VALUES (
        v_article_id,
        v_version_id,
        v_step_num,
        coalesce(v_step->>'title', 'Step ' || v_step_num),
        coalesce(v_step->>'instruction', ''),
        v_step->>'expected_result',
        v_step->>'tip_text',
        v_step->>'warning_text',
        v_step->>'deep_link_path',
        v_step->>'deep_link_label',
        v_step->>'required_feature_key'
      );
    END LOOP;
  END IF;

  UPDATE public.help_articles
  SET
    status = 'published'::public.help_article_status,
    published_version_id = v_version_id,
    published_version_number = 1,
    published_at = now(),
    updated_at = now()
  WHERE id = v_article_id;

  IF p_feature_keys IS NOT NULL THEN
    FOREACH v_feature IN ARRAY p_feature_keys
    LOOP
      INSERT INTO public.help_article_features (article_id, feature_key)
      VALUES (v_article_id, v_feature)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  PERFORM public.refresh_help_article_search(v_article_id);
  RETURN v_article_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public._seed_help_relation(
  p_source_slug text,
  p_target_slug text,
  p_type public.help_relation_type,
  p_display_order integer DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_source uuid;
  v_target uuid;
BEGIN
  SELECT id INTO v_source FROM public.help_articles WHERE slug = p_source_slug;
  SELECT id INTO v_target FROM public.help_articles WHERE slug = p_target_slug;
  IF v_source IS NULL OR v_target IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.help_article_relations (
    source_article_id,
    target_article_id,
    relationship_type,
    display_order
  )
  VALUES (v_source, v_target, p_type, p_display_order)
  ON CONFLICT DO NOTHING;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------

SELECT public._seed_help_category(
  'getting-started', 'Getting Started',
  'Welcome, setup, and first-week guidance.', 10
);
SELECT public._seed_help_category(
  'getting-started-first-week', 'First week',
  'Welcome and initial setup checklist.', 11, 'getting-started'
);
SELECT public._seed_help_category(
  'dashboard', 'Dashboard',
  'Home dashboard, threat level, and boxes.', 20
);
SELECT public._seed_help_category(
  'churches-campuses', 'Churches & Campuses',
  'Church settings and multi-campus management.', 30
);
SELECT public._seed_help_category(
  'members-teams', 'Members & Teams',
  'Invitations, roles, teams, and certifications.', 40
);
SELECT public._seed_help_category(
  'members-invitations', 'Invitations',
  'Invite and onboard church members.', 41, 'members-teams'
);
SELECT public._seed_help_category(
  'events-scheduling', 'Events & Scheduling',
  'Events, shifts, availability, and assignments.', 50
);
SELECT public._seed_help_category(
  'scheduling-events', 'Events',
  'Create and manage schedule events.', 51, 'events-scheduling'
);
SELECT public._seed_help_category(
  'scheduling-shifts', 'Shifts',
  'Create shifts and assign members.', 52, 'events-scheduling'
);
SELECT public._seed_help_category(
  'incidents', 'Incidents',
  'Logging incidents, photos, and analytics.', 60
);
SELECT public._seed_help_category(
  'notifications', 'Notifications',
  'Groups, email, SMS, and preferences.', 70
);
SELECT public._seed_help_category(
  'notification-groups', 'Groups',
  'Build groups for messaging.', 71, 'notifications'
);
SELECT public._seed_help_category(
  'notification-email', 'Email',
  'Send group email notifications.', 72, 'notifications'
);
SELECT public._seed_help_category(
  'medical-supplies', 'Medical Supplies',
  'Inventory and incident usage.', 80
);
SELECT public._seed_help_category(
  'security-hardware', 'Security Hardware',
  'Hardware inventory and maintenance.', 90
);
SELECT public._seed_help_category(
  'policies', 'Policies',
  'Policies and procedures library.', 100
);
SELECT public._seed_help_category(
  'known-safety-concerns', 'Known Safety Concerns',
  'Safety concern profiles and reviews.', 110
);
SELECT public._seed_help_category(
  'cameras-sensors', 'Cameras & Sensors',
  'Cameras, sensors, and alarms.', 120
);
SELECT public._seed_help_category(
  'reports', 'Reports',
  'Analytics and reporting.', 130
);
SELECT public._seed_help_category(
  'subscription-billing', 'Subscription & Billing',
  'Plans, entitlements, and billing.', 140
);
SELECT public._seed_help_category(
  'account-security', 'Account & Security',
  'Profile, MFA, and account settings.', 150
);
SELECT public._seed_help_category(
  'troubleshooting', 'Troubleshooting',
  'Common problems and fixes.', 160
);

-- ---------------------------------------------------------------------------
-- Articles
-- ---------------------------------------------------------------------------

SELECT public._seed_help_published_article(
  'getting-started-first-week',
  'welcome-to-sanctuary-protected',
  'Welcome to Sanctuary Protected',
  'Learn what Sanctuary Protected is and how the Help Center guides your team.',
  $helpbody$
Sanctuary Protected helps churches coordinate safety and security work in one place.

Use this Help Center to learn common workflows. Articles are available on every subscription tier. Some features inside the product may require a higher plan - those articles show a plan notice when relevant.

## What you can do here
- Browse topics in the left tree
- Search by title, keywords, or step text
- Follow ordered how-to steps with deep links into the app

## Tips
- Start with the Initial setup checklist
- Bookmark articles your team uses every week
- Use article feedback when something is unclear
$helpbody$,
  'overview'::public.help_article_type,
  ARRAY['welcome', 'getting started', 'help center', 'overview'],
  ARRAY[]::text[],
  'You understand where Help lives and how to find your next article.',
  3,
  'beginner'::public.help_difficulty,
  true,
  10,
  'Open Help Center',
  '/help',
  ARRAY[]::text[],
  $helpsteps$[
    {"title":"Open the Help Center","instruction":"From the left navigation under Account, open Help Center.","deep_link_path":"/help","deep_link_label":"Go to Help","expected_result":"The Help landing page loads with search and topics."},
    {"title":"Try search","instruction":"Type a keyword such as incident or schedule into the Help search box.","deep_link_path":"/help/search","deep_link_label":"Search Help","expected_result":"Matching published articles appear."}
  ]$helpsteps$::jsonb
);

SELECT public._seed_help_published_article(
  'getting-started-first-week',
  'initial-setup-checklist',
  'Initial setup checklist',
  'A recommended first-week sequence for a new church workspace.',
  $helpbody$
Complete these setup steps early so your team can invite members, schedule coverage, and log incidents confidently.

Work through the linked articles in order. You can pause and return later - progress is not tracked automatically.
$helpbody$,
  'workflow'::public.help_article_type,
  ARRAY['setup', 'checklist', 'onboarding', 'first week'],
  ARRAY['An owner or administrator account for your church'],
  'Core church setup tasks are complete and your team can begin weekly operations.',
  15,
  'beginner'::public.help_difficulty,
  true,
  20,
  'Open Dashboard',
  '/dashboard',
  ARRAY[]::text[],
  $helpsteps$[
    {"title":"Confirm church context","instruction":"Open the dashboard and confirm you are in the correct church workspace.","deep_link_path":"/dashboard","deep_link_label":"Open dashboard","expected_result":"Dashboard loads for your active church."},
    {"title":"Invite teammates","instruction":"Follow the member invitation article to add owners, admins, and security team members.","deep_link_path":"/team/invite","deep_link_label":"Invite members","expected_result":"Invitations are sent or members are added."},
    {"title":"Create your first event and shifts","instruction":"Use Events and Scheduling help to create an event, add shifts, and assign coverage.","deep_link_path":"/schedule/events","deep_link_label":"Open events","expected_result":"At least one event with shifts exists."},
    {"title":"Review incident logging","instruction":"Read how to log a security incident so responders know the workflow before you need it.","deep_link_path":"/incidents","deep_link_label":"Open incidents","expected_result":"Your team knows where to log incidents."}
  ]$helpsteps$::jsonb
);

SELECT public._seed_help_published_article(
  'members-invitations',
  'invite-church-members',
  'Invite church members',
  'Add teammates to your church with the correct role.',
  $helpbody$
Invitations let new people join your church workspace with a role such as viewer, member, security leader, admin, or owner.

Only users with permission to manage the team can send invitations.
$helpbody$,
  'how_to'::public.help_article_type,
  ARRAY['invite', 'members', 'team', 'roles'],
  ARRAY['Permission to manage team members'],
  'The invitee receives an invitation and can join the church with the assigned role.',
  5,
  'beginner'::public.help_difficulty,
  false,
  10,
  'Invite a member',
  '/team/invite',
  ARRAY[]::text[],
  $helpsteps$[
    {"title":"Open Team invite","instruction":"Go to Team and choose Invite (or Add) for a new member.","deep_link_path":"/team/invite","deep_link_label":"Invite member","expected_result":"The invitation form opens."},
    {"title":"Enter email and role","instruction":"Provide the person email address and choose the appropriate church role.","expected_result":"Form fields are complete and valid."},
    {"title":"Send the invitation","instruction":"Submit the form. Ask the invitee to accept from their email or invitation link.","expected_result":"Invitation is recorded and the member can join when they accept."}
  ]$helpsteps$::jsonb
);

SELECT public._seed_help_published_article(
  'scheduling-events',
  'create-an-event',
  'Create an event',
  'Create a schedule event that can hold shifts for your security team.',
  $helpbody$
Events organize coverage for services, rehearsals, or special gatherings. After you create an event, add shifts and assign members.

Team scheduling may require a plan that includes scheduling.
$helpbody$,
  'how_to'::public.help_article_type,
  ARRAY['event', 'schedule', 'calendar', 'create event'],
  ARRAY['Team scheduling access for your role and plan'],
  'A new schedule event exists and is ready for shifts.',
  6,
  'beginner'::public.help_difficulty,
  false,
  10,
  'Create event',
  '/schedule/events/new',
  ARRAY['scheduling.team.enabled'],
  $helpsteps$[
    {"title":"Open schedule events","instruction":"From Scheduling, open Events.","deep_link_path":"/schedule/events","deep_link_label":"Events list","expected_result":"You see existing events or an empty list.","required_feature_key":"scheduling.team.enabled"},
    {"title":"Start a new event","instruction":"Choose New event and enter name, campus (if used), date/time, and details.","deep_link_path":"/schedule/events/new","deep_link_label":"New event","expected_result":"Event details are saved.","required_feature_key":"scheduling.team.enabled"},
    {"title":"Review on the calendar","instruction":"Open the schedule calendar to confirm the event appears on the correct day.","deep_link_path":"/schedule/calendar","deep_link_label":"Calendar","expected_result":"Event is visible on the calendar."}
  ]$helpsteps$::jsonb
);

SELECT public._seed_help_published_article(
  'scheduling-shifts',
  'create-a-shift',
  'Create a shift',
  'Add a shift to an event so you can define coverage needs.',
  $helpbody$
Shifts describe who is needed, when, and for which role or area. Create shifts on an existing event, then assign members.
$helpbody$,
  'how_to'::public.help_article_type,
  ARRAY['shift', 'schedule', 'coverage', 'create shift'],
  ARRAY['An existing schedule event', 'Team scheduling access'],
  'The event has at least one shift ready for assignment.',
  6,
  'beginner'::public.help_difficulty,
  false,
  20,
  'Open shifts',
  '/schedule/shifts',
  ARRAY['scheduling.team.enabled'],
  $helpsteps$[
    {"title":"Open the event","instruction":"Open the event that needs coverage.","deep_link_path":"/schedule/events","deep_link_label":"Events","expected_result":"Event detail page loads.","required_feature_key":"scheduling.team.enabled"},
    {"title":"Add a shift","instruction":"Create a shift with start/end times, needed headcount, and any notes.","deep_link_path":"/schedule/shifts/new","deep_link_label":"New shift","expected_result":"Shift is saved on the event.","required_feature_key":"scheduling.team.enabled"},
    {"title":"Confirm staffing status","instruction":"Check that the shift shows as unfilled until members are assigned.","expected_result":"Shift status reflects open coverage needs."}
  ]$helpsteps$::jsonb
);

SELECT public._seed_help_published_article(
  'scheduling-shifts',
  'assign-members-to-shifts',
  'Assign members to shifts',
  'Assign teammates to open shifts and track accept/decline responses.',
  $helpbody$
Assignments connect people to shifts. Members may accept or decline depending on your church settings. Conflicts are surfaced when someone is already booked.
$helpbody$,
  'how_to'::public.help_article_type,
  ARRAY['assign', 'shift assignment', 'schedule', 'coverage'],
  ARRAY['At least one open shift', 'Permission to assign schedule members'],
  'Members are assigned to the shift and can respond as configured.',
  8,
  'intermediate'::public.help_difficulty,
  false,
  30,
  'Open shifts',
  '/schedule/shifts',
  ARRAY['scheduling.team.enabled'],
  $helpsteps$[
    {"title":"Open the shift","instruction":"Open the shift that needs coverage.","deep_link_path":"/schedule/shifts","deep_link_label":"Shifts","expected_result":"Shift detail shows current assignments.","required_feature_key":"scheduling.team.enabled"},
    {"title":"Assign members","instruction":"Add one or more eligible members to the shift. Resolve any conflict warnings before saving.","expected_result":"Assignments are listed on the shift."},
    {"title":"Notify assignees","instruction":"Use schedule notifications if your process includes emailing assignees about the new assignment.","deep_link_path":"/schedule/notifications","deep_link_label":"Schedule notifications","expected_result":"Assignees are informed according to your workflow."}
  ]$helpsteps$::jsonb
);

SELECT public._seed_help_published_article(
  'incidents',
  'log-a-security-incident',
  'Log a security incident',
  'Record what happened, when, and who was involved so your church has a durable security record.',
  $helpbody$
Incident logging captures safety and security events for follow-up and reporting. Photos and advanced analytics may depend on your plan.
$helpbody$,
  'how_to'::public.help_article_type,
  ARRAY['incident', 'log incident', 'security', 'report'],
  ARRAY['Permission to create incidents'],
  'A new incident record is saved with the essential details.',
  7,
  'beginner'::public.help_difficulty,
  true,
  10,
  'Log incident',
  '/incidents/new',
  ARRAY['incidents.logging.enabled'],
  $helpsteps$[
    {"title":"Open Incidents","instruction":"From the left navigation, open Incidents.","deep_link_path":"/incidents","deep_link_label":"Incidents","expected_result":"Incident list loads.","required_feature_key":"incidents.logging.enabled"},
    {"title":"Start a new incident","instruction":"Choose New incident and enter what happened, location/campus, time, and severity as appropriate.","deep_link_path":"/incidents/new","deep_link_label":"New incident","expected_result":"Required fields are complete."},
    {"title":"Save the incident","instruction":"Submit the form. Add photos later if your plan includes incident photos.","expected_result":"Incident detail page shows the saved record."}
  ]$helpsteps$::jsonb
);

SELECT public._seed_help_published_article(
  'notification-groups',
  'create-a-notification-group',
  'Create a notification group',
  'Build a reusable group of people for email or other notifications.',
  $helpbody$
Notification groups make it easier to message the right set of people - for example security leaders or medical responders - without picking names every time.
$helpbody$,
  'how_to'::public.help_article_type,
  ARRAY['notification group', 'messaging', 'group', 'recipients'],
  ARRAY['Permission to manage notification groups'],
  'A notification group exists with the intended members.',
  5,
  'beginner'::public.help_difficulty,
  false,
  10,
  'Notification groups',
  '/notification-groups',
  ARRAY[]::text[],
  $helpsteps$[
    {"title":"Open notification groups","instruction":"Go to Notification groups.","deep_link_path":"/notification-groups","deep_link_label":"Groups","expected_result":"Group list loads."},
    {"title":"Create a group","instruction":"Choose New group, name it clearly, and add members.","deep_link_path":"/notification-groups/new","deep_link_label":"New group","expected_result":"Group is saved with members."},
    {"title":"Review membership","instruction":"Open the group and confirm the membership list is correct.","expected_result":"Intended recipients are listed."}
  ]$helpsteps$::jsonb
);

SELECT public._seed_help_published_article(
  'notification-email',
  'send-a-group-email',
  'Send a group email',
  'Send an email notification to a notification group or selected recipients.',
  $helpbody$
Group email helps you reach a prepared audience quickly. Delivery depends on your church email configuration and plan entitlements for group messaging.
$helpbody$,
  'how_to'::public.help_article_type,
  ARRAY['group email', 'notification', 'email', 'message'],
  ARRAY['A notification group or recipients', 'Group email entitlement on your plan'],
  'An email notification is composed and submitted for delivery.',
  6,
  'beginner'::public.help_difficulty,
  false,
  20,
  'New notification',
  '/notifications/new',
  ARRAY['messaging.group_email.enabled'],
  $helpsteps$[
    {"title":"Open Notifications","instruction":"Go to Notifications and start a new message.","deep_link_path":"/notifications/new","deep_link_label":"New notification","expected_result":"Composer opens.","required_feature_key":"messaging.group_email.enabled"},
    {"title":"Choose recipients","instruction":"Select a notification group or individual recipients.","deep_link_path":"/notification-groups","deep_link_label":"Groups","expected_result":"Recipient set is selected."},
    {"title":"Write and send","instruction":"Enter subject and body, review, then send.","expected_result":"Notification is queued or sent according to your email provider setup."}
  ]$helpsteps$::jsonb
);

SELECT public._seed_help_published_article(
  'subscription-billing',
  'subscription-plans-overview',
  'Subscription plans overview',
  'Understand Sanctuary Protected plans and where to review your church subscription.',
  $helpbody$
Sanctuary Protected uses subscription plans with feature entitlements. The Help Center itself is available on every tier.

Plan names are informational - access inside the product is controlled by feature keys, not by hard-coding plan names in workflows.

Owners can review billing and plan details under church settings. Platform operators can adjust church subscriptions from the platform console when needed.
$helpbody$,
  'overview'::public.help_article_type,
  ARRAY['subscription', 'billing', 'plans', 'entitlements', 'upgrade'],
  ARRAY[]::text[],
  'You know where to review your plan and that Help remains available on all tiers.',
  4,
  'beginner'::public.help_difficulty,
  false,
  10,
  'Billing settings',
  '/settings/billing',
  ARRAY[]::text[],
  $helpsteps$[
    {"title":"Open billing settings","instruction":"If you are a church owner or co-owner, open Settings, then Billing.","deep_link_path":"/settings/billing","deep_link_label":"Billing","expected_result":"Current plan and billing status are visible."},
    {"title":"Compare feature needs","instruction":"When an article mentions a feature your plan lacks, use the plan notice as a guide, then discuss upgrades with an owner.","expected_result":"You can identify which capabilities may require a different plan."}
  ]$helpsteps$::jsonb
);

SELECT public._seed_help_published_article(
  'troubleshooting',
  'get-help-and-support',
  'Get help and support',
  'What to do when you are stuck, missing access, or need product guidance.',
  $helpbody$
Start with Help Center search. If you still need assistance:

1. Confirm you are in the correct church workspace
2. Confirm your role has permission for the action
3. Confirm your plan includes the feature (see plan notices on articles)
4. Contact your church administrator
5. Church administrators can escalate to Sanctuary Protected support through your church support channel

Never share passwords, MFA codes, API keys, or confidential incident details in public channels.
$helpbody$,
  'faq'::public.help_article_type,
  ARRAY['support', 'help', 'troubleshoot', 'contact', 'access'],
  ARRAY[]::text[],
  'You know how to self-serve in Help and when to escalate inside your church.',
  3,
  'beginner'::public.help_difficulty,
  false,
  10,
  'Back to Help',
  '/help',
  ARRAY[]::text[],
  $helpsteps$[
    {"title":"Search Help first","instruction":"Search for the screen or task name before escalating.","deep_link_path":"/help/search","deep_link_label":"Search Help","expected_result":"You either find an article or confirm none matches."},
    {"title":"Check profile and church","instruction":"Open your profile and confirm the active church is correct.","deep_link_path":"/profile","deep_link_label":"Profile","expected_result":"You are signed in to the expected church."},
    {"title":"Escalate appropriately","instruction":"Contact a church admin for role or plan issues. Admins escalate to platform support through your church process.","expected_result":"The right person receives enough context to help without sharing secrets."}
  ]$helpsteps$::jsonb
);

-- ---------------------------------------------------------------------------
-- Relations (setup sequence + related links)
-- ---------------------------------------------------------------------------

SELECT public._seed_help_relation(
  'welcome-to-sanctuary-protected', 'initial-setup-checklist',
  'next_step'::public.help_relation_type, 1
);
SELECT public._seed_help_relation(
  'initial-setup-checklist', 'invite-church-members',
  'next_step'::public.help_relation_type, 1
);
SELECT public._seed_help_relation(
  'invite-church-members', 'create-an-event',
  'next_step'::public.help_relation_type, 1
);
SELECT public._seed_help_relation(
  'create-an-event', 'create-a-shift',
  'next_step'::public.help_relation_type, 1
);
SELECT public._seed_help_relation(
  'create-a-shift', 'assign-members-to-shifts',
  'next_step'::public.help_relation_type, 1
);
SELECT public._seed_help_relation(
  'initial-setup-checklist', 'log-a-security-incident',
  'related'::public.help_relation_type, 2
);
SELECT public._seed_help_relation(
  'create-a-notification-group', 'send-a-group-email',
  'next_step'::public.help_relation_type, 1
);
SELECT public._seed_help_relation(
  'send-a-group-email', 'create-a-notification-group',
  'prerequisite'::public.help_relation_type, 1
);
SELECT public._seed_help_relation(
  'welcome-to-sanctuary-protected', 'subscription-plans-overview',
  'related'::public.help_relation_type, 2
);
SELECT public._seed_help_relation(
  'welcome-to-sanctuary-protected', 'get-help-and-support',
  'related'::public.help_relation_type, 3
);
SELECT public._seed_help_relation(
  'log-a-security-incident', 'get-help-and-support',
  'related'::public.help_relation_type, 9
);

-- ---------------------------------------------------------------------------
-- Cleanup helpers (content remains)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public._seed_help_relation(text, text, public.help_relation_type, integer);
DROP FUNCTION IF EXISTS public._seed_help_published_article(
  text, text, text, text, text, public.help_article_type, text[], text[], text,
  integer, public.help_difficulty, boolean, integer, text, text, text[], jsonb
);
DROP FUNCTION IF EXISTS public._seed_help_category(text, text, text, integer, text);
