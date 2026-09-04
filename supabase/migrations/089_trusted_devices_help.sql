-- =============================================================================
-- 089_trusted_devices_help.sql
-- Help Center: Trusted Devices + sign-in verification.
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
    v_steps_snapshot, 'Product Help update (migration 089)'
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
  'account-and-profile-settings',
  'Account and profile settings',
  'Update your profile, manage trusted devices, and find account settings.',
  $helpbody$
Your **Profile** holds your personal account details, including **sign-in verification** and **trusted devices**. **Account** under Settings holds church-level account options.

## Who can use this
Every signed-in member can open Profile and Help Center. Church Account settings are limited to roles that can open Settings.

## How to access
- **Profile** — Account section of the left navigation
- **Select church** — switch which church you are working in
- **Settings > Account** — church account options

Use light or dark appearance from your browser or system settings as supported by the app. Help pages use the same theme as the rest of Sanctuary Protected.

See **Sign-in verification** and **Trusted Devices** for how extra verification works after your password.
$helpbody$,
  'overview'::public.help_article_type,
  ARRAY['profile', 'account', 'trusted devices', 'sign-in verification'],
  ARRAY[]::text[],
  'You can find profile, trusted devices, and church switching.',
  3,
  'beginner'::public.help_difficulty,
  false,
  10,
  'Open Profile',
  '/profile',
  ARRAY[]::text[],
  $helpsteps$[
    {"title":"Open Profile","instruction":"From Account, open Profile.","deep_link_path":"/profile","deep_link_label":"Profile","expected_result":"Your profile is visible."},
    {"title":"Review trusted devices","instruction":"On Profile, scroll to Trusted devices to see browsers you have trusted.","deep_link_path":"/profile","deep_link_label":"Profile","expected_result":"You can see and remove trusted devices."}
  ]$helpsteps$::jsonb
);

SELECT public._upsert_help_published_article(
  'account-security',
  'sign-in-verification',
  'Sign-in verification',
  'After your password, Sanctuary Protected asks for a verification code unless this browser is already trusted.',
  $helpbody$
Signing in has more than one step. These states are separate:

1. **Account / email identity** — your email belongs to the account
2. **Password authentication** — Supabase accepted your password
3. **Device verification** — this browser is trusted, or you complete a code
4. **Application access** — church roles and permissions apply after you are fully signed in

## What happens at sign-in
After a successful password, a new or unrecognized browser must complete a 6-digit email code. If you added a verified backup phone, you can request a text instead.

If this browser is a **trusted device** that has not expired or been removed, the extra code is skipped for the trusted period.

## Why am I being asked again?
Common reasons:

- You are on a different computer, phone, or browser
- You used a private or incognito window
- Cookies were cleared
- The trusted period ended
- You or an administrator removed the trusted device
- You changed your password or removed a backup verification method

A successful password is not enough by itself. The current device must also be verified or trusted.

Do not share verification codes with anyone.
$helpbody$,
  'how_to'::public.help_article_type,
  ARRAY['mfa', '2fa', 'verification code', 'trusted device', 'sign-in'],
  ARRAY['account-and-profile-settings']::text[],
  'You understand when a verification code is required.',
  4,
  'beginner'::public.help_difficulty,
  false,
  11,
  'Open Profile',
  '/profile',
  ARRAY[]::text[],
  $helpsteps$[
    {"title":"Sign in with email and password","instruction":"Enter your account email and password.","expected_result":"If this device is not trusted, you are asked to verify."},
    {"title":"Enter the email code","instruction":"Open the 6-digit code sent to your account email.","expected_result":"Your identity is verified for this session."},
    {"title":"Optionally trust this device","instruction":"If you are on a computer you own, you may select Trust this device.","expected_result":"Future sign-ins from this browser can skip the extra code until trust expires."}
  ]$helpsteps$::jsonb
);

SELECT public._upsert_help_published_article(
  'account-security',
  'trusted-devices',
  'Trusted Devices',
  'Trust a browser you own so you are not asked for an extra verification code at every sign-in.',
  $helpbody$
## What is a trusted device?
A trusted device is a specific browser on a specific computer or phone that you chose to remember after you verified your identity. Sanctuary Protected stores a secure cookie in that browser. Your account can stay verified while this browser stays trusted.

Trusting a device is **not** the same as verifying your email or turning off sign-in verification for every computer.

## When should I trust a device?
Trust a device you own and control, such as your home computer, work laptop, or personal phone.

## When should I NOT trust a device?
Do **not** select Trust this device on:

- A public or shared computer
- A library, hotel, or church lobby kiosk
- Someone else's phone
- A browser you do not control

If you skip Trust this device, you can still use the application for this session. The next sign-in from an unrecognized browser will ask for a verification code again.

## Why am I being asked to verify again?
You will normally be asked again when:

- You sign in from a different computer, phone, or browser
- You use a private or incognito window
- Cookies were cleared
- The trusted period ended (default 30 days)
- You removed the device from Profile
- You chose **Log out and forget this device**
- You changed your password
- An administrator forced verification

Ordinary **Sign out** ends your session but does **not** forget the device. The next password sign-in from that same trusted browser can skip the extra code.

## How do I remove a trusted device?
1. Open **Profile**
2. Find **Trusted devices**
3. Choose **Remove** for one browser, or **Remove all trusted devices**

The current browser is labeled **This device** when we can recognize it.

## What happens if I lose a trusted device?
Remove it from Profile, or remove all trusted devices. That browser will need a verification code the next time someone signs in with your account. If you believe the account was compromised, also change your password. Changing your password removes every trusted device.
$helpbody$,
  'how_to'::public.help_article_type,
  ARRAY['trusted device', 'trust this device', 'mfa', '2fa', 'remember device'],
  ARRAY['sign-in-verification']::text[],
  'You can trust, review, and remove browsers safely.',
  5,
  'beginner'::public.help_difficulty,
  true,
  12,
  'Manage trusted devices',
  '/profile',
  ARRAY[]::text[],
  $helpsteps$[
    {"title":"Open Trusted devices","instruction":"From Account, open Profile and scroll to Trusted devices.","deep_link_path":"/profile","deep_link_label":"Profile","expected_result":"You see this device and any other trusted browsers."},
    {"title":"Remove a device you no longer use","instruction":"Choose Remove on that device, or Remove all trusted devices.","deep_link_path":"/profile","deep_link_label":"Profile","expected_result":"That browser must verify again at the next sign-in."},
    {"title":"Forget this browser when leaving a shared computer","instruction":"Choose Log out and forget this device.","deep_link_path":"/profile","deep_link_label":"Profile","expected_result":"You are signed out and this browser is no longer trusted."}
  ]$helpsteps$::jsonb
);

SELECT public._seed_help_relation('account-and-profile-settings', 'sign-in-verification', 'related'::public.help_relation_type, 1);
SELECT public._seed_help_relation('account-and-profile-settings', 'trusted-devices', 'related'::public.help_relation_type, 2);
SELECT public._seed_help_relation('sign-in-verification', 'trusted-devices', 'next_step'::public.help_relation_type, 1);
SELECT public._seed_help_relation('trusted-devices', 'sign-in-verification', 'related'::public.help_relation_type, 1);

DROP FUNCTION IF EXISTS public._seed_help_relation(text, text, public.help_relation_type, integer);
DROP FUNCTION IF EXISTS public._upsert_help_published_article(
  text, text, text, text, text, public.help_article_type, text[], text[], text,
  integer, public.help_difficulty, boolean, integer, text, text, text[], jsonb
);
