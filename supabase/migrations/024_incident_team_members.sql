-- =============================================================================
-- 024_incident_team_members.sql
-- Track multiple church team members involved in an incident.
-- Safe to re-run.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.can_manage_incident_members(
  requested_church_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_church_role(
    requested_church_id,
    ARRAY[
      'owner',
      'administrator',
      'security_leader',
      'security_member'
    ]
  );
$$;

CREATE TABLE IF NOT EXISTS public.incident_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  incident_id uuid NOT NULL REFERENCES public.incidents (id) ON DELETE CASCADE,
  membership_id uuid NOT NULL REFERENCES public.church_memberships (id) ON DELETE RESTRICT,
  added_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT incident_team_members_unique_member UNIQUE (incident_id, membership_id)
);

CREATE INDEX IF NOT EXISTS incident_team_members_church_idx
  ON public.incident_team_members (church_id, created_at DESC);

CREATE INDEX IF NOT EXISTS incident_team_members_incident_idx
  ON public.incident_team_members (incident_id, created_at ASC);

CREATE INDEX IF NOT EXISTS incident_team_members_membership_idx
  ON public.incident_team_members (membership_id);

CREATE OR REPLACE FUNCTION public.enforce_incident_team_member_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_incident_church_id uuid;
  v_membership_church_id uuid;
BEGIN
  SELECT church_id
  INTO v_incident_church_id
  FROM public.incidents
  WHERE id = NEW.incident_id;

  IF v_incident_church_id IS NULL THEN
    RAISE EXCEPTION 'INCIDENT_NOT_FOUND';
  END IF;

  SELECT church_id
  INTO v_membership_church_id
  FROM public.church_memberships
  WHERE id = NEW.membership_id;

  IF v_membership_church_id IS NULL THEN
    RAISE EXCEPTION 'MEMBERSHIP_NOT_FOUND';
  END IF;

  IF NEW.church_id <> v_incident_church_id OR NEW.church_id <> v_membership_church_id THEN
    RAISE EXCEPTION 'INCIDENT_MEMBER_CHURCH_MISMATCH';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS incident_team_members_scope_guard
  ON public.incident_team_members;
CREATE TRIGGER incident_team_members_scope_guard
  BEFORE INSERT OR UPDATE ON public.incident_team_members
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_incident_team_member_scope();

ALTER TABLE public.incident_team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Incident team members are viewable by church members"
  ON public.incident_team_members;
CREATE POLICY "Incident team members are viewable by church members"
  ON public.incident_team_members
  FOR SELECT
  USING (public.is_active_church_member(church_id));

DROP POLICY IF EXISTS "Incident team members are managed by security team"
  ON public.incident_team_members;
CREATE POLICY "Incident team members are managed by security team"
  ON public.incident_team_members
  FOR INSERT
  WITH CHECK (
    public.can_manage_incident_members(church_id)
    AND added_by = auth.uid()
  );

DROP POLICY IF EXISTS "Incident team members can be removed by security team"
  ON public.incident_team_members;
CREATE POLICY "Incident team members can be removed by security team"
  ON public.incident_team_members
  FOR DELETE
  USING (public.can_manage_incident_members(church_id));

GRANT SELECT, INSERT, DELETE ON public.incident_team_members TO authenticated;
