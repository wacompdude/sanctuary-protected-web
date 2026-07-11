-- Sanctuary Protected: incident management schema

-- Churches
CREATE TABLE IF NOT EXISTS churches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Links authenticated users to a church
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  church_id UUID NOT NULL REFERENCES churches (id) ON DELETE RESTRICT,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TYPE incident_type AS ENUM (
  'security',
  'medical',
  'fire',
  'theft',
  'vandalism',
  'disturbance',
  'other'
);

CREATE TYPE incident_severity AS ENUM ('low', 'medium', 'high', 'critical');

CREATE TYPE incident_status AS ENUM (
  'open',
  'investigating',
  'resolved',
  'closed'
);

CREATE TABLE IF NOT EXISTS incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL REFERENCES churches (id) ON DELETE RESTRICT,
  created_by UUID NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  type incident_type NOT NULL,
  severity incident_severity NOT NULL,
  status incident_status NOT NULL DEFAULT 'open',
  location TEXT NOT NULL,
  description TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TYPE incident_update_type AS ENUM (
  'created',
  'comment',
  'status_change'
);

CREATE TABLE IF NOT EXISTS incident_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES incidents (id) ON DELETE CASCADE,
  church_id UUID NOT NULL REFERENCES churches (id) ON DELETE RESTRICT,
  created_by UUID NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  update_type incident_update_type NOT NULL DEFAULT 'comment',
  content TEXT NOT NULL,
  previous_status incident_status,
  new_status incident_status,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS incidents_church_id_idx ON incidents (church_id);
CREATE INDEX IF NOT EXISTS incidents_occurred_at_idx ON incidents (occurred_at DESC);
CREATE INDEX IF NOT EXISTS incident_updates_incident_id_idx ON incident_updates (incident_id);

CREATE OR REPLACE FUNCTION set_incidents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS incidents_updated_at ON incidents;
CREATE TRIGGER incidents_updated_at
  BEFORE UPDATE ON incidents
  FOR EACH ROW
  EXECUTE FUNCTION set_incidents_updated_at();

-- Row Level Security
ALTER TABLE churches ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their church"
  ON churches FOR SELECT
  USING (
    id IN (SELECT church_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Users can view church incidents"
  ON incidents FOR SELECT
  USING (
    church_id IN (SELECT church_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can create church incidents"
  ON incidents FOR INSERT
  WITH CHECK (
    church_id IN (SELECT church_id FROM profiles WHERE id = auth.uid())
    AND created_by = auth.uid()
  );

CREATE POLICY "Users can update church incidents"
  ON incidents FOR UPDATE
  USING (
    church_id IN (SELECT church_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can view church incident updates"
  ON incident_updates FOR SELECT
  USING (
    church_id IN (SELECT church_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can create church incident updates"
  ON incident_updates FOR INSERT
  WITH CHECK (
    church_id IN (SELECT church_id FROM profiles WHERE id = auth.uid())
    AND created_by = auth.uid()
  );

-- Default church for initial setup (link users via profiles table)
INSERT INTO churches (id, name)
VALUES ('00000000-0000-4000-8000-000000000001', 'Default Sanctuary')
ON CONFLICT (id) DO NOTHING;

-- API role grants (required for signed-in users)
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON churches TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON incidents TO authenticated;
GRANT SELECT, INSERT ON incident_updates TO authenticated;
GRANT SELECT ON profiles TO authenticated;
GRANT USAGE ON TYPE incident_type TO anon, authenticated;
GRANT USAGE ON TYPE incident_severity TO anon, authenticated;
GRANT USAGE ON TYPE incident_status TO anon, authenticated;
GRANT USAGE ON TYPE incident_update_type TO anon, authenticated;
