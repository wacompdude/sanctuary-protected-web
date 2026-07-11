-- Fix churches table access: ensure default church exists, RLS, and grants.

CREATE TABLE IF NOT EXISTS churches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO churches (id, name)
VALUES ('00000000-0000-4000-8000-000000000001', 'Default Sanctuary')
ON CONFLICT (id) DO NOTHING;

-- Point any orphaned profiles at the default church
UPDATE profiles
SET church_id = '00000000-0000-4000-8000-000000000001'
WHERE church_id IS NULL
   OR NOT EXISTS (
     SELECT 1 FROM churches WHERE churches.id = profiles.church_id
   );

ALTER TABLE churches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their church" ON churches;
CREATE POLICY "Users can read their church"
  ON churches FOR SELECT
  USING (
    id IN (SELECT church_id FROM profiles WHERE id = auth.uid())
  );

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON churches TO anon, authenticated;
