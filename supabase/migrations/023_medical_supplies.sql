-- =============================================================================
-- 023_medical_supplies.sql
-- Medical supplies inventory (consumables) + incident usage tracking.
-- Separate from security_equipment. Safe to re-run.
--
-- ROLE-PERMISSION MATRIX:
--   View supplies / usage / restock report → active church member (viewer+)
--   Create / update / archive / restock supplies
--     → owner | administrator | security_leader
--   Record supply usage on incidents
--     → owner | administrator | security_leader | security_member
--   Remove usage records (restores inventory)
--     → owner | administrator | security_leader
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE public.medical_supply_category AS ENUM (
    'gloves',
    'bandages',
    'dressings',
    'antiseptic',
    'medications',
    'respiratory',
    'splints',
    'bleeding_control',
    'protective_equipment',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Permission helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_manage_medical_supplies(requested_church_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_church_role(
    requested_church_id,
    ARRAY['owner', 'administrator', 'security_leader']
  );
$$;

CREATE OR REPLACE FUNCTION public.can_record_medical_supply_usage(requested_church_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_church_role(
    requested_church_id,
    ARRAY['owner', 'administrator', 'security_leader', 'security_member']
  );
$$;

REVOKE ALL ON FUNCTION public.can_manage_medical_supplies(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_record_medical_supply_usage(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_medical_supplies(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_record_medical_supply_usage(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Supplies catalog
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.medical_supplies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  name text NOT NULL,
  category public.medical_supply_category NOT NULL DEFAULT 'other'::public.medical_supply_category,
  unit text NOT NULL DEFAULT 'each',
  quantity_on_hand integer NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  minimum_quantity integer NOT NULL DEFAULT 0 CHECK (minimum_quantity >= 0),
  location_name text,
  sku text,
  vendor_name text,
  notes text,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT medical_supplies_name_len CHECK (char_length(name) <= 200),
  CONSTRAINT medical_supplies_unit_len CHECK (char_length(unit) <= 40)
);

CREATE INDEX IF NOT EXISTS medical_supplies_church_id_idx
  ON public.medical_supplies (church_id);

CREATE INDEX IF NOT EXISTS medical_supplies_low_stock_idx
  ON public.medical_supplies (church_id, quantity_on_hand, minimum_quantity)
  WHERE archived_at IS NULL;

DROP TRIGGER IF EXISTS medical_supplies_updated_at ON public.medical_supplies;
CREATE TRIGGER medical_supplies_updated_at
  BEFORE UPDATE ON public.medical_supplies
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.medical_supplies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view medical supplies" ON public.medical_supplies;
DROP POLICY IF EXISTS "Leaders can insert medical supplies" ON public.medical_supplies;
DROP POLICY IF EXISTS "Leaders can update medical supplies" ON public.medical_supplies;

CREATE POLICY "Members can view medical supplies"
  ON public.medical_supplies FOR SELECT TO authenticated
  USING (public.is_active_church_member(church_id));

CREATE POLICY "Leaders can insert medical supplies"
  ON public.medical_supplies FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_medical_supplies(church_id));

CREATE POLICY "Leaders can update medical supplies"
  ON public.medical_supplies FOR UPDATE TO authenticated
  USING (public.can_manage_medical_supplies(church_id))
  WITH CHECK (public.can_manage_medical_supplies(church_id));

REVOKE DELETE ON public.medical_supplies FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.medical_supplies TO authenticated;

-- ---------------------------------------------------------------------------
-- Usage linked to incidents (decrements inventory via trigger)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.medical_supply_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  incident_id uuid NOT NULL REFERENCES public.incidents (id) ON DELETE CASCADE,
  medical_supply_id uuid NOT NULL REFERENCES public.medical_supplies (id) ON DELETE RESTRICT,
  quantity_used integer NOT NULL CHECK (quantity_used > 0),
  recorded_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS medical_supply_usage_incident_idx
  ON public.medical_supply_usage (incident_id, created_at DESC);

CREATE INDEX IF NOT EXISTS medical_supply_usage_supply_idx
  ON public.medical_supply_usage (medical_supply_id, created_at DESC);

CREATE INDEX IF NOT EXISTS medical_supply_usage_church_id_idx
  ON public.medical_supply_usage (church_id);

CREATE OR REPLACE FUNCTION public.enforce_medical_supply_usage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_supply public.medical_supplies%ROWTYPE;
  v_incident public.incidents%ROWTYPE;
BEGIN
  SELECT * INTO v_incident
  FROM public.incidents WHERE id = NEW.incident_id;

  IF v_incident.id IS NULL THEN
    RAISE EXCEPTION 'VALIDATION: incident not found';
  END IF;

  IF v_incident.church_id <> NEW.church_id THEN
    RAISE EXCEPTION 'VALIDATION: incident must belong to the same church';
  END IF;

  IF v_incident.type <> 'medical'::public.incident_type THEN
    RAISE EXCEPTION 'VALIDATION: supplies can only be recorded on medical incidents';
  END IF;

  SELECT * INTO v_supply
  FROM public.medical_supplies
  WHERE id = NEW.medical_supply_id
    AND church_id = NEW.church_id
    AND archived_at IS NULL
  FOR UPDATE;

  IF v_supply.id IS NULL THEN
    RAISE EXCEPTION 'VALIDATION: medical supply not found or archived';
  END IF;

  IF v_supply.quantity_on_hand < NEW.quantity_used THEN
    RAISE EXCEPTION 'VALIDATION: insufficient quantity on hand (have %, need %)',
      v_supply.quantity_on_hand, NEW.quantity_used;
  END IF;

  UPDATE public.medical_supplies
  SET
    quantity_on_hand = quantity_on_hand - NEW.quantity_used,
    updated_at = now()
  WHERE id = NEW.medical_supply_id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_medical_supply_on_usage_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.medical_supplies
  SET
    quantity_on_hand = quantity_on_hand + OLD.quantity_used,
    updated_at = now()
  WHERE id = OLD.medical_supply_id
    AND church_id = OLD.church_id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS medical_supply_usage_apply ON public.medical_supply_usage;
CREATE TRIGGER medical_supply_usage_apply
  BEFORE INSERT ON public.medical_supply_usage
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_medical_supply_usage();

DROP TRIGGER IF EXISTS medical_supply_usage_restore ON public.medical_supply_usage;
CREATE TRIGGER medical_supply_usage_restore
  AFTER DELETE ON public.medical_supply_usage
  FOR EACH ROW
  EXECUTE FUNCTION public.restore_medical_supply_on_usage_delete();

ALTER TABLE public.medical_supply_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view medical supply usage" ON public.medical_supply_usage;
DROP POLICY IF EXISTS "Operators can insert medical supply usage" ON public.medical_supply_usage;
DROP POLICY IF EXISTS "Leaders can delete medical supply usage" ON public.medical_supply_usage;

CREATE POLICY "Members can view medical supply usage"
  ON public.medical_supply_usage FOR SELECT TO authenticated
  USING (public.is_active_church_member(church_id));

CREATE POLICY "Operators can insert medical supply usage"
  ON public.medical_supply_usage FOR INSERT TO authenticated
  WITH CHECK (
    public.can_record_medical_supply_usage(church_id)
    AND recorded_by = auth.uid()
  );

CREATE POLICY "Leaders can delete medical supply usage"
  ON public.medical_supply_usage FOR DELETE TO authenticated
  USING (public.can_manage_medical_supplies(church_id));

GRANT SELECT, INSERT, DELETE ON public.medical_supply_usage TO authenticated;
