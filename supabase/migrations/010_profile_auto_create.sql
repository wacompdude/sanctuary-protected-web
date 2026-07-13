-- =============================================================================
-- 010_profile_auto_create.sql
-- Automatic profile creation after Supabase Auth signup + locked-down RLS.
-- Safe to re-run.
-- =============================================================================

-- Ensure profile identity columns exist
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE public.profiles
SET created_at = COALESCE(created_at, now()),
    updated_at = COALESCE(updated_at, now())
WHERE created_at IS NULL OR updated_at IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

DO $$
BEGIN
  ALTER TABLE public.profiles ALTER COLUMN created_at SET NOT NULL;
  ALTER TABLE public.profiles ALTER COLUMN updated_at SET NOT NULL;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'profiles timestamp NOT NULL skipped: %', SQLERRM;
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

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Protect immutable profile columns (id, created_at)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_profile_immutable_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Users cannot change their user ID or created_at
  NEW.id := OLD.id;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_immutable ON public.profiles;
CREATE TRIGGER profiles_protect_immutable
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_immutable_columns();

-- ---------------------------------------------------------------------------
-- Auto-create profile when an auth user is created
-- Reads optional first_name / last_name / full_name from raw_user_meta_data.
-- Failures are logged but do not block Auth user creation.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  v_first text;
  v_last text;
  v_full text;
BEGIN
  v_first := NULLIF(TRIM(BOTH FROM COALESCE(meta ->> 'first_name', '')), '');
  v_last := NULLIF(TRIM(BOTH FROM COALESCE(meta ->> 'last_name', '')), '');
  v_full := NULLIF(TRIM(BOTH FROM COALESCE(meta ->> 'full_name', '')), '');

  -- Fallback: split full_name when first/last not provided
  IF v_first IS NULL AND v_full IS NOT NULL THEN
    v_first := NULLIF(SPLIT_PART(v_full, ' ', 1), '');
    v_last := NULLIF(
      TRIM(BOTH FROM SUBSTRING(v_full FROM LENGTH(SPLIT_PART(v_full, ' ', 1)) + 1)),
      ''
    );
  END IF;

  BEGIN
    INSERT INTO public.profiles (
      id,
      first_name,
      last_name,
      full_name,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      v_first,
      v_last,
      COALESCE(v_full, NULLIF(TRIM(BOTH FROM CONCAT_WS(' ', v_first, v_last)), '')),
      now(),
      now()
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- Never block auth signup because profile insert failed
    RAISE WARNING 'handle_new_user_profile failed for %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_profile();

-- Backfill profiles for existing auth users that are missing one
INSERT INTO public.profiles (id, first_name, last_name, full_name, created_at, updated_at)
SELECT
  u.id,
  NULLIF(TRIM(BOTH FROM COALESCE(u.raw_user_meta_data ->> 'first_name', '')), ''),
  NULLIF(TRIM(BOTH FROM COALESCE(u.raw_user_meta_data ->> 'last_name', '')), ''),
  NULLIF(
    TRIM(
      BOTH FROM COALESCE(
        u.raw_user_meta_data ->> 'full_name',
        CONCAT_WS(
          ' ',
          u.raw_user_meta_data ->> 'first_name',
          u.raw_user_meta_data ->> 'last_name'
        )
      )
    ),
    ''
  ),
  COALESCE(u.created_at, now()),
  now()
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = u.id
)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- RLS: own profile only; no church/role assignment via profiles
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Allow update of own row only. Immutable id enforced by trigger.
-- Church membership / roles live on church_memberships, not profiles.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Client insert is a fallback if the trigger did not run; only own id.
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- No DELETE policy — users cannot delete profiles via the API role
DROP POLICY IF EXISTS "Users can delete own profile" ON public.profiles;

GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT INSERT ON public.profiles TO authenticated;
REVOKE DELETE ON public.profiles FROM authenticated;

-- ---------------------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------------------
-- Registration should pass metadata, e.g.:
--   signUp({ email, password, options: { data: { first_name, last_name } } })
-- Church assignment and roles must go through church_memberships / invitations,
-- never through profiles.
