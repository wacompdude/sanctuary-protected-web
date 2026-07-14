-- =============================================================================
-- ops_diagnose_profile_load.sql
--
-- MANUAL DIAGNOSTIC — run in Supabase SQL Editor when the app shows
-- "Unable to load your profile."
-- =============================================================================

-- 1) Expected profile columns (009 / 010)
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
ORDER BY ordinal_position;

-- 2) RLS enabled?
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('profiles', 'church_memberships', 'churches');

-- 3) Profiles policies (co-member policy can break SELECT if helpers/tables missing)
SELECT pol.polname AS policy_name,
       CASE pol.polcmd
         WHEN 'r' THEN 'SELECT'
         WHEN 'a' THEN 'INSERT'
         WHEN 'w' THEN 'UPDATE'
         WHEN 'd' THEN 'DELETE'
         ELSE pol.polcmd::text
       END AS command
FROM pg_policy pol
JOIN pg_class c ON c.oid = pol.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'profiles'
ORDER BY pol.polname;

-- 4) Multi-tenant helpers required by 013 RLS
SELECT p.proname AS function_name
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'is_active_church_member',
    'has_church_role',
    'handle_new_user_profile'
  )
ORDER BY p.proname;

-- 5) church_memberships present?
SELECT to_regclass('public.church_memberships') AS church_memberships;

-- 6) As a quick auth-user check (replace email):
-- SELECT id, email FROM auth.users WHERE lower(email) = lower('you@example.com');
-- SELECT * FROM public.profiles WHERE id = '<user-id-from-above>';
