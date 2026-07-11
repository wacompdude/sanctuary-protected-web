-- After running 006_certifications.sql, ensure your profile can manage certs:
--
-- UPDATE profiles
-- SET role = 'administrator'  -- or 'security_leader'
-- WHERE id = 'YOUR_USER_ID';
--
-- Link / create profile if needed:

INSERT INTO profiles (id, church_id, full_name, role)
VALUES (
  'YOUR_USER_ID',
  '00000000-0000-4000-8000-000000000001',
  'Your Name',
  'administrator'
)
ON CONFLICT (id) DO UPDATE
SET church_id = EXCLUDED.church_id,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role;
