-- =============================================================================
-- 050_safety_concern_profiles_rls_insert_fix.sql
-- Fix Safety Concern Profile INSERT / SELECT RLS that blocked create.
--
-- Issues addressed:
--   1. INSERT required created_by = auth.uid() in WITH CHECK (brittle with
--      PostgREST / schema-cache edge cases). Align with medical supplies:
--      managers may insert when can_manage_safety_concerns(church_id).
--   2. SELECT after INSERT (...returning) used only can_view_safety_concern_profile,
--      which could fail before campus junction rows existed for some scopes.
--      Managers may SELECT any profile in their church directly.
--
-- Additive. Safe to re-run.
-- =============================================================================

-- Managers short-circuit visibility (campus junction not required).
CREATE OR REPLACE FUNCTION public.can_view_safety_concern_profile(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.safety_concern_profiles p
    WHERE p.id = p_profile_id
      AND (
        public.can_manage_safety_concerns(p.church_id)
        OR (
          public.can_view_safety_concerns(p.church_id)
          AND p.profile_status IN (
            'active'::public.safety_concern_profile_status,
            'expired'::public.safety_concern_profile_status,
            'under_review'::public.safety_concern_profile_status
          )
          AND (
            p.scope_type = 'church_wide'::public.safety_concern_scope_type
            OR public.has_church_wide_campus_ops_access(p.church_id)
            OR EXISTS (
              SELECT 1
              FROM public.safety_concern_profile_campuses pc
              WHERE pc.profile_id = p.id
                AND public.can_access_campus(pc.campus_id)
            )
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_view_safety_concern_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_safety_concern_profile(uuid) TO authenticated;

-- Ensure created_by is always the acting user when omitted.
CREATE OR REPLACE FUNCTION public.set_safety_concern_profile_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.created_by IS NULL THEN
      NEW.created_by := auth.uid();
    END IF;
    IF NEW.updated_by IS NULL THEN
      NEW.updated_by := auth.uid();
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.updated_by IS NULL THEN
      NEW.updated_by := auth.uid();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS safety_concern_profiles_set_actor
  ON public.safety_concern_profiles;
CREATE TRIGGER safety_concern_profiles_set_actor
  BEFORE INSERT OR UPDATE ON public.safety_concern_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_safety_concern_profile_actor();

DROP POLICY IF EXISTS "Authorized members can view safety concern profiles"
  ON public.safety_concern_profiles;
DROP POLICY IF EXISTS "Managers can insert safety concern profiles"
  ON public.safety_concern_profiles;
DROP POLICY IF EXISTS "Managers can update safety concern profiles"
  ON public.safety_concern_profiles;

CREATE POLICY "Authorized members can view safety concern profiles"
  ON public.safety_concern_profiles
  FOR SELECT
  TO authenticated
  USING (
    public.can_manage_safety_concerns(church_id)
    OR public.can_view_safety_concern_profile(id)
  );

CREATE POLICY "Managers can insert safety concern profiles"
  ON public.safety_concern_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_safety_concerns(church_id));

CREATE POLICY "Managers can update safety concern profiles"
  ON public.safety_concern_profiles
  FOR UPDATE
  TO authenticated
  USING (public.can_manage_safety_concerns(church_id))
  WITH CHECK (public.can_manage_safety_concerns(church_id));
