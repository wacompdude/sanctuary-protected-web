-- Help Center content expansion against the current application.
-- Upserts product-owned article slugs (updates 054 seed articles and inserts new ones).
-- Custom articles with other slugs are left unchanged.
-- Idempotent: re-run publishes a new version of these slugs.

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
  IF p_parent_slug IS NOT NULL THEN
    SELECT id INTO v_parent_id FROM public.help_categories WHERE slug = p_parent_slug;
    IF v_parent_id IS NULL THEN
      RAISE EXCEPTION 'Parent help category % not found', p_parent_slug;
    END IF;
  END IF;

  SELECT id INTO v_id FROM public.help_categories WHERE slug = p_slug;
  IF v_id IS NOT NULL THEN
    UPDATE public.help_categories
    SET
      name = p_name,
      description = p_description,
      display_order = p_display_order,
      parent_category_id = v_parent_id,
      status = 'active'::public.help_category_status,
      archived_at = NULL,
      updated_at = now()
    WHERE id = v_id;
    RETURN v_id;
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

CREATE OR REPLACE FUNCTION public._upsert_help_published_article(
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
  v_version_number integer;
  v_step jsonb;
  v_step_num integer := 0;
  v_feature text;
  v_steps_snapshot jsonb := '[]'::jsonb;
BEGIN
  SELECT id INTO v_category_id
  FROM public.help_categories
  WHERE slug = p_category_slug;
  IF v_category_id IS NULL THEN
    RAISE EXCEPTION 'Help category % not found for article %', p_category_slug, p_slug;
  END IF;

  SELECT id INTO v_article_id FROM public.help_articles WHERE slug = p_slug;

  IF v_article_id IS NULL THEN
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
  ELSE
    UPDATE public.help_articles
    SET
      category_id = v_category_id,
      article_type = p_article_type,
      title = p_title,
      summary = p_summary,
      body_content = p_body,
      estimated_minutes = p_estimated_minutes,
      difficulty = p_difficulty,
      is_featured = coalesce(p_is_featured, false),
      display_order = coalesce(p_display_order, 0),
      search_keywords = coalesce(p_keywords, '{}'::text[]),
      prerequisites = coalesce(p_prerequisites, '{}'::text[]),
      expected_result = p_expected_result,
      support_cta_label = p_support_cta_label,
      support_cta_path = p_support_cta_path,
      last_reviewed_at = now(),
      updated_at = now()
    WHERE id = v_article_id;

    DELETE FROM public.help_article_steps
    WHERE article_id = v_article_id AND version_id IS NULL;

    DELETE FROM public.help_article_features
    WHERE article_id = v_article_id;
  END IF;

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

  SELECT coalesce(max(version_number), 0) + 1
  INTO v_version_number
  FROM public.help_article_versions
  WHERE article_id = v_article_id;

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
    v_version_number,
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
    'Product Help update (migration 086)'
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
    published_version_number = v_version_number,
    published_at = now(),
    last_reviewed_at = now(),
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
-- Categories (existing + new; names/descriptions stay current)
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
  'Home dashboard, threat level, and summary boxes.', 20
);
SELECT public._seed_help_category(
  'churches-campuses', 'Churches & Campuses',
  'Church settings and campus management.', 30
);
SELECT public._seed_help_category(
  'church-settings', 'Church settings',
  'Church name, contact details, time zone, and URL Name.', 31, 'churches-campuses'
);
SELECT public._seed_help_category(
  'campuses', 'Campuses',
  'Create campuses, assign members, and delegate management.', 32, 'churches-campuses'
);
SELECT public._seed_help_category(
  'members-teams', 'Members & Teams',
  'Invitations, church roles, teams, and certifications.', 40
);
SELECT public._seed_help_category(
  'members-invitations', 'Invitations',
  'Invite and onboard church members.', 41, 'members-teams'
);
SELECT public._seed_help_category(
  'security-permissions', 'Security & Permissions',
  'Church roles, groups, temporary access, and permissions.', 45
);
SELECT public._seed_help_category(
  'security-roles', 'Church Roles',
  'Role templates such as Owner, Administrator, and Security Leader.', 46, 'security-permissions'
);
SELECT public._seed_help_category(
  'security-groups', 'Groups',
  'Permission groups, members, and campus-scoped access.', 47, 'security-permissions'
);
SELECT public._seed_help_category(
  'training', 'Training',
  'Training events, records, required training, and reports.', 48
);
SELECT public._seed_help_category(
  'training-events', 'Events and records',
  'Create training events and record attendance.', 49, 'training'
);
SELECT public._seed_help_category(
  'training-certifications', 'Certifications',
  'Member certifications and expiration dates.', 50, 'training'
);
SELECT public._seed_help_category(
  'events-scheduling', 'Events & Scheduling',
  'Events, shifts, availability, and assignments.', 55
);
SELECT public._seed_help_category(
  'scheduling-events', 'Events',
  'Create and manage schedule events.', 56, 'events-scheduling'
);
SELECT public._seed_help_category(
  'scheduling-shifts', 'Shifts',
  'Create shifts and assign members.', 57, 'events-scheduling'
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
  'Plans, billing, and why some features stay locked.', 140
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
-- Updated original articles
-- ---------------------------------------------------------------------------

SELECT public._upsert_help_published_article(
  'getting-started-first-week',
  'welcome-to-sanctuary-protected',
  'Welcome to Sanctuary Protected',
  'Learn what Sanctuary Protected is and how the Help Center guides your team.',
  $helpbody$
Sanctuary Protected helps churches coordinate safety and security work in one place.

Use this Help Center to learn common workflows. Articles are available on every subscription plan. Some features in the product may require a higher plan — those articles show a plan notice when relevant.

## Who can use this
Every signed-in church member can open Help Center, including on a phone or tablet.

## How to access
From the left navigation, open **Account**, then **Help Center**. On a phone, open the menu first, then choose Help Center.

## Tips
- Start with the Initial setup checklist
- Search by everyday words such as time zone, training, or URL name
- Use article feedback when something is unclear
$helpbody$,
  'overview'::public.help_article_type,
  ARRAY['welcome', 'getting started', 'help center', 'overview', 'light mode', 'dark mode'],
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
    {"title":"Open the Help Center","instruction":"From the left navigation under Account, open Help Center. On a phone, tap the menu first.","deep_link_path":"/help","deep_link_label":"Go to Help","expected_result":"The Help landing page loads with search and topics."},
    {"title":"Try search","instruction":"Type a keyword such as incident, time zone, or security role into the Help search box.","deep_link_path":"/help/search","deep_link_label":"Search Help","expected_result":"Matching published articles appear."}
  ]$helpsteps$::jsonb
);

SELECT public._upsert_help_published_article(
  'getting-started-first-week',
  'initial-setup-checklist',
  'Initial setup checklist',
  'A recommended first-week sequence for a new church workspace.',
  $helpbody$
Complete these setup steps early so your team can invite members, schedule coverage, and log incidents confidently.

Work through the linked articles in order. You can pause and return later — progress is not tracked automatically.

## Who can use this
Owners, co-owners, and administrators typically complete this list. Other members can still read it.

## How to access
Open **Help Center**, then this article. Use the Open page buttons on each step to jump into the app.
$helpbody$,
  'workflow'::public.help_article_type,
  ARRAY['setup', 'checklist', 'onboarding', 'first week', 'church settings', 'time zone'],
  ARRAY['An owner or administrator account for your church'],
  'Core church setup tasks are complete and your team can begin weekly operations.',
  20,
  'beginner'::public.help_difficulty,
  true,
  20,
  'Open Dashboard',
  '/dashboard',
  ARRAY[]::text[],
  $helpsteps$[
    {"title":"Confirm church context","instruction":"Open the dashboard and confirm you are in the correct church. Use Select church if you belong to more than one.","deep_link_path":"/dashboard","deep_link_label":"Open dashboard","expected_result":"Dashboard loads for your active church."},
    {"title":"Review church settings","instruction":"Open Settings, then Church. On General, confirm church name, URL Name (slug), and time zone. On Contact Information, confirm Primary email and Main phone number.","deep_link_path":"/settings/church/general","deep_link_label":"Church general settings","expected_result":"Church identity, time zone, and contact details look correct."},
    {"title":"Invite teammates","instruction":"Open Team, then Invite, to add owners, administrators, and security team members.","deep_link_path":"/team/invite","deep_link_label":"Invite members","expected_result":"Invitations are sent or members are added."},
    {"title":"Review campuses and security","instruction":"If you have more than one location, open Campuses. Then open Settings, then Security, to review Church Roles and Groups.","deep_link_path":"/settings/security","deep_link_label":"Security","expected_result":"You know where campus and access settings live."},
    {"title":"Create your first event and shifts","instruction":"Open Scheduling, then Events. Create an event, add Team Shifts, and assign coverage.","deep_link_path":"/schedule/events","deep_link_label":"Open events","expected_result":"At least one event with shifts exists."},
    {"title":"Review incident logging","instruction":"Read how to log a security incident so responders know the workflow before you need it.","deep_link_path":"/incidents","deep_link_label":"Open incidents","expected_result":"Your team knows where to log incidents."}
  ]$helpsteps$::jsonb
);

SELECT public._upsert_help_published_article(
  'members-invitations',
  'invite-church-members',
  'Invite church members',
  'Add teammates to your church with the correct church role.',
  $helpbody$
Invitations let new people join your church with a church role such as Viewer, Security member, Security leader, Administrator, or Co-owner.

## Who can use this
Owners, co-owners, and administrators can invite most roles. Security leaders can invite Security members and Viewers.

## How to access
Open **Team**, then **Invite**.

## Important notes
- Choose the role carefully. Owner is not invited this way.
- The invitation email uses your church name and the role label the person will receive.
- After they accept, you can still adjust access later in Settings > Security.
$helpbody$,
  'how_to'::public.help_article_type,
  ARRAY['invite', 'members', 'team', 'roles', 'co-owner', 'security member', 'administrator'],
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
    {"title":"Open Team invite","instruction":"From the left navigation, open Team, then Invite.","deep_link_path":"/team/invite","deep_link_label":"Invite member","expected_result":"The invitation form opens."},
    {"title":"Enter email and role","instruction":"Provide the person’s email address and choose the church role they should have.","expected_result":"Form fields are complete and valid."},
    {"title":"Send the invitation","instruction":"Submit the form. Ask the invitee to accept from their email.","expected_result":"Invitation is recorded and the member can join when they accept."}
  ]$helpsteps$::jsonb
);

SELECT public._upsert_help_published_article(
  'scheduling-events',
  'create-an-event',
  'Create an event',
  'Create a schedule event that can hold shifts for your security team.',
  $helpbody$
Events organize coverage for services, rehearsals, or special gatherings. After you create an event, add shifts and assign members.

## Who can use this
Members who can manage scheduling. Team scheduling must also be included in your church plan.

## How to access
Open **Scheduling**, then **Events**.

If Events appears locked in the menu, your plan does not include Team scheduling. See Why is a feature greyed out?
$helpbody$,
  'how_to'::public.help_article_type,
  ARRAY['event', 'schedule', 'calendar', 'create event', 'scheduling'],
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
    {"title":"Start a new event","instruction":"Choose New event and enter name, campus (if used), date and time, and details. Save with Create event.","deep_link_path":"/schedule/events/new","deep_link_label":"New event","expected_result":"Event details are saved.","required_feature_key":"scheduling.team.enabled"},
    {"title":"Review on the calendar","instruction":"Open Scheduling, then Calendar, to confirm the event appears on the correct day.","deep_link_path":"/schedule/calendar","deep_link_label":"Calendar","expected_result":"Event is visible on the calendar."}
  ]$helpsteps$::jsonb
);

SELECT public._upsert_help_published_article(
  'scheduling-shifts',
  'create-a-shift',
  'Create a shift',
  'Add a shift to an event so you can define coverage needs.',
  $helpbody$
Shifts describe who is needed, when, and for which role or area. Create shifts on an existing event, then assign members.

## How to access
Open **Scheduling**, then **Team Shifts**, or open an event and add a shift there.
$helpbody$,
  'how_to'::public.help_article_type,
  ARRAY['shift', 'schedule', 'coverage', 'create shift', 'team shifts'],
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
    {"title":"Open the event","instruction":"Open Scheduling, then Events, and open the event that needs coverage.","deep_link_path":"/schedule/events","deep_link_label":"Events","expected_result":"Event detail page loads.","required_feature_key":"scheduling.team.enabled"},
    {"title":"Add a shift","instruction":"Create a shift with start and end times, needed headcount, and any notes.","deep_link_path":"/schedule/shifts/new","deep_link_label":"New shift","expected_result":"Shift is saved on the event.","required_feature_key":"scheduling.team.enabled"},
    {"title":"Confirm staffing status","instruction":"Check that the shift shows as unfilled until members are assigned.","expected_result":"Shift status reflects open coverage needs."}
  ]$helpsteps$::jsonb
);

SELECT public._upsert_help_published_article(
  'scheduling-shifts',
  'assign-members-to-shifts',
  'Assign members to shifts',
  'Assign teammates to open shifts and track accept or decline responses.',
  $helpbody$
Assignments connect people to shifts. Members may accept or decline depending on your church settings. Conflicts are shown when someone is already booked.

## How to access
Open **Scheduling**, then **Team Shifts**, and open the shift that needs coverage.
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
    {"title":"Open the shift","instruction":"Open Scheduling, then Team Shifts, and open the shift that needs coverage.","deep_link_path":"/schedule/shifts","deep_link_label":"Team Shifts","expected_result":"Shift detail shows current assignments.","required_feature_key":"scheduling.team.enabled"},
    {"title":"Assign members","instruction":"Add one or more eligible members to the shift. Resolve any conflict warnings before saving.","expected_result":"Assignments are listed on the shift."},
    {"title":"Notify assignees","instruction":"Use Scheduling, then Notifications, if your process includes emailing assignees about the new assignment.","deep_link_path":"/schedule/notifications","deep_link_label":"Schedule notifications","expected_result":"Assignees are informed according to your workflow."}
  ]$helpsteps$::jsonb
);

SELECT public._upsert_help_published_article(
  'incidents',
  'log-a-security-incident',
  'Log a security incident',
  'Record what happened, when, and who was involved so your church has a durable security record.',
  $helpbody$
Incident logging captures safety and security events for follow-up and reporting.

## Who can use this
Members with permission to create incidents. Incident logging is included on typical church plans.

## How to access
Open **Incidents**, then start a new incident.

## Important notes
- Photos and incident analytics may require a higher plan. The plan notice on this article reflects your church.
- If Incidents is locked in the menu, see Why is a feature greyed out?
$helpbody$,
  'how_to'::public.help_article_type,
  ARRAY['incident', 'log incident', 'security', 'report', 'photos'],
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
    {"title":"Start a new incident","instruction":"Choose New incident and enter what happened, location or campus, time, and severity as appropriate.","deep_link_path":"/incidents/new","deep_link_label":"New incident","expected_result":"Required fields are complete."},
    {"title":"Save the incident","instruction":"Submit the form. Add photos later if your plan includes incident photos.","expected_result":"Incident detail page shows the saved record."}
  ]$helpsteps$::jsonb
);

SELECT public._upsert_help_published_article(
  'notification-groups',
  'create-a-notification-group',
  'Create a notification group',
  'Build a reusable group of people for email or other notifications.',
  $helpbody$
Notification groups make it easier to message the right set of people — for example security leaders or medical responders — without picking names every time.

## Who can use this
Security leaders and administrators typically manage groups.

## How to access
Open **Notifications**, then **Groups**.
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
    {"title":"Open notification groups","instruction":"Open Notifications, then Groups.","deep_link_path":"/notification-groups","deep_link_label":"Groups","expected_result":"Group list loads."},
    {"title":"Create a group","instruction":"Choose New group, name it clearly, and add members.","deep_link_path":"/notification-groups/new","deep_link_label":"New group","expected_result":"Group is saved with members."},
    {"title":"Review membership","instruction":"Open the group and confirm the membership list is correct.","expected_result":"Intended recipients are listed."}
  ]$helpsteps$::jsonb
);

SELECT public._upsert_help_published_article(
  'notification-email',
  'send-a-group-email',
  'Send a group email',
  'Send an email notification to a notification group or selected recipients.',
  $helpbody$
Group email helps you reach a prepared audience quickly. Delivery depends on your church email setup and whether group email is included in your plan.

## Who can use this
Security leaders and administrators can compose notifications.

## How to access
Open **Notifications**, then start a new message from **Compose notification**.

## Important notes
- Create a notification group first when you message the same people often.
- SMS is a separate capability and may require a higher plan.
$helpbody$,
  'how_to'::public.help_article_type,
  ARRAY['group email', 'notification', 'email', 'message', 'compose'],
  ARRAY['A notification group or recipients', 'Group email included on your plan'],
  'An email notification is composed and submitted for delivery.',
  6,
  'beginner'::public.help_difficulty,
  false,
  20,
  'Compose notification',
  '/notifications/new',
  ARRAY['messaging.group_email.enabled'],
  $helpsteps$[
    {"title":"Open Compose notification","instruction":"Go to Notifications and open Compose notification.","deep_link_path":"/notifications/new","deep_link_label":"Compose notification","expected_result":"Composer opens.","required_feature_key":"messaging.group_email.enabled"},
    {"title":"Choose recipients","instruction":"Select a notification group or individual recipients.","deep_link_path":"/notification-groups","deep_link_label":"Groups","expected_result":"Recipient set is selected."},
    {"title":"Write and send","instruction":"Enter subject and body, review, then send.","expected_result":"Notification is queued or sent according to your email provider setup."}
  ]$helpsteps$::jsonb
);

SELECT public._upsert_help_published_article(
  'subscription-billing',
  'subscription-plans-overview',
  'Subscription plans overview',
  'Understand Sanctuary Protected plans and where to review your church subscription.',
  $helpbody$
Sanctuary Protected uses subscription plans to decide which features your church can use. The four plan names you may see are **Servant Standard**, **Steward Pro**, **Shepherd Plus**, and **Omni Enterprise**.

The Help Center itself is available on every plan.

A plan notice at the top of some articles shows whether a feature is included for your church. That notice is based on your church’s current plan and feature list — it is the best place to see availability, rather than memorizing a chart.

## Who can use this
Anyone can read this article. Owners and co-owners can review Subscription and Billing.

## How to access
Open **Settings**, then **Subscription** to compare plans. Open **Settings**, then **Billing** for billing status.

## Important notes
- A higher church role does not unlock a feature that the plan does not include.
- Some menu items stay visible but locked so you can see what is available on a higher plan.
$helpbody$,
  'overview'::public.help_article_type,
  ARRAY['subscription', 'billing', 'plans', 'upgrade', 'servant standard', 'steward pro', 'shepherd plus', 'omni enterprise'],
  ARRAY[]::text[],
  'You know where to review your plan and that Help remains available on all tiers.',
  5,
  'beginner'::public.help_difficulty,
  false,
  10,
  'Subscription settings',
  '/settings/plans',
  ARRAY[]::text[],
  $helpsteps$[
    {"title":"Open Subscription","instruction":"If you can manage church settings, open Settings, then Subscription.","deep_link_path":"/settings/plans","deep_link_label":"Subscription","expected_result":"Current plan and feature comparison are visible."},
    {"title":"Open Billing if needed","instruction":"Owners and co-owners can open Settings, then Billing, for billing status.","deep_link_path":"/settings/billing","deep_link_label":"Billing","expected_result":"Billing status is visible."},
    {"title":"Compare feature needs","instruction":"When an article shows a plan notice, use it as a guide, then discuss upgrades with an owner.","expected_result":"You can identify which capabilities may require a different plan."}
  ]$helpsteps$::jsonb
);

SELECT public._upsert_help_published_article(
  'troubleshooting',
  'get-help-and-support',
  'Get help and support',
  'What to do when you are stuck, missing access, or need product guidance.',
  $helpbody$
Start with Help Center search. If you still need assistance, work through this checklist.

## Troubleshooting
1. Confirm you are in the correct church.
2. Confirm your church role allows the action (for example, only some roles can invite members).
3. Confirm the feature is included in your church plan. Locked menu items are a plan limit, not a missing permission.
4. Confirm any temporary access has not expired.
5. Contact your church administrator.
6. Church administrators can escalate to Sanctuary Protected support through your church support channel.

Never share passwords, verification codes, or confidential incident details in public channels.
$helpbody$,
  'faq'::public.help_article_type,
  ARRAY['support', 'help', 'troubleshoot', 'contact', 'access', 'permission expired', 'denied'],
  ARRAY[]::text[],
  'You know how to self-serve in Help and when to escalate inside your church.',
  4,
  'beginner'::public.help_difficulty,
  false,
  10,
  'Back to Help',
  '/help',
  ARRAY[]::text[],
  $helpsteps$[
    {"title":"Search Help first","instruction":"Search for the screen or task name before escalating.","deep_link_path":"/help/search","deep_link_label":"Search Help","expected_result":"You either find an article or confirm none matches."},
    {"title":"Check profile and church","instruction":"Open Profile and confirm the active church is correct.","deep_link_path":"/profile","deep_link_label":"Profile","expected_result":"You are signed in to the expected church."},
    {"title":"Escalate appropriately","instruction":"Contact a church admin for role or plan issues. Admins escalate to platform support through your church process.","expected_result":"The right person receives enough context to help without sharing secrets."}
  ]$helpsteps$::jsonb
);

-- ---------------------------------------------------------------------------
-- Church settings, campuses, security
-- ---------------------------------------------------------------------------

SELECT public._upsert_help_published_article(
  'church-settings',
  'church-settings-overview',
  'Church settings',
  'Find church name, contact details, time zone, URL Name, and related church settings.',
  $helpbody$
Church settings hold the identity of your church in Sanctuary Protected: name, contact details, time zone, branding, and account status.

## Who can use this
Security leaders and above can open Settings > Church. Editing most fields is limited to owners, co-owners, and administrators.

## How to access
Open **Settings**, then **Church**.

## What you will find
- **General** — church name, URL Name (slug), denomination, description, and time zone
- **Contact Information** — Primary email, Main phone number, website, and directory contacts
- **Branding** — logo and colors
- **Security and Emergency Information** — emergency contacts and incident requirements
- **Application Preferences** — date formats and landing page
- **Account Status** — plan and trial metadata
- **Danger Zone** — suspend, reactivate, or close the church account

## Creating another church
If you own more than one organization, open **Select church**, then **Create church**. You become the owner of the new church and can switch between churches anytime.
$helpbody$,
  'overview'::public.help_article_type,
  ARRAY['church settings', 'organization', 'general', 'create church', 'settings'],
  ARRAY[]::text[],
  'You can find church identity, contact, and time zone settings.',
  6,
  'beginner'::public.help_difficulty,
  true,
  10,
  'Open Church settings',
  '/settings/church',
  ARRAY[]::text[],
  $helpsteps$[
    {"title":"Open Church settings","instruction":"Open Settings, then Church.","deep_link_path":"/settings/church","deep_link_label":"Church settings","expected_result":"Church settings sections are listed."},
    {"title":"Open General","instruction":"Choose General to review church name, URL Name (slug), and time zone.","deep_link_path":"/settings/church/general","deep_link_label":"General","expected_result":"General settings are visible."}
  ]$helpsteps$::jsonb
);

SELECT public._upsert_help_published_article(
  'church-settings',
  'selecting-a-time-zone',
  'Selecting a time zone',
  'Choose a worldwide time zone for your church or campus by searching for a city or zone name.',
  $helpbody$
Sanctuary Protected stores a time zone for the church and, separately, for each campus. Times on schedules, incidents, training, notifications, and reports use that setting.

You can search by city or by time zone name. Global time zones are supported, not only the Americas. Daylight saving rules are applied automatically.

A technical identifier such as `America/Chicago` may appear as secondary information. You do not need to memorize it.

## Who can use this
People who can edit church General settings or campus settings.

## How to access
- Church: **Settings > Church > General**, then **Time zone**
- Campus: open a campus, then **Settings**, and choose the campus **Time zone**

## Important notes
- Changing the church time zone does not automatically change each campus. Set a campus time zone when that campus is in a different region.
- Temporary access dates are shown in the church time zone.
$helpbody$,
  'how_to'::public.help_article_type,
  ARRAY['time zone', 'timezone', 'daylight saving', 'DST', 'IANA', 'city search', 'worldwide'],
  ARRAY['Permission to edit church or campus settings'],
  'The church or campus uses the intended time zone for displayed times.',
  5,
  'beginner'::public.help_difficulty,
  false,
  20,
  'Church general settings',
  '/settings/church/general',
  ARRAY[]::text[],
  $helpsteps$[
    {"title":"Open General settings","instruction":"Open Settings, then Church, then General.","deep_link_path":"/settings/church/general","deep_link_label":"General","expected_result":"The Time zone field is visible."},
    {"title":"Search and select","instruction":"Open Time zone and type a city or zone name. Select the matching option. Save the form.","expected_result":"The selected time zone is saved."}
  ]$helpsteps$::jsonb
);

SELECT public._upsert_help_published_article(
  'church-settings',
  'understanding-url-names',
  'Understanding URL Names (slugs)',
  'What the URL Name (slug) is, how it is created, and when to change it.',
  $helpbody$
**URL Name (slug)** is a short, web-friendly identifier Sanctuary Protected uses for a church or campus. It is made of lowercase letters, numbers, and hyphens.

Church URL Names are unique across Sanctuary Protected. Campus URL Names are unique within your church.

Sanctuary Protected currently uses this identifier internally (and it may be used in future links or integrations). Your everyday church pages still use your signed-in church and campus records. Changing a URL Name does not break typical bookmarks to pages such as Campuses or Settings.

## Who can use this
People who can edit church General settings or campus settings.

## How to access
- Church: **Settings > Church > General**, field **URL Name (slug)**
- Campus: campus **Settings**, field **URL Name (slug)**

## Important notes
- A URL Name is generated from the church or campus name while you are still creating it. After you save, renaming the church or campus does not overwrite a URL Name you already set.
- Use **Generate from church name** or **Generate from campus name** if you want it rebuilt from the current name.
- If the name is already taken, you will be asked to choose another.
- You usually do not need to change it unless you want a clearer identifier.
$helpbody$,
  'reference'::public.help_article_type,
  ARRAY['slug', 'URL', 'web address', 'church URL', 'organization URL', 'identifier', 'campus URL'],
  ARRAY[]::text[],
  'You understand what URL Name (slug) means and when to leave it alone.',
  5,
  'beginner'::public.help_difficulty,
  false,
  30,
  'Church general settings',
  '/settings/church/general',
  ARRAY[]::text[],
  $helpsteps$[
    {"title":"Open the URL Name field","instruction":"Open Settings, then Church, then General, and find URL Name (slug). Use the information icon next to the label for a short reminder.","deep_link_path":"/settings/church/general","deep_link_label":"General","expected_result":"The URL Name field and help text are visible."}
  ]$helpsteps$::jsonb
);

SELECT public._upsert_help_published_article(
  'church-settings',
  'church-contact-information',
  'Church contact information',
  'Set the church Primary email and Main phone number used for administrative contact.',
  $helpbody$
**Primary email** is the church’s main administrative or business email. Use a shared church address when you can, rather than one person’s inbox.

**Main phone number** is the church’s main administrative or business phone. It may be a mobile number, office phone, or landline, and is typically not one person’s personal number.

## Who can use this
People who can edit church Contact Information.

## How to access
Open **Settings**, then **Church**, then **Contact Information**.
$helpbody$,
  'how_to'::public.help_article_type,
  ARRAY['primary email', 'phone', 'contact', 'church email', 'main phone'],
  ARRAY['Permission to edit church contact settings'],
  'Primary email and Main phone number are saved.',
  4,
  'beginner'::public.help_difficulty,
  false,
  40,
  'Contact Information',
  '/settings/church/contact',
  ARRAY[]::text[],
  $helpsteps$[
    {"title":"Open Contact Information","instruction":"Open Settings, then Church, then Contact Information.","deep_link_path":"/settings/church/contact","deep_link_label":"Contact Information","expected_result":"Primary email and Main phone number fields are visible."},
    {"title":"Save contact details","instruction":"Enter Primary email and Main phone number. Use the information icons for short reminders. Save the form.","expected_result":"Contact details are stored for the church."}
  ]$helpsteps$::jsonb
);

SELECT public._upsert_help_published_article(
  'campuses',
  'campuses-overview',
  'Campuses overview',
  'How campuses work, who can manage them, and where to find campus settings.',
  $helpbody$
A campus is a location your church operates, such as a main site or a second campus. Each campus can have its own time zone and URL Name (slug).

## Who can use this
Security members and above can usually open **Campuses**. Creating, editing, or deleting a campus is limited to **Owner**, **Co-owner**, and **Administrator**.

Those three roles have top-level campus-management authority. They can delegate some member-management work without giving someone full campus administration.

## How to access
Open **Campuses** in the Admin section of the left navigation.

## Important notes
- Adding extra campuses may require a plan that includes multi-campus management. If Add campus is locked, see Why is a feature greyed out?
- Not seeing a campus usually means you are not assigned to it, not that it was deleted.
$helpbody$,
  'overview'::public.help_article_type,
  ARRAY['campus', 'campuses', 'locations', 'multi-campus'],
  ARRAY[]::text[],
  'You know where campuses live and who can manage them.',
  5,
  'beginner'::public.help_difficulty,
  false,
  10,
  'Open Campuses',
  '/campuses',
  ARRAY['campuses.multiple.enabled'],
  $helpsteps$[
    {"title":"Open Campuses","instruction":"From the left navigation, open Campuses.","deep_link_path":"/campuses","deep_link_label":"Campuses","expected_result":"Your visible campuses are listed."}
  ]$helpsteps$::jsonb
);

SELECT public._upsert_help_published_article(
  'campuses',
  'create-a-campus',
  'Create a campus',
  'Add a campus with name, time zone, and URL Name.',
  $helpbody$
Use **Add campus** when your church has another location to manage.

## Who can use this
Only an **Owner**, **Co-owner**, or **Administrator** can add a campus. Your plan must also allow additional campuses.

## How to access
Open **Campuses**, then **Add campus**. The page title is **New campus**.

## Important notes
- Set the campus **Time zone** if this location is not in the same region as the church.
- **URL Name (slug)** is generated from the campus name and can be customized.
$helpbody$,
  'how_to'::public.help_article_type,
  ARRAY['create campus', 'add campus', 'new campus', 'campus time zone', 'campus slug'],
  ARRAY['Owner, Co-owner, or Administrator role', 'Plan allows additional campuses'],
  'A new campus exists and can receive members.',
  6,
  'beginner'::public.help_difficulty,
  false,
  20,
  'New campus',
  '/campuses/new',
  ARRAY['campuses.multiple.enabled'],
  $helpsteps$[
    {"title":"Open Campuses","instruction":"From Admin, open Campuses.","deep_link_path":"/campuses","deep_link_label":"Campuses","expected_result":"Campus list loads."},
    {"title":"Add a campus","instruction":"Choose Add campus. Enter the campus name, time zone, and URL Name (slug) if you want to customize it. Choose Create campus.","deep_link_path":"/campuses/new","deep_link_label":"New campus","expected_result":"The campus is saved."}
  ]$helpsteps$::jsonb
);

SELECT public._upsert_help_published_article(
  'campuses',
  'adding-members-to-a-campus',
  'Add members to a campus',
  'Assign existing church members to a campus, or remove them, without creating new accounts.',
  $helpbody$
Campus membership tells Sanctuary Protected which people belong to a location. Adding someone to a campus does not create a new user and does not make them a church administrator.

## Who can use this
Owners, co-owners, and administrators can manage campus members. Delegated campus managers can add and remove members for the campuses they are assigned, within their approved role.

## How to access
Open **Campuses**, select the campus, then open the **Members** tab.

## Important notes
- Use **Add existing members**, then **Add selected**.
- **Remove** takes the person off that campus. It does not delete their church account.
- You can mark a campus as primary for selected members.
$helpbody$,
  'how_to'::public.help_article_type,
  ARRAY['campus members', 'add members', 'remove members', 'primary campus'],
  ARRAY['Permission to manage campus members'],
  'Selected church members are assigned to the campus.',
  6,
  'beginner'::public.help_difficulty,
  false,
  30,
  'Open Campuses',
  '/campuses',
  ARRAY[]::text[],
  $helpsteps$[
    {"title":"Open the campus","instruction":"Open Campuses and select the campus.","deep_link_path":"/campuses","deep_link_label":"Campuses","expected_result":"Campus overview loads."},
    {"title":"Open Members","instruction":"Open the Members tab.","expected_result":"Campus members are listed."},
    {"title":"Add existing members","instruction":"Under Add existing members, select one or more people and choose Add selected.","expected_result":"Those members appear on the campus."}
  ]$helpsteps$::jsonb
);

SELECT public._upsert_help_published_article(
  'campuses',
  'delegating-campus-member-management',
  'Delegating campus member management',
  'Let trusted members manage campus people without giving them full campus administration.',
  $helpbody$
**Owner**, **Co-owner**, and **Administrator** keep top-level campus authority (create, edit, deactivate, delete, and assign delegation). They can delegate member-management tasks through **Delegated managers**.

Delegated people cannot create, delete, or reconfigure the campus.

Approved delegated roles include **Campus Member Manager**, **Campus Security Team Manager**, and **Campus Coordinator**.

## Who can use this
Only an Owner, Co-owner, or Administrator can assign or revoke campus-management delegation.

## How to access
Open a campus, then the **Delegated managers** tab.

## Important notes
- Choose **Effective date** and **Expiration date** if the assignment should start later or end automatically.
- Revoking delegation does not change the person’s other church permissions.
$helpbody$,
  'how_to'::public.help_article_type,
  ARRAY['delegated managers', 'campus delegation', 'campus member manager', 'delegate'],
  ARRAY['Owner, Co-owner, or Administrator role'],
  'A member has campus member-management access for the selected campus.',
  8,
  'intermediate'::public.help_difficulty,
  false,
  40,
  'Open Campuses',
  '/campuses',
  ARRAY[]::text[],
  $helpsteps$[
    {"title":"Select a campus","instruction":"Open Campuses and select the campus.","deep_link_path":"/campuses","deep_link_label":"Campuses","expected_result":"Campus page loads."},
    {"title":"Open Delegated managers","instruction":"Open the Delegated managers tab.","expected_result":"Current delegated managers are listed."},
    {"title":"Delegate campus access","instruction":"Choose + Delegate campus access. Select a member, choose an approved delegated role, set Effective date and Expiration date if needed, then save.","expected_result":"The member can manage the approved campus tasks until the assignment ends."}
  ]$helpsteps$::jsonb
);

SELECT public._upsert_help_published_article(
  'troubleshooting',
  'why-cant-i-see-another-campus',
  'Why can''t I see another campus?',
  'What to check when a campus is missing from your list or from a form.',
  $helpbody$
If a campus does not appear, it is usually because of assignment, role, or plan limits — not a broken page.

## Troubleshooting
- Confirm you are in the correct church.
- Confirm you are assigned to that campus, or that you are an Owner, Co-owner, or Administrator.
- Ask an administrator to add you on the campus **Members** tab, or to delegate campus access.
- If your church plan allows only one campus, extra campuses will not be available until the church upgrades.
- Temporary campus access may have an expiration date.

Campus-scoped security group assignments can also limit which campuses you see in some tools.
$helpbody$,
  'troubleshooting'::public.help_article_type,
  ARRAY['campus missing', 'cannot see campus', 'wrong campus', 'campus access'],
  ARRAY[]::text[],
  'You know who to ask and what usually causes a missing campus.',
  4,
  'beginner'::public.help_difficulty,
  false,
  20,
  'Open Campuses',
  '/campuses',
  ARRAY[]::text[],
  $helpsteps$[
    {"title":"Check Campuses","instruction":"Open Campuses and note which locations you can see.","deep_link_path":"/campuses","deep_link_label":"Campuses","expected_result":"You have a list to compare with what you expected."},
    {"title":"Ask an administrator","instruction":"If a location is missing, ask an Owner, Co-owner, or Administrator to assign you on Members or Delegated managers.","expected_result":"The right person can grant campus access."}
  ]$helpsteps$::jsonb
);

SELECT public._upsert_help_published_article(
  'security-permissions',
  'security-overview',
  'Security overview',
  'Where to manage church roles, permission groups, users, campus access, and temporary access.',
  $helpbody$
Security settings control who can do what in your church. Open **Settings**, then **Security**.

Tabs you will see:
- **Overview** — summary of groups and access
- **Church Roles** — job-title templates such as Owner, Administrator, or Security Leader
- **Groups** — permission groups where you add members and assign permissions
- **Users** — a person’s church role, status, and group memberships
- **Permissions** — the permission catalog
- **Campus** — campus-scoped access
- **Temporary** — time-limited grants
- **Audit** — security activity history
- **Settings** — security configuration

## Who can use this
Security leaders and above can open Security. Some actions are limited to owners, co-owners, and administrators.

## Important notes
- Church Roles are templates. People are added as members of **Groups**.
- A church plan can include a feature while a person still needs the matching security permission.
$helpbody$,
  'overview'::public.help_article_type,
  ARRAY['security', 'permissions', 'access', 'roles', 'groups', 'RBAC'],
  ARRAY[]::text[],
  'You know where Security lives and what each tab is for.',
  6,
  'beginner'::public.help_difficulty,
  true,
  10,
  'Open Security',
  '/settings/security',
  ARRAY[]::text[],
  $helpsteps$[
    {"title":"Open Security","instruction":"Open Settings, then Security.","deep_link_path":"/settings/security","deep_link_label":"Security","expected_result":"The Security page opens on Overview."}
  ]$helpsteps$::jsonb
);

SELECT public._upsert_help_published_article(
  'security-roles',
  'church-roles-and-security-groups',
  'Church Roles and Groups',
  'How Church Roles differ from Groups, and how they affect permissions.',
  $helpbody$
**Church Roles** are job titles for church members, such as Owner, Administrator, or Security Leader. Each role includes a default permission set. Assign these from Team or a member profile. The Church Roles page is for reviewing and editing role templates, not for adding people to a role.

**Groups** are permission groups. This is where you add members, set effective and expiration dates, choose campus scope, and manage permissions.

You can duplicate a Church Role into a Group when you need a custom starting point. Open the role, choose **Duplicate**, then review the new group on the **Groups** tab.

## Who can use this
People who can open Settings > Security.

## How to access
Open **Settings > Security > Church Roles** or **Settings > Security > Groups**.
$helpbody$,
  'overview'::public.help_article_type,
  ARRAY['church roles', 'security role', 'security group', 'permissions', 'templates'],
  ARRAY[]::text[],
  'You can tell when to use Church Roles versus Groups.',
  6,
  'beginner'::public.help_difficulty,
  false,
  10,
  'Church Roles',
  '/settings/security?tab=roles',
  ARRAY[]::text[],
  $helpsteps$[
    {"title":"Review Church Roles","instruction":"Open Settings, then Security, then Church Roles. Expand a role to see its default permissions.","deep_link_path":"/settings/security?tab=roles","deep_link_label":"Church Roles","expected_result":"Role templates are listed."},
    {"title":"Open Groups","instruction":"Open the Groups tab to see permission groups and member counts.","deep_link_path":"/settings/security?tab=groups","deep_link_label":"Groups","expected_result":"Groups are listed."}
  ]$helpsteps$::jsonb
);

SELECT public._upsert_help_published_article(
  'security-groups',
  'adding-members-to-a-security-group',
  'Adding members to a security group',
  'Add people to a permission group, including optional start and end dates and campus scope.',
  $helpbody$
Members inherit a group’s permissions. This is the usual way to grant extra access beyond a person’s church role.

You must have permission to manage security groups before you can add members.

## Who can use this
People who can manage Security Groups.

## How to access
Open **Settings**, then **Security**, then **Groups**.

## Important notes
- **Effective** is when the assignment starts. Leave it empty to start immediately.
- **Expires** is when the assignment ends. Leave it empty if it should not expire.
- **Campus scope** can be all permitted campuses, the member’s primary campus, or a selected campus.
$helpbody$,
  'how_to'::public.help_article_type,
  ARRAY['add members', 'security role', 'security group', 'members', 'user access', 'expiration', 'effective date'],
  ARRAY['Permission to manage security groups'],
  'Selected members are assigned to the group.',
  8,
  'intermediate'::public.help_difficulty,
  false,
  20,
  'Open Groups',
  '/settings/security?tab=groups',
  ARRAY[]::text[],
  $helpsteps$[
    {"title":"Open Groups","instruction":"Open Settings, then Security, then Groups.","deep_link_path":"/settings/security?tab=groups","deep_link_label":"Groups","expected_result":"Groups are listed."},
    {"title":"Select the group","instruction":"Select the group, then choose Members.","expected_result":"The Members section for that group opens."},
    {"title":"Add Members","instruction":"Choose Add Members. Select one or more people. Set Effective and Expires if needed. Choose campus scope if the work is limited to a location. Save with Add Members.","expected_result":"The members appear on the group."}
  ]$helpsteps$::jsonb
);

SELECT public._upsert_help_published_article(
  'security-groups',
  'assigning-group-permissions',
  'Assigning permissions',
  'Choose which permissions a security group grants to its members.',
  $helpbody$
Permissions on a group determine what members of that group can do, on top of their church role.

## Who can use this
People who can manage security groups.

## How to access
Open **Settings > Security > Groups**, select the group, then open **Permissions**.

## Important notes
- Inherited permissions come from the person’s church role plus every active group they belong to.
- Campus scope on a membership can limit where those permissions apply.
- Some actions still require Owner, Co-owner, or Administrator even if a permission appears in a group.
$helpbody$,
  'how_to'::public.help_article_type,
  ARRAY['assign permissions', 'permission catalog', 'inherited permissions', 'group permissions'],
  ARRAY['Permission to manage security groups'],
  'The group grants the intended permissions.',
  7,
  'intermediate'::public.help_difficulty,
  false,
  30,
  'Open Groups',
  '/settings/security?tab=groups',
  ARRAY[]::text[],
  $helpsteps$[
    {"title":"Open the group","instruction":"Open Settings, then Security, then Groups, and select the group.","deep_link_path":"/settings/security?tab=groups","deep_link_label":"Groups","expected_result":"Group detail loads."},
    {"title":"Open Permissions","instruction":"Open the Permissions section and select the permissions this group should grant. Save your changes.","expected_result":"Members of the group inherit those permissions."}
  ]$helpsteps$::jsonb
);

SELECT public._upsert_help_published_article(
  'security-groups',
  'temporary-access',
  'Temporary access',
  'Grant time-limited permissions and understand effective and expiration dates.',
  $helpbody$
Use **Temporary** access when someone needs extra permission for a limited time, such as covering a weekend or a special event.

Dates are shown in your church time zone.

## Who can use this
People who can manage security grants.

## How to access
Open **Settings**, then **Security**, then **Temporary**.

You can also set **Effective** and **Expires** when adding members to a group.

## Troubleshooting
If a permission seems missing, check whether the assignment is scheduled for later, already expired, or revoked.
$helpbody$,
  'how_to'::public.help_article_type,
  ARRAY['temporary access', 'expiration', 'effective date', 'expired permission', 'grant access'],
  ARRAY['Permission to manage temporary access'],
  'A time-limited grant exists with clear start and end times.',
  6,
  'intermediate'::public.help_difficulty,
  false,
  40,
  'Temporary access',
  '/settings/security?tab=temporary',
  ARRAY[]::text[],
  $helpsteps$[
    {"title":"Open Temporary","instruction":"Open Settings, then Security, then Temporary.","deep_link_path":"/settings/security?tab=temporary","deep_link_label":"Temporary","expected_result":"Temporary Access is shown."},
    {"title":"Grant Access","instruction":"Choose Grant Access. Select the person, permission, start, and end. Save with Grant Access.","expected_result":"The grant appears under Temporary Grants."}
  ]$helpsteps$::jsonb
);

SELECT public._upsert_help_published_article(
  'security-permissions',
  'subscription-tier-vs-security-permission',
  'Subscription plans vs security permissions',
  'A church plan can include a feature while a person still needs permission to use it.',
  $helpbody$
Two separate checks decide what you can do:

### Subscription plan
Determines whether the **church** has access to the feature. For example, camera features may be included only on higher plans.

### Security permission
Determines whether **you** are allowed to use a feature the church already has.

Example: your church may have Omni Enterprise, which includes camera features. You may still need camera-viewing permission before you can open camera feeds.

A higher church role does not replace a missing plan. A higher plan does not replace a missing permission.

If a menu item is visible but locked, that is a plan limit. If the item is missing entirely, that may be your role. If the page opens but an action is denied, that is usually a permission or campus-scope issue.
$helpbody$,
  'reference'::public.help_article_type,
  ARRAY['permission', 'plan', 'tier', 'access denied', 'cameras', 'entitlement'],
  ARRAY[]::text[],
  'You can tell plan limits apart from permission limits.',
  5,
  'beginner'::public.help_difficulty,
  false,
  20,
  'Open Security',
  '/settings/security',
  ARRAY[]::text[],
  $helpsteps$[
    {"title":"Review your plan","instruction":"Open Settings, then Subscription, if you can.","deep_link_path":"/settings/plans","deep_link_label":"Subscription","expected_result":"You see the church plan name."},
    {"title":"Review your access","instruction":"Open Settings, then Security, then Users, and find your name if you can manage users. Or ask an administrator.","deep_link_path":"/settings/security?tab=users","deep_link_label":"Users","expected_result":"You know which groups and role you have."}
  ]$helpsteps$::jsonb
);

SELECT public._upsert_help_published_article(
  'troubleshooting',
  'why-is-a-feature-greyed-out',
  'Why is a feature greyed out?',
  'Locked menu items stay visible so you can see features that require a higher plan.',
  $helpbody$
Sanctuary Protected displays some features that are available on higher subscription plans. Locked options remain visible so your team can see what exists.

Hovering on desktop, or tapping on a phone, shows why it is locked. The message names the feature and the minimum required plan, such as “Cameras requires Omni Enterprise or higher.”

## Who can use this
Anyone who sees a lock icon on a menu item.

## Important notes
- Your church must be upgraded before the feature becomes available.
- Having a higher security permission does not override the subscription plan.
- Certifications can stay available under Training even when Training Management pages are locked.
- After a plan change, locked items unlock (or lock) to match the new plan. Existing records are kept; some writes may be blocked on a lower plan.

Owners can compare plans under **Settings > Subscription**.
$helpbody$,
  'troubleshooting'::public.help_article_type,
  ARRAY['greyed out', 'grayed out', 'locked', 'disabled menu', 'upgrade', 'tier', 'minimum plan'],
  ARRAY[]::text[],
  'You understand locked menu items and who can upgrade the church plan.',
  4,
  'beginner'::public.help_difficulty,
  true,
  30,
  'View plans',
  '/settings/plans',
  ARRAY[]::text[],
  $helpsteps$[
    {"title":"Read the lock message","instruction":"Hover or tap the locked menu item. Note the feature name and minimum plan.","expected_result":"You know which plan is required."},
    {"title":"Open Subscription","instruction":"If you are an owner or co-owner, open Settings, then Subscription. Otherwise ask an owner.","deep_link_path":"/settings/plans","deep_link_label":"Subscription","expected_result":"Plan comparison is available to the people who can change it."}
  ]$helpsteps$::jsonb
);

-- ---------------------------------------------------------------------------
-- Training, certifications, remaining module overviews
-- ---------------------------------------------------------------------------

SELECT public._upsert_help_published_article(
  'training',
  'training-overview',
  'Training overview',
  'Find training events, courses, records, required training, reports, and settings.',
  $helpbody$
Training Management helps your church plan training, record attendance, and track renewals.

## Who can use this
Security members and above can open Training when the church plan includes Training Management. Some pages, such as Required and Reports, need a security leader. Settings needs an administrator.

## How to access
Open **Training** in the People section. You will see Dashboard, Calendar, Events, Courses, Records, Certifications, Required, Reports, and Settings (depending on your role).

## Important notes
- If Training pages are locked, the church plan does not include Training Management. Certifications may still be available.
- The plan notice on this article shows whether Training Management is included for your church.
- Categories, courses, renewal months, and external training records live in this module.
$helpbody$,
  'overview'::public.help_article_type,
  ARRAY['training', 'training management', 'courses', 'required training', 'renewals', 'external training'],
  ARRAY[]::text[],
  'You know where Training lives and which pages your role can open.',
  6,
  'beginner'::public.help_difficulty,
  true,
  10,
  'Open Training',
  '/training',
  ARRAY['training.management.enabled'],
  $helpsteps$[
    {"title":"Open Training","instruction":"From People, open Training.","deep_link_path":"/training","deep_link_label":"Training","expected_result":"The Training dashboard loads, or you see a plan lock message.","required_feature_key":"training.management.enabled"}
  ]$helpsteps$::jsonb
);

SELECT public._upsert_help_published_article(
  'training-events',
  'create-a-training-event',
  'Create a training event',
  'Schedule a training event and add participants.',
  $helpbody$
A training event is a session on the calendar. You can attach a course or category, then add people who should attend.

## Who can use this
People who can manage training events. Training Management must be included in your plan.

## How to access
Open **Training**, then **Events**, then **New event**. You can also start from the Training calendar.

## Important notes
- After the event exists, open it to add participants and record attendance.
- External training (training completed outside Sanctuary Protected) is submitted from **Training > Records**.
$helpbody$,
  'how_to'::public.help_article_type,
  ARRAY['create training', 'training event', 'new event', 'participants'],
  ARRAY['Permission to manage training events', 'Training Management on your plan'],
  'A training event exists and can receive participants.',
  7,
  'beginner'::public.help_difficulty,
  false,
  20,
  'New training event',
  '/training/events/new',
  ARRAY['training.management.enabled'],
  $helpsteps$[
    {"title":"Open Training Events","instruction":"Open Training, then Events.","deep_link_path":"/training/events","deep_link_label":"Events","expected_result":"Training events are listed.","required_feature_key":"training.management.enabled"},
    {"title":"Create the event","instruction":"Choose New event. Enter details and save with Create event.","deep_link_path":"/training/events/new","deep_link_label":"New event","expected_result":"The event is saved.","required_feature_key":"training.management.enabled"},
    {"title":"Add participants","instruction":"Open the event. Under Participants, select people and choose Add selected.","expected_result":"Participants are listed on the event."}
  ]$helpsteps$::jsonb
);

SELECT public._upsert_help_published_article(
  'training-events',
  'recording-training-completion',
  'Record training attendance and completion',
  'Mark who attended a training event and who completed it.',
  $helpbody$
Open a training event to record attendance and completion for each participant.

## Who can use this
People who can record training attendance.

## How to access
Open **Training > Events**, then open the event.

## Important notes
- Use **Save attendance** after you set attendance values.
- Use **Mark complete** for one person, or **Mark all complete** for everyone.
- Completing training can start a renewal period when the course or category has renewal months.
- Required training gaps are highlighted when you add participants.
$helpbody$,
  'how_to'::public.help_article_type,
  ARRAY['attendance', 'completion', 'mark complete', 'training records', 'renewal'],
  ARRAY['Permission to record training attendance'],
  'Attendance and completion are saved for the event.',
  6,
  'beginner'::public.help_difficulty,
  false,
  30,
  'Training events',
  '/training/events',
  ARRAY['training.management.enabled'],
  $helpsteps$[
    {"title":"Open the event","instruction":"Open Training, then Events, and select the event.","deep_link_path":"/training/events","deep_link_label":"Events","expected_result":"Participants and attendance controls are visible.","required_feature_key":"training.management.enabled"},
    {"title":"Save attendance","instruction":"Update attendance, then choose Save attendance. Use Mark complete or Mark all complete as needed.","expected_result":"Attendance and completion statuses update."}
  ]$helpsteps$::jsonb
);

SELECT public._upsert_help_published_article(
  'training-certifications',
  'certifications-overview',
  'Certifications overview',
  'Track member certifications, expiration dates, and documents.',
  $helpbody$
Certifications record credentials for members, such as licenses or completed programs, including an expiration date.

## Who can use this
Security members and above can open **Training > Certifications**. Administrators and security leaders can add certifications.

## How to access
Open **Training**, then **Certifications**. Choose **Add Certification** to create one.

## Important notes
- Certifications can remain available even when Training Management pages are locked.
- Some training courses can create a certification when completed.
- Keep expiration dates current so leaders can see what is expiring soon.
$helpbody$,
  'overview'::public.help_article_type,
  ARRAY['certifications', 'expiration', 'credentials', 'add certification', 'documents'],
  ARRAY[]::text[],
  'You know where certifications live and who can add them.',
  5,
  'beginner'::public.help_difficulty,
  false,
  10,
  'Open Certifications',
  '/certifications',
  ARRAY[]::text[],
  $helpsteps$[
    {"title":"Open Certifications","instruction":"Open Training, then Certifications.","deep_link_path":"/certifications","deep_link_label":"Certifications","expected_result":"Current certifications are listed."},
    {"title":"Add a certification","instruction":"If you are an administrator or security leader, choose Add Certification and complete the form, including Expiration date.","deep_link_path":"/certifications/new","deep_link_label":"Add Certification","expected_result":"The certification is saved."}
  ]$helpsteps$::jsonb
);

SELECT public._upsert_help_published_article(
  'dashboard',
  'dashboard-overview',
  'Dashboard overview',
  'Use the home dashboard, threat level, and summary boxes for your church.',
  $helpbody$
The **Dashboard** is the home view for your active church. It shows summary boxes (such as incidents, schedule, and certifications) and the current threat level.

## Who can use this
Every signed-in member can open Dashboard.

## How to access
Open **Dashboard** at the top of the left navigation.

## Important notes
- Use **Select church** if you belong to more than one church.
- Owners and administrators can customize dashboard boxes under **Settings > Dashboard**.
- Threat level history is available from the dashboard when your role allows it.
$helpbody$,
  'overview'::public.help_article_type,
  ARRAY['dashboard', 'home', 'threat level', 'boxes'],
  ARRAY[]::text[],
  'You can find the dashboard and understand what it summarizes.',
  4,
  'beginner'::public.help_difficulty,
  false,
  10,
  'Open Dashboard',
  '/dashboard',
  ARRAY[]::text[],
  $helpsteps$[
    {"title":"Open Dashboard","instruction":"From the left navigation, open Dashboard.","deep_link_path":"/dashboard","deep_link_label":"Dashboard","expected_result":"Summary boxes and threat level are visible."}
  ]$helpsteps$::jsonb
);

SELECT public._upsert_help_published_article(
  'security-hardware',
  'hardware-inventory-overview',
  'Hardware inventory',
  'Track security hardware such as radios, cameras, and related equipment.',
  $helpbody$
**Hardware** is the inventory of security equipment for your church.

## Who can use this
Members who can open Hardware. The church plan must include hardware inventory.

## How to access
Open **Hardware** in Operations.

If the item is locked, see Why is a feature greyed out?
$helpbody$,
  'overview'::public.help_article_type,
  ARRAY['hardware', 'inventory', 'radios', 'equipment'],
  ARRAY[]::text[],
  'You know where hardware inventory lives.',
  3,
  'beginner'::public.help_difficulty,
  false,
  10,
  'Open Hardware',
  '/security-hardware',
  ARRAY['hardware.inventory.enabled'],
  $helpsteps$[
    {"title":"Open Hardware","instruction":"From Operations, open Hardware.","deep_link_path":"/security-hardware","deep_link_label":"Hardware","expected_result":"Hardware inventory loads, or you see a plan lock message.","required_feature_key":"hardware.inventory.enabled"}
  ]$helpsteps$::jsonb
);

SELECT public._upsert_help_published_article(
  'medical-supplies',
  'medical-inventory-overview',
  'Medical supplies',
  'Track medical inventory and usage on incidents.',
  $helpbody$
**Medical Supplies** is the inventory of medical items for your church. Some plans also allow recording usage on incidents.

## Who can use this
Members who can open Medical Supplies when the plan includes medical inventory.

## How to access
Open **Medical Supplies** in Operations.
$helpbody$,
  'overview'::public.help_article_type,
  ARRAY['medical', 'supplies', 'inventory', 'first aid'],
  ARRAY[]::text[],
  'You know where medical supplies live.',
  3,
  'beginner'::public.help_difficulty,
  false,
  10,
  'Open Medical Supplies',
  '/medical-supplies',
  ARRAY['medical.inventory.enabled'],
  $helpsteps$[
    {"title":"Open Medical Supplies","instruction":"From Operations, open Medical Supplies.","deep_link_path":"/medical-supplies","deep_link_label":"Medical Supplies","expected_result":"Inventory loads, or you see a plan lock message.","required_feature_key":"medical.inventory.enabled"}
  ]$helpsteps$::jsonb
);

SELECT public._upsert_help_published_article(
  'policies',
  'policies-and-procedures-overview',
  'Policies and procedures',
  'Store and share church safety policies and procedures.',
  $helpbody$
**Policies & Procedures** is the library of church safety documents and acknowledgments.

## Who can use this
Members who can open Policies when the church plan includes this feature.

## How to access
Open **Policies & Procedures** in Operations.
$helpbody$,
  'overview'::public.help_article_type,
  ARRAY['policies', 'procedures', 'documents', 'acknowledgments'],
  ARRAY[]::text[],
  'You know where policies live.',
  3,
  'beginner'::public.help_difficulty,
  false,
  10,
  'Open Policies',
  '/policies',
  ARRAY['policies.enabled'],
  $helpsteps$[
    {"title":"Open Policies & Procedures","instruction":"From Operations, open Policies & Procedures.","deep_link_path":"/policies","deep_link_label":"Policies","expected_result":"The policy library loads, or you see a plan lock message.","required_feature_key":"policies.enabled"}
  ]$helpsteps$::jsonb
);

SELECT public._upsert_help_published_article(
  'known-safety-concerns',
  'known-safety-concerns-overview',
  'Known Safety Concerns',
  'Maintain profiles for people or situations your security team should recognize.',
  $helpbody$
**Safety Concerns** stores known safety concern profiles for your security team.

## Who can use this
Security members and above, when the church plan includes this feature. Leadership may still be able to read profiles after a plan change.

## How to access
Open **Safety Concerns** in Operations.
$helpbody$,
  'overview'::public.help_article_type,
  ARRAY['safety concerns', 'known individuals', 'profiles'],
  ARRAY[]::text[],
  'You know where Safety Concerns lives.',
  3,
  'beginner'::public.help_difficulty,
  false,
  10,
  'Open Safety Concerns',
  '/safety-concerns',
  ARRAY['safety_concerns.profiles.enabled'],
  $helpsteps$[
    {"title":"Open Safety Concerns","instruction":"From Operations, open Safety Concerns.","deep_link_path":"/safety-concerns","deep_link_label":"Safety Concerns","expected_result":"Profiles load, or you see a plan lock message.","required_feature_key":"safety_concerns.profiles.enabled"}
  ]$helpsteps$::jsonb
);

SELECT public._upsert_help_published_article(
  'cameras-sensors',
  'cameras-and-sensors-overview',
  'Cameras and sensors',
  'Open camera and sensor features when your church plan includes them.',
  $helpbody$
**Cameras** and **Sensors** are live-device features. They remain visible in the menu on lower plans so you can see what exists, but they stay locked until the church plan includes them.

Even on a plan that includes cameras, you may still need camera-viewing permission.

## Who can use this
Members who can open Cameras or Sensors when both the plan and their permissions allow it.

## How to access
Open **Cameras** or **Sensors** in Operations.
$helpbody$,
  'overview'::public.help_article_type,
  ARRAY['cameras', 'sensors', 'alarms', 'live view'],
  ARRAY[]::text[],
  'You know that cameras and sensors depend on plan and permission.',
  4,
  'beginner'::public.help_difficulty,
  false,
  10,
  'Open Cameras',
  '/cameras',
  ARRAY['cameras.enabled', 'sensors.enabled'],
  $helpsteps$[
    {"title":"Open Cameras or Sensors","instruction":"From Operations, open Cameras or Sensors. If the item is locked, read the lock message.","deep_link_path":"/cameras","deep_link_label":"Cameras","expected_result":"The feature opens, or you see the required plan.","required_feature_key":"cameras.enabled"}
  ]$helpsteps$::jsonb
);

SELECT public._upsert_help_published_article(
  'reports',
  'reports-and-analytics-overview',
  'Reports and analytics',
  'Find incident analytics, training reports, hardware reports, and audit history.',
  $helpbody$
Reporting is spread across the modules that produce the data:

- **Incidents** — incident analytics (when included in your plan)
- **Training > Reports** — training completion and renewal reports
- **Hardware** — hardware reports
- **Audit** — church activity history (Admin)

Standard analytics are included on typical plans. Advanced analytics require a higher plan. The plan notice on this article reflects your church.

## How to access
Open the module first, then look for Reports or Analytics in that area. Church-wide audit is **Audit** under Admin.
$helpbody$,
  'overview'::public.help_article_type,
  ARRAY['reports', 'analytics', 'audit', 'incident analytics'],
  ARRAY[]::text[],
  'You know where reports live in each module.',
  4,
  'beginner'::public.help_difficulty,
  false,
  10,
  'Open Audit',
  '/audit',
  ARRAY['analytics.standard.enabled', 'incidents.analytics.enabled'],
  $helpsteps$[
    {"title":"Open Audit","instruction":"From Admin, open Audit for church activity history.","deep_link_path":"/audit","deep_link_label":"Audit","expected_result":"Audit history is visible if your role allows it."},
    {"title":"Open incident analytics","instruction":"From Incidents, open analytics if your plan includes it.","deep_link_path":"/incidents/analytics","deep_link_label":"Incident analytics","expected_result":"Analytics load, or you see a plan lock message.","required_feature_key":"incidents.analytics.enabled"}
  ]$helpsteps$::jsonb
);

SELECT public._upsert_help_published_article(
  'account-security',
  'account-and-profile-settings',
  'Account and profile settings',
  'Update your profile, switch churches, and find account settings.',
  $helpbody$
Your **Profile** holds your personal account details. **Account** under Settings holds church-level account options.

## Who can use this
Every signed-in member can open Profile and Help Center. Church Account settings are limited to roles that can open Settings.

## How to access
- **Profile** — Account section of the left navigation
- **Select church** — switch which church you are working in
- **Settings > Account** — church account options

Use light or dark appearance from your browser or system settings as supported by the app. Help pages use the same theme as the rest of Sanctuary Protected.
$helpbody$,
  'overview'::public.help_article_type,
  ARRAY['profile', 'account', 'select church', 'dark mode', 'light mode'],
  ARRAY[]::text[],
  'You can find profile and church switching.',
  3,
  'beginner'::public.help_difficulty,
  false,
  10,
  'Open Profile',
  '/profile',
  ARRAY[]::text[],
  $helpsteps$[
    {"title":"Open Profile","instruction":"From Account, open Profile.","deep_link_path":"/profile","deep_link_label":"Profile","expected_result":"Your profile is visible."},
    {"title":"Switch churches if needed","instruction":"Open Select church to work in a different church you belong to.","deep_link_path":"/select-church","deep_link_label":"Select church","expected_result":"You can choose another church or create one."}
  ]$helpsteps$::jsonb
);

-- ---------------------------------------------------------------------------
-- Relations
-- ---------------------------------------------------------------------------

SELECT public._seed_help_relation('welcome-to-sanctuary-protected', 'initial-setup-checklist', 'next_step'::public.help_relation_type, 1);
SELECT public._seed_help_relation('initial-setup-checklist', 'church-settings-overview', 'next_step'::public.help_relation_type, 1);
SELECT public._seed_help_relation('initial-setup-checklist', 'invite-church-members', 'next_step'::public.help_relation_type, 2);
SELECT public._seed_help_relation('church-settings-overview', 'selecting-a-time-zone', 'related'::public.help_relation_type, 1);
SELECT public._seed_help_relation('church-settings-overview', 'understanding-url-names', 'related'::public.help_relation_type, 2);
SELECT public._seed_help_relation('church-settings-overview', 'church-contact-information', 'related'::public.help_relation_type, 3);
SELECT public._seed_help_relation('selecting-a-time-zone', 'church-settings-overview', 'related'::public.help_relation_type, 1);
SELECT public._seed_help_relation('understanding-url-names', 'church-settings-overview', 'related'::public.help_relation_type, 1);
SELECT public._seed_help_relation('campuses-overview', 'create-a-campus', 'next_step'::public.help_relation_type, 1);
SELECT public._seed_help_relation('create-a-campus', 'adding-members-to-a-campus', 'next_step'::public.help_relation_type, 1);
SELECT public._seed_help_relation('adding-members-to-a-campus', 'delegating-campus-member-management', 'related'::public.help_relation_type, 1);
SELECT public._seed_help_relation('delegating-campus-member-management', 'adding-members-to-a-security-group', 'related'::public.help_relation_type, 1);
SELECT public._seed_help_relation('why-cant-i-see-another-campus', 'campuses-overview', 'related'::public.help_relation_type, 1);
SELECT public._seed_help_relation('why-cant-i-see-another-campus', 'adding-members-to-a-campus', 'troubleshooting'::public.help_relation_type, 1);
SELECT public._seed_help_relation('security-overview', 'church-roles-and-security-groups', 'next_step'::public.help_relation_type, 1);
SELECT public._seed_help_relation('church-roles-and-security-groups', 'adding-members-to-a-security-group', 'next_step'::public.help_relation_type, 1);
SELECT public._seed_help_relation('adding-members-to-a-security-group', 'assigning-group-permissions', 'related'::public.help_relation_type, 1);
SELECT public._seed_help_relation('adding-members-to-a-security-group', 'temporary-access', 'related'::public.help_relation_type, 2);
SELECT public._seed_help_relation('subscription-tier-vs-security-permission', 'why-is-a-feature-greyed-out', 'related'::public.help_relation_type, 1);
SELECT public._seed_help_relation('why-is-a-feature-greyed-out', 'subscription-plans-overview', 'upgrade_information'::public.help_relation_type, 1);
SELECT public._seed_help_relation('why-is-a-feature-greyed-out', 'subscription-tier-vs-security-permission', 'related'::public.help_relation_type, 2);
SELECT public._seed_help_relation('subscription-plans-overview', 'why-is-a-feature-greyed-out', 'related'::public.help_relation_type, 1);
SELECT public._seed_help_relation('training-overview', 'create-a-training-event', 'next_step'::public.help_relation_type, 1);
SELECT public._seed_help_relation('create-a-training-event', 'recording-training-completion', 'next_step'::public.help_relation_type, 1);
SELECT public._seed_help_relation('training-overview', 'certifications-overview', 'related'::public.help_relation_type, 2);
SELECT public._seed_help_relation('invite-church-members', 'create-an-event', 'next_step'::public.help_relation_type, 1);
SELECT public._seed_help_relation('create-an-event', 'create-a-shift', 'next_step'::public.help_relation_type, 1);
SELECT public._seed_help_relation('create-a-shift', 'assign-members-to-shifts', 'next_step'::public.help_relation_type, 1);
SELECT public._seed_help_relation('initial-setup-checklist', 'log-a-security-incident', 'related'::public.help_relation_type, 3);
SELECT public._seed_help_relation('create-a-notification-group', 'send-a-group-email', 'next_step'::public.help_relation_type, 1);
SELECT public._seed_help_relation('send-a-group-email', 'create-a-notification-group', 'prerequisite'::public.help_relation_type, 1);
SELECT public._seed_help_relation('welcome-to-sanctuary-protected', 'subscription-plans-overview', 'related'::public.help_relation_type, 2);
SELECT public._seed_help_relation('welcome-to-sanctuary-protected', 'get-help-and-support', 'related'::public.help_relation_type, 3);
SELECT public._seed_help_relation('log-a-security-incident', 'get-help-and-support', 'related'::public.help_relation_type, 9);
SELECT public._seed_help_relation('get-help-and-support', 'why-is-a-feature-greyed-out', 'troubleshooting'::public.help_relation_type, 1);
SELECT public._seed_help_relation('cameras-and-sensors-overview', 'subscription-tier-vs-security-permission', 'related'::public.help_relation_type, 1);
SELECT public._seed_help_relation('cameras-and-sensors-overview', 'why-is-a-feature-greyed-out', 'troubleshooting'::public.help_relation_type, 1);

-- ---------------------------------------------------------------------------
-- Cleanup helpers (content remains)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public._seed_help_relation(text, text, public.help_relation_type, integer);
DROP FUNCTION IF EXISTS public._upsert_help_published_article(
  text, text, text, text, text, public.help_article_type, text[], text[], text,
  integer, public.help_difficulty, boolean, integer, text, text, text[], jsonb
);
DROP FUNCTION IF EXISTS public._seed_help_category(text, text, text, integer, text);

