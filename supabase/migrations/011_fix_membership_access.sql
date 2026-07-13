-- =============================================================================
-- 011_fix_membership_access.sql
-- Ensures authenticated users can read their own memberships and churches.
-- Run if dashboard says "not linked to an active church" despite a membership row.
-- Safe to re-run.
-- =============================================================================

GRANT SELECT, INSERT, UPDATE ON public.church_memberships TO authenticated;
GRANT SELECT ON public.churches TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;

ALTER TABLE public.church_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.churches ENABLE ROW LEVEL SECURITY;

-- Simple, non-recursive read policy for own memberships
DROP POLICY IF EXISTS "Users can read own memberships" ON public.church_memberships;
CREATE POLICY "Users can read own memberships"
  ON public.church_memberships
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Keep manager policies if helpers exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'can_manage_certifications_for_church'
  ) THEN
    DROP POLICY IF EXISTS "Managers can insert memberships" ON public.church_memberships;
    CREATE POLICY "Managers can insert memberships"
      ON public.church_memberships FOR INSERT
      TO authenticated
      WITH CHECK (public.can_manage_certifications_for_church(church_id));

    DROP POLICY IF EXISTS "Managers can update memberships" ON public.church_memberships;
    CREATE POLICY "Managers can update memberships"
      ON public.church_memberships FOR UPDATE
      TO authenticated
      USING (public.can_manage_certifications_for_church(church_id))
      WITH CHECK (public.can_manage_certifications_for_church(church_id));
  END IF;
END $$;

-- Church readable when user has invited/active membership (no helper recursion)
DROP POLICY IF EXISTS "Users can read their church" ON public.churches;
DROP POLICY IF EXISTS "Users can read own church" ON public.churches;
CREATE POLICY "Users can read their church"
  ON public.churches
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.church_memberships m
      WHERE m.church_id = churches.id
        AND m.user_id = auth.uid()
        AND m.status IN (
          'invited'::public.membership_status,
          'active'::public.membership_status
        )
    )
  );

-- Diagnostic helper (run as your logged-in user in the app, or check as service role):
-- SELECT auth.uid();
-- SELECT * FROM church_memberships WHERE user_id = auth.uid();
-- SELECT id, name, status FROM churches;
