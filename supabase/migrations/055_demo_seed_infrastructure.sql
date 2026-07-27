-- Demo seed infrastructure for the First Church of the First Church fixture.
-- Tracks seeded rows for idempotent upserts and safe cleanup.
-- Does not modify production churches that lack seed_source.

ALTER TABLE public.churches
  ADD COLUMN IF NOT EXISTS seed_source text;

ALTER TABLE public.churches
  DROP CONSTRAINT IF EXISTS churches_seed_source_format;

ALTER TABLE public.churches
  ADD CONSTRAINT churches_seed_source_format
  CHECK (
    seed_source IS NULL
    OR seed_source ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  );

CREATE UNIQUE INDEX IF NOT EXISTS churches_seed_source_uidx
  ON public.churches (seed_source)
  WHERE seed_source IS NOT NULL;

COMMENT ON COLUMN public.churches.seed_source IS
  'Stable demo/test marker (e.g. first-church-demo). Null for normal churches.';

CREATE TABLE IF NOT EXISTS public.demo_seed_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_source text NOT NULL,
  entity_table text NOT NULL,
  entity_id uuid NOT NULL,
  seed_key text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT demo_seed_records_seed_source_format
    CHECK (seed_source ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT demo_seed_records_entity_table_format
    CHECK (entity_table ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT demo_seed_records_seed_key_len
    CHECK (char_length(seed_key) BETWEEN 1 AND 200)
);

CREATE UNIQUE INDEX IF NOT EXISTS demo_seed_records_source_key_uidx
  ON public.demo_seed_records (seed_source, seed_key);

CREATE UNIQUE INDEX IF NOT EXISTS demo_seed_records_source_table_id_uidx
  ON public.demo_seed_records (seed_source, entity_table, entity_id);

CREATE INDEX IF NOT EXISTS demo_seed_records_source_table_idx
  ON public.demo_seed_records (seed_source, entity_table);

ALTER TABLE public.demo_seed_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Demo seed records platform only" ON public.demo_seed_records;
-- No authenticated policies: service_role / SQL only.

GRANT ALL ON public.demo_seed_records TO service_role;
REVOKE ALL ON public.demo_seed_records FROM PUBLIC;
REVOKE ALL ON public.demo_seed_records FROM authenticated;
REVOKE ALL ON public.demo_seed_records FROM anon;
