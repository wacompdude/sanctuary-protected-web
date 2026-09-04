-- =============================================================================
-- 091_mfa_policy_help.sql
-- Help Center: Multi-Factor Authentication Policies.
-- Additive / idempotent. Safe to re-run.
-- =============================================================================

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
      category_id, article_type, title, slug, summary, body_content, body_format,
      status, audience_scope, estimated_minutes, difficulty, is_featured, is_popular,
      display_order, search_keywords, prerequisites, expected_result,
      support_cta_label, support_cta_path
    )
    VALUES (
      v_category_id, p_article_type, p_title, p_slug, p_summary, p_body,
      'markdown'::public.help_body_format, 'draft'::public.help_article_status,
      'all_authenticated'::public.help_audience_scope, p_estimated_minutes,
      p_difficulty, coalesce(p_is_featured, false), false,
      coalesce(p_display_order, 0), coalesce(p_keywords, '{}'::text[]),
      coalesce(p_prerequisites, '{}'::text[]), p_expected_result,
      p_support_cta_label, p_support_cta_path
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
        article_id, version_id, step_number, title, instruction, expected_result,
        tip_text, warning_text, deep_link_path, deep_link_label, required_feature_key
      )
      VALUES (
        v_article_id, NULL, v_step_num,
        coalesce(v_step->>'title', 'Step ' || v_step_num),
        coalesce(v_step->>'instruction', ''),
        v_step->>'expected_result', v_step->>'tip_text', v_step->>'warning_text',
        v_step->>'deep_link_path', v_step->>'deep_link_label',
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
    article_id, version_number, title, summary, body_content, body_format,
    article_type, audience_scope, estimated_minutes, difficulty, search_keywords,
    prerequisites, expected_result, steps_snapshot, change_summary
  )
  VALUES (
    v_article_id, v_version_number, p_title, p_summary, p_body,
    'markdown'::public.help_body_format, p_article_type,
    'all_authenticated'::public.help_audience_scope, p_estimated_minutes,
    p_difficulty, coalesce(p_keywords, '{}'::text[]),
    coalesce(p_prerequisites, '{}'::text[]), p_expected_result,
    v_steps_snapshot, 'Product Help update (migration 091)'
  )
  RETURNING id INTO v_version_id;

  v_step_num := 0;
  IF p_steps IS NOT NULL THEN
    FOR v_step IN SELECT * FROM jsonb_array_elements(p_steps)
    LOOP
      v_step_num := v_step_num + 1;
      INSERT INTO public.help_article_steps (
        article_id, version_id, step_number, title, instruction, expected_result,
        tip_text, warning_text, deep_link_path, deep_link_label, required_feature_key
      )
      VALUES (
        v_article_id, v_version_id, v_step_num,
        coalesce(v_step->>'title', 'Step ' || v_step_num),
        coalesce(v_step->>'instruction', ''),
        v_step->>'expected_result', v_step->>'tip_text', v_step->>'warning_text',
        v_step->>'deep_link_path', v_step->>'deep_link_label',
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
    source_article_id, target_article_id, relationship_type, display_order
  )
  VALUES (v_source, v_target, p_type, p_display_order)
  ON CONFLICT DO NOTHING;
END;
$fn$;

SELECT public._upsert_help_published_article(
  'account-security',
  'multi-factor-authentication-policies',
  'Multi-Factor Authentication Policies',
  'How platform-wide and organization MFA settings work together, and why turning MFA off does not remove your enrollment.',
  $helpbody$
## What MFA does
After a successful email and password sign-in, Sanctuary Protected may ask for an extra verification code. That extra step is **MFA required by policy**. It is separate from **MFA enrolled**.

- **Enrolled** means a backup phone, trusted device, or other verification method is stored for your account.
- **Required** means the application currently asks for that extra step before you can open church data.

These are not the same. A Platform Super Admin can turn the requirement off for testing without deleting anyone's enrollment.

## Platform-wide MFA policy
Platform Super Admins can require MFA across the application or temporarily turn it off.

When Platform MFA is **off**:

- Users sign in with email and password only
- SMS, email codes, and trusted-device checks are not required
- Existing enrollments and trusted devices stay stored
- Turning Platform MFA back **on** restores each organization's previous setting

Disabling Platform MFA does **not** change each organization's saved MFA setting.

## Organization MFA policy
When Platform MFA is **on**, each organization can require MFA or not.

Example:

- Platform MFA = ON
- ABC123 Church MFA = OFF
- Users opening ABC123 Church are not asked for the extra code
- Their backup phone and trusted devices remain on the account

If that church later turns MFA **on**, the next sign-in that evaluates policy uses the existing enrollment and trusted-device rules.

## How the Platform override works
Platform MFA **off** always wins. Organization settings are preserved but not applied until Platform MFA is on again.

| Platform | Organization | Effective |
| --- | --- | --- |
| ON | ON | REQUIRED |
| ON | OFF | NOT REQUIRED |
| OFF | ON | NOT REQUIRED — overridden by Platform setting |
| OFF | OFF | NOT REQUIRED — overridden by Platform setting |

## Trusted devices
Trusted devices are evaluated **after** policy says MFA is required.

- MFA policy off is **not** the same as trusting a device
- Turning MFA off does **not** create a trusted-device record
- When MFA is required again, an existing trusted device can still skip the code if it is valid

## Platform Super Admins
Accounts opening **Platform Administration** follow the **platform** MFA policy, not an individual church setting. A church with MFA off does not weaken Super Admin sign-in while Platform MFA remains on.

## Active sessions
Changing MFA on or off applies to new sign-ins, reauthentication, and switching churches. Existing sessions are not all signed out automatically.

## What members see
If MFA is not required, the application does **not** say your MFA was removed. Profile may explain that MFA is not currently required by organization or platform policy.
$helpbody$,
  'reference'::public.help_article_type,
  ARRAY['mfa', '2fa', 'mfa policy', 'platform mfa', 'organization mfa', 'trusted device'],
  ARRAY['sign-in-verification', 'trusted-devices']::text[],
  'You understand platform and organization MFA policies and that disabling MFA does not unenroll users.',
  6,
  'intermediate'::public.help_difficulty,
  false,
  13,
  'Open Profile',
  '/profile',
  ARRAY[]::text[],
  $helpsteps$[
    {"title":"Understand enrollment vs requirement","instruction":"Enrollment (backup phone or trusted device) stays stored even when policy does not require a code.","expected_result":"You can tell the difference between enrolled and required."},
    {"title":"Platform Super Admins review policy","instruction":"Open Platform → Security → Multi-Factor Authentication to see platform and organization settings.","expected_result":"You can see each organization's setting and the effective status."},
    {"title":"Re-enable MFA when testing is finished","instruction":"Turn Platform MFA back on so each organization's saved setting applies again.","expected_result":"Organizations that require MFA ask for verification on the next sign-in."}
  ]$helpsteps$::jsonb
);

SELECT public._seed_help_relation('sign-in-verification', 'multi-factor-authentication-policies', 'related'::public.help_relation_type, 2);
SELECT public._seed_help_relation('trusted-devices', 'multi-factor-authentication-policies', 'related'::public.help_relation_type, 2);
SELECT public._seed_help_relation('multi-factor-authentication-policies', 'sign-in-verification', 'related'::public.help_relation_type, 1);
SELECT public._seed_help_relation('multi-factor-authentication-policies', 'trusted-devices', 'related'::public.help_relation_type, 2);
SELECT public._seed_help_relation('account-and-profile-settings', 'multi-factor-authentication-policies', 'related'::public.help_relation_type, 3);

DROP FUNCTION IF EXISTS public._seed_help_relation(text, text, public.help_relation_type, integer);
DROP FUNCTION IF EXISTS public._upsert_help_published_article(
  text, text, text, text, text, public.help_article_type, text[], text[], text,
  integer, public.help_difficulty, boolean, integer, text, text, text[], jsonb
);
