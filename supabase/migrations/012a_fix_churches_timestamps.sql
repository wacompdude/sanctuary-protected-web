-- =============================================================================
-- 012a_fix_churches_timestamps.sql
-- Fixes: column "updated_at" of relation "churches" does not exist
-- during create_church_with_owner. Safe to re-run.
-- =============================================================================

ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS primary_email TEXT;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS address_line_1 TEXT;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS address_line_2 TEXT;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS timezone TEXT;

DO $$ BEGIN
  CREATE TYPE public.church_status AS ENUM ('trial', 'active', 'suspended', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS status public.church_status;

UPDATE public.churches
SET
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, now()),
  timezone = COALESCE(timezone, 'America/Los_Angeles'),
  status = COALESCE(status, 'trial'::public.church_status)
WHERE created_at IS NULL
   OR updated_at IS NULL
   OR timezone IS NULL
   OR status IS NULL;

ALTER TABLE public.churches
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN timezone SET DEFAULT 'America/Los_Angeles',
  ALTER COLUMN status SET DEFAULT 'trial'::public.church_status;

DO $$
BEGIN
  ALTER TABLE public.churches ALTER COLUMN created_at SET NOT NULL;
  ALTER TABLE public.churches ALTER COLUMN updated_at SET NOT NULL;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'churches timestamp NOT NULL skipped: %', SQLERRM;
END $$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS churches_updated_at ON public.churches;
CREATE TRIGGER churches_updated_at
  BEFORE UPDATE ON public.churches
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Ensure slug uniqueness helpers still work for onboarding
UPDATE public.churches
SET slug = 'church-' || SUBSTRING(REPLACE(id::text, '-', '') FROM 1 FOR 8)
WHERE slug IS NULL OR trim(slug) = '';

DO $$
BEGIN
  ALTER TABLE public.churches ALTER COLUMN slug SET NOT NULL;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'churches.slug NOT NULL skipped: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'churches_slug_key'
  ) THEN
    ALTER TABLE public.churches ADD CONSTRAINT churches_slug_key UNIQUE (slug);
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'churches_slug_key skipped: %', SQLERRM;
END $$;
