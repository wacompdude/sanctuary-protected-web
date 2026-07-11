-- Security events (devices / sensors / cameras)
-- Safe to re-run against an existing project.

DO $$ BEGIN
  CREATE TYPE event_type AS ENUM (
    'motion',
    'door',
    'tamper',
    'offline',
    'alarm',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE event_severity AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE acknowledgment_status AS ENUM ('unacknowledged', 'acknowledged');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL REFERENCES churches (id) ON DELETE RESTRICT,
  device TEXT NOT NULL,
  event_type event_type NOT NULL DEFAULT 'other',
  severity event_severity NOT NULL DEFAULT 'low',
  event_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  location TEXT NOT NULL,
  acknowledgment_status acknowledgment_status NOT NULL DEFAULT 'unacknowledged',
  acknowledged_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE events ADD COLUMN IF NOT EXISTS church_id UUID;
ALTER TABLE events ADD COLUMN IF NOT EXISTS device TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_type event_type DEFAULT 'other';
ALTER TABLE events ADD COLUMN IF NOT EXISTS severity event_severity DEFAULT 'low';
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_timestamp TIMESTAMPTZ DEFAULT now();
ALTER TABLE events ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS acknowledgment_status acknowledgment_status DEFAULT 'unacknowledged';
ALTER TABLE events ADD COLUMN IF NOT EXISTS acknowledged_by UUID;
ALTER TABLE events ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;
ALTER TABLE events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS events_church_id_idx ON events (church_id);
CREATE INDEX IF NOT EXISTS events_event_timestamp_idx ON events (event_timestamp DESC);
CREATE INDEX IF NOT EXISTS events_ack_status_idx ON events (acknowledgment_status);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view church events" ON events;
CREATE POLICY "Users can view church events"
  ON events FOR SELECT
  USING (church_id = public.user_church_id());

DROP POLICY IF EXISTS "Users can acknowledge church events" ON events;
CREATE POLICY "Users can acknowledge church events"
  ON events FOR UPDATE
  USING (church_id = public.user_church_id())
  WITH CHECK (church_id = public.user_church_id());

-- Inserts typically come from integrations; allow leaders to create test events
DROP POLICY IF EXISTS "Leaders can create events" ON events;
CREATE POLICY "Leaders can create events"
  ON events FOR INSERT
  WITH CHECK (
    church_id = public.user_church_id()
    AND public.can_manage_certifications()
  );

GRANT USAGE ON TYPE event_type TO anon, authenticated;
GRANT USAGE ON TYPE event_severity TO anon, authenticated;
GRANT USAGE ON TYPE acknowledgment_status TO anon, authenticated;
GRANT SELECT, UPDATE ON events TO authenticated;
GRANT INSERT ON events TO authenticated;
