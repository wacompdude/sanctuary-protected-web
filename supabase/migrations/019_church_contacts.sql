-- =============================================================================
-- 019_church_contacts.sql
-- Role-based church contact directory (leadership, security, vendors).
-- Safe to re-run.
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE public.church_contact_type AS ENUM (
    'head_pastor',
    'elder_board',
    'facility_maintenance_lead',
    'it_cybersecurity_lead',
    'head_of_security',
    'police_non_emergency',
    'alarm_company',
    'insurance_company',
    'facility_vendors',
    'hardware_vendors',
    'av_technician'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.church_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  contact_type public.church_contact_type NOT NULL,
  organization_name text,
  full_name text,
  phone text,
  email text,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT church_contacts_has_identity_check CHECK (
    length(trim(coalesce(organization_name, ''))) > 0
    OR length(trim(coalesce(full_name, ''))) > 0
    OR length(trim(coalesce(phone, ''))) > 0
    OR length(trim(coalesce(email, ''))) > 0
  ),
  CONSTRAINT church_contacts_notes_length_check CHECK (
    notes IS NULL OR char_length(notes) <= 2000
  )
);

-- One row per singleton contact type per church; vendors may have many rows.
CREATE UNIQUE INDEX IF NOT EXISTS church_contacts_singleton_uidx
  ON public.church_contacts (church_id, contact_type)
  WHERE contact_type NOT IN (
    'facility_vendors'::public.church_contact_type,
    'hardware_vendors'::public.church_contact_type
  );

CREATE INDEX IF NOT EXISTS church_contacts_church_id_idx
  ON public.church_contacts (church_id);

CREATE INDEX IF NOT EXISTS church_contacts_church_type_idx
  ON public.church_contacts (church_id, contact_type);

DROP TRIGGER IF EXISTS church_contacts_updated_at ON public.church_contacts;
CREATE TRIGGER church_contacts_updated_at
  BEFORE UPDATE ON public.church_contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.church_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read church contacts" ON public.church_contacts;
DROP POLICY IF EXISTS "Managers can insert church contacts" ON public.church_contacts;
DROP POLICY IF EXISTS "Managers can update church contacts" ON public.church_contacts;
DROP POLICY IF EXISTS "Managers can delete church contacts" ON public.church_contacts;

CREATE POLICY "Members can read church contacts"
  ON public.church_contacts
  FOR SELECT
  TO authenticated
  USING (
    public.is_active_church_member(church_id)
    OR public.is_church_owner(church_id)
  );

CREATE POLICY "Managers can insert church contacts"
  ON public.church_contacts
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_church_settings(church_id));

CREATE POLICY "Managers can update church contacts"
  ON public.church_contacts
  FOR UPDATE
  TO authenticated
  USING (public.can_manage_church_settings(church_id))
  WITH CHECK (public.can_manage_church_settings(church_id));

CREATE POLICY "Managers can delete church contacts"
  ON public.church_contacts
  FOR DELETE
  TO authenticated
  USING (public.can_manage_church_settings(church_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.church_contacts TO authenticated;

COMMENT ON TABLE public.church_contacts IS
  'Role-based church contact directory. Singleton types are unique per church; vendor types allow multiple rows.';
