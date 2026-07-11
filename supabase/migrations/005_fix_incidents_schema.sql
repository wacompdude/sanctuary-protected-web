-- Repair migration: align incidents + incident_updates with app schema.
-- Run this if you see errors like "column incidents.occurred_at does not exist".

-- Enum types (safe if already created)
DO $$ BEGIN
  CREATE TYPE incident_type AS ENUM (
    'security', 'medical', 'fire', 'theft', 'vandalism', 'disturbance', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE incident_severity AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE incident_status AS ENUM ('open', 'investigating', 'resolved', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE incident_update_type AS ENUM ('created', 'comment', 'status_change');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Incidents table (create if missing)
CREATE TABLE IF NOT EXISTS incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL REFERENCES churches (id) ON DELETE RESTRICT,
  created_by UUID NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  type incident_type NOT NULL DEFAULT 'other',
  severity incident_severity NOT NULL DEFAULT 'low',
  status incident_status NOT NULL DEFAULT 'open',
  location TEXT NOT NULL DEFAULT 'Unknown',
  description TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add any missing columns on an existing incidents table
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS church_id UUID;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS type incident_type DEFAULT 'other';
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS severity incident_severity DEFAULT 'low';
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS status incident_status DEFAULT 'open';
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS location TEXT DEFAULT 'Unknown';
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill occurred_at from legacy column names if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'incidents' AND column_name = 'reported_at'
  ) THEN
    EXECUTE 'UPDATE incidents SET occurred_at = reported_at WHERE occurred_at IS NULL';
  END IF;
END $$;

UPDATE incidents
SET occurred_at = COALESCE(occurred_at, created_at, now())
WHERE occurred_at IS NULL;

UPDATE incidents SET title = 'Untitled incident' WHERE title IS NULL;
UPDATE incidents SET location = 'Unknown' WHERE location IS NULL;
UPDATE incidents SET type = 'other' WHERE type IS NULL;
UPDATE incidents SET severity = 'low' WHERE severity IS NULL;
UPDATE incidents SET status = 'open' WHERE status IS NULL;

-- Incident updates table
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

ALTER TABLE incident_updates ADD COLUMN IF NOT EXISTS church_id UUID;
ALTER TABLE incident_updates ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE incident_updates ADD COLUMN IF NOT EXISTS update_type incident_update_type DEFAULT 'comment';
ALTER TABLE incident_updates ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE incident_updates ADD COLUMN IF NOT EXISTS previous_status incident_status;
ALTER TABLE incident_updates ADD COLUMN IF NOT EXISTS new_status incident_status;
ALTER TABLE incident_updates ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Indexes
CREATE INDEX IF NOT EXISTS incidents_church_id_idx ON incidents (church_id);
CREATE INDEX IF NOT EXISTS incidents_occurred_at_idx ON incidents (occurred_at DESC);
CREATE INDEX IF NOT EXISTS incident_updates_incident_id_idx ON incident_updates (incident_id);

-- Updated_at trigger
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

-- RLS
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view church incidents" ON incidents;
CREATE POLICY "Users can view church incidents"
  ON incidents FOR SELECT
  USING (
    church_id IN (SELECT church_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can create church incidents" ON incidents;
CREATE POLICY "Users can create church incidents"
  ON incidents FOR INSERT
  WITH CHECK (
    church_id IN (SELECT church_id FROM profiles WHERE id = auth.uid())
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "Users can update church incidents" ON incidents;
CREATE POLICY "Users can update church incidents"
  ON incidents FOR UPDATE
  USING (
    church_id IN (SELECT church_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can view church incident updates" ON incident_updates;
CREATE POLICY "Users can view church incident updates"
  ON incident_updates FOR SELECT
  USING (
    church_id IN (SELECT church_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can create church incident updates" ON incident_updates;
CREATE POLICY "Users can create church incident updates"
  ON incident_updates FOR INSERT
  WITH CHECK (
    church_id IN (SELECT church_id FROM profiles WHERE id = auth.uid())
    AND created_by = auth.uid()
  );

-- Grants
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON incidents TO authenticated;
GRANT SELECT, INSERT ON incident_updates TO authenticated;
GRANT USAGE ON TYPE incident_type TO anon, authenticated;
GRANT USAGE ON TYPE incident_severity TO anon, authenticated;
GRANT USAGE ON TYPE incident_status TO anon, authenticated;
GRANT USAGE ON TYPE incident_update_type TO anon, authenticated;
