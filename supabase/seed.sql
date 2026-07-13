-- After Phase 3/4 migrations, link your Auth user to a church via memberships.
-- Profile rows are created automatically by the auth.users trigger (010).
--
-- 1) Find your user id:
--    SELECT id, email FROM auth.users;
--
-- 2) Ensure a profile exists (trigger should already have created it):
--    SELECT * FROM profiles WHERE id = 'YOUR_USER_ID';
--
-- 3) Create an active membership (roles live here, not on profiles):

INSERT INTO church_memberships (church_id, user_id, role, status, joined_at)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'YOUR_USER_ID',
  'owner',
  'active',
  now()
)
ON CONFLICT (church_id, user_id) DO UPDATE
SET
  role = EXCLUDED.role,
  status = 'active',
  joined_at = COALESCE(church_memberships.joined_at, now()),
  updated_at = now();

-- Optional: set display name on an existing profile
-- UPDATE profiles
-- SET first_name = 'Your', last_name = 'Name', full_name = 'Your Name'
-- WHERE id = 'YOUR_USER_ID';
