-- Repair migration: add church_id to an existing profiles table.
-- This is needed when profiles was created earlier (e.g. Supabase starter)
-- without church_id, so 001_incidents.sql skipped table creation.

-- Ensure churches + default church exist
CREATE TABLE IF NOT EXISTS churches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO churches (id, name)
VALUES ('00000000-0000-4000-8000-000000000001', 'Default Sanctuary')
ON CONFLICT (id) DO NOTHING;

-- Add missing columns to profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS church_id UUID;

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS full_name TEXT;

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill existing profile rows to the default church
UPDATE profiles
SET church_id = '00000000-0000-4000-8000-000000000001'
WHERE church_id IS NULL;

-- Enforce church_id + foreign key
ALTER TABLE profiles
ALTER COLUMN church_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_church_id_fkey'
  ) THEN
    ALTER TABLE profiles
    ADD CONSTRAINT profiles_church_id_fkey
    FOREIGN KEY (church_id) REFERENCES churches (id) ON DELETE RESTRICT;
  END IF;
END $$;

-- Ensure RLS policy for reading own profile
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (id = auth.uid());

GRANT SELECT ON profiles TO authenticated;
