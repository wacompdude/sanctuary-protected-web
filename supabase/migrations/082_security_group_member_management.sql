-- =============================================================================
-- 082_security_group_member_management.sql
-- Extend security group membership for role member management workflows.
-- =============================================================================

ALTER TABLE public.security_groups
  ADD COLUMN IF NOT EXISTS high_risk boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.security_groups.high_risk IS
  'When true, member assignment requires reason and extra confirmation.';

ALTER TABLE public.security_group_members
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS campus_id uuid REFERENCES public.campuses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scope_type public.permission_scope_type NOT NULL DEFAULT 'all_current_future_campuses',
  ADD COLUMN IF NOT EXISTS assignment_reason text,
  ADD COLUMN IF NOT EXISTS administrative_notes text,
  ADD COLUMN IF NOT EXISTS revocation_reason text,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone;

-- Backfill organization_id from parent group
UPDATE public.security_group_members sgm
SET organization_id = sg.organization_id
FROM public.security_groups sg
WHERE sgm.security_group_id = sg.id
  AND sgm.organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_security_group_members_organization_id
  ON public.security_group_members(organization_id);

CREATE INDEX IF NOT EXISTS idx_security_group_members_campus_id
  ON public.security_group_members(campus_id);

-- Extend audit event types for member lifecycle updates
DO $$ BEGIN
  ALTER TYPE public.security_audit_event_type ADD VALUE IF NOT EXISTS 'security_group_member.updated';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.security_audit_event_type ADD VALUE IF NOT EXISTS 'security_group_member.extended';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.security_audit_event_type ADD VALUE IF NOT EXISTS 'security_group_member.revoked';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Keep organization_id in sync on insert
CREATE OR REPLACE FUNCTION public.security_group_members_set_organization_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT organization_id INTO NEW.organization_id
    FROM public.security_groups
    WHERE id = NEW.security_group_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS security_group_members_set_organization_id ON public.security_group_members;
CREATE TRIGGER security_group_members_set_organization_id
  BEFORE INSERT OR UPDATE OF security_group_id ON public.security_group_members
  FOR EACH ROW
  EXECUTE FUNCTION public.security_group_members_set_organization_id();
