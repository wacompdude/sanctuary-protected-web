-- =============================================================================
-- 022_security_equipment.sql
-- Security Hardware & Equipment Management — schema, RLS, storage, settings.
-- Safe to re-run. No hard-delete of equipment rows (archive via status/archived_at).
--
-- ROLE-PERMISSION MATRIX (enforced in RLS + app):
--   View equipment / attachments / maintenance / assignments / relationships
--     → active church member (viewer+)
--   Create / update equipment, archive/restore, manage relationships, settings
--     → owner | administrator | security_leader
--     (helpers: can_manage_security_equipment)
--   Insert maintenance logs, complete inspections, checkout/return assignments
--     → owner | administrator | security_leader | security_member
--     (helpers: can_operate_security_equipment)
--   Hard DELETE on security_equipment
--     → none (REVOKE DELETE; use retired/archived)
--
-- DATA-MIGRATION RISKS:
--   - Greenfield: no existing equipment/camera/sensor inventory rows to migrate.
--   - Events.device remains free-text (no FK) — do not auto-link.
--   - Campus FK optional; invalid campus_id rejected by trigger.
--   - Re-run updates storage.buckets limits via ON CONFLICT.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.equipment_category AS ENUM (
    'radio',
    'camera',
    'video_recorder',
    'network_device',
    'access_control',
    'alarm_system',
    'panic_button',
    'sensor',
    'power_backup',
    'first_response',
    'computer',
    'mobile_device',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.equipment_status AS ENUM (
    'planned',
    'ordered',
    'received',
    'active',
    'maintenance',
    'out_of_service',
    'retired',
    'lost',
    'stolen',
    'disposed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.equipment_criticality AS ENUM (
    'low',
    'medium',
    'high',
    'critical'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.equipment_relationship_type AS ENUM (
    'connected_to',
    'managed_by',
    'records_to',
    'powered_by',
    'monitored_by',
    'assigned_with',
    'gateway_for',
    'controller_for',
    'backup_for',
    'replaces',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.equipment_assignment_status AS ENUM (
    'active',
    'returned',
    'lost',
    'damaged',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.equipment_maintenance_type AS ENUM (
    'inspection',
    'preventive_maintenance',
    'repair',
    'firmware_update',
    'battery_replacement',
    'calibration',
    'cleaning',
    'functional_test',
    'configuration_backup',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.equipment_maintenance_status AS ENUM (
    'scheduled',
    'in_progress',
    'completed',
    'deferred',
    'cancelled',
    'failed_inspection'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.equipment_attachment_kind AS ENUM (
    'photo',
    'manual',
    'warranty',
    'receipt',
    'maintenance',
    'configuration_reference',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Permission helpers (reuse has_church_role / is_active_church_member)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_manage_security_equipment(requested_church_id uuid)
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

CREATE OR REPLACE FUNCTION public.can_operate_security_equipment(requested_church_id uuid)
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

REVOKE ALL ON FUNCTION public.can_manage_security_equipment(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_operate_security_equipment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_security_equipment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_operate_security_equipment(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Church-level hardware settings (org config — not per-asset)
-- ---------------------------------------------------------------------------

ALTER TABLE public.churches
  ADD COLUMN IF NOT EXISTS equipment_warranty_warning_days integer NOT NULL DEFAULT 90;

ALTER TABLE public.churches
  ADD COLUMN IF NOT EXISTS equipment_replacement_warning_days integer NOT NULL DEFAULT 180;

ALTER TABLE public.churches
  ADD COLUMN IF NOT EXISTS equipment_asset_tag_prefix text NOT NULL DEFAULT 'SP';

DO $$ BEGIN
  ALTER TABLE public.churches
    ADD CONSTRAINT churches_equipment_warranty_warning_days_check
    CHECK (equipment_warranty_warning_days BETWEEN 1 AND 730);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.churches
    ADD CONSTRAINT churches_equipment_replacement_warning_days_check
    CHECK (equipment_replacement_warning_days BETWEEN 1 AND 1825);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN public.churches.equipment_warranty_warning_days IS
  'Days before warranty expiration to flag on Security Hardware dashboards.';
COMMENT ON COLUMN public.churches.equipment_replacement_warning_days IS
  'Days before expected replacement date to flag on Security Hardware dashboards.';
COMMENT ON COLUMN public.churches.equipment_asset_tag_prefix IS
  'Prefix for generated asset tags (e.g. SP-MAIN-RAD-0001).';

-- ---------------------------------------------------------------------------
-- Core inventory
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.security_equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  campus_id uuid REFERENCES public.campuses (id) ON DELETE SET NULL,
  category public.equipment_category NOT NULL,
  subcategory text,
  name text NOT NULL,
  description text,
  asset_tag text,
  manufacturer text,
  model text,
  serial_number text,
  status public.equipment_status NOT NULL DEFAULT 'planned'::public.equipment_status,
  criticality public.equipment_criticality NOT NULL DEFAULT 'medium'::public.equipment_criticality,
  location_name text,
  building text,
  floor text,
  room text,
  installation_area text,
  assigned_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  assigned_team text,
  responsible_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  purchase_date date,
  purchase_price numeric(12, 2),
  vendor_name text,
  vendor_contact text,
  warranty_expiration date,
  installed_date date,
  last_inspected_at timestamptz,
  next_inspection_at timestamptz,
  last_maintenance_at timestamptz,
  next_maintenance_at timestamptz,
  expected_replacement_date date,
  replacement_cost_estimate numeric(12, 2),
  notes text,
  photo_path text,
  manual_path text,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT security_equipment_name_length_check
    CHECK (char_length(trim(name)) BETWEEN 1 AND 200),
  CONSTRAINT security_equipment_notes_length_check
    CHECK (notes IS NULL OR char_length(notes) <= 5000),
  CONSTRAINT security_equipment_purchase_price_check
    CHECK (purchase_price IS NULL OR purchase_price >= 0),
  CONSTRAINT security_equipment_replacement_cost_check
    CHECK (replacement_cost_estimate IS NULL OR replacement_cost_estimate >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS security_equipment_church_asset_tag_uidx
  ON public.security_equipment (church_id, lower(asset_tag))
  WHERE asset_tag IS NOT NULL AND length(trim(asset_tag)) > 0;

CREATE INDEX IF NOT EXISTS security_equipment_church_id_idx
  ON public.security_equipment (church_id);

CREATE INDEX IF NOT EXISTS security_equipment_campus_id_idx
  ON public.security_equipment (campus_id);

CREATE INDEX IF NOT EXISTS security_equipment_category_idx
  ON public.security_equipment (church_id, category);

CREATE INDEX IF NOT EXISTS security_equipment_status_idx
  ON public.security_equipment (church_id, status);

CREATE INDEX IF NOT EXISTS security_equipment_criticality_idx
  ON public.security_equipment (church_id, criticality);

CREATE INDEX IF NOT EXISTS security_equipment_next_maintenance_idx
  ON public.security_equipment (church_id, next_maintenance_at);

CREATE INDEX IF NOT EXISTS security_equipment_warranty_idx
  ON public.security_equipment (church_id, warranty_expiration);

CREATE INDEX IF NOT EXISTS security_equipment_replacement_idx
  ON public.security_equipment (church_id, expected_replacement_date);

CREATE INDEX IF NOT EXISTS security_equipment_archived_idx
  ON public.security_equipment (church_id, archived_at);

CREATE INDEX IF NOT EXISTS security_equipment_search_name_idx
  ON public.security_equipment (church_id, lower(name));

DROP TRIGGER IF EXISTS security_equipment_updated_at ON public.security_equipment;
CREATE TRIGGER security_equipment_updated_at
  BEFORE UPDATE ON public.security_equipment
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Campus must belong to the same church
CREATE OR REPLACE FUNCTION public.enforce_equipment_campus_church()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.campus_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.campuses c
    WHERE c.id = NEW.campus_id
      AND c.church_id = NEW.church_id
  ) THEN
    RAISE EXCEPTION 'VALIDATION: campus does not belong to this church';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS security_equipment_campus_church ON public.security_equipment;
CREATE TRIGGER security_equipment_campus_church
  BEFORE INSERT OR UPDATE OF campus_id, church_id
  ON public.security_equipment
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_equipment_campus_church();

ALTER TABLE public.security_equipment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view security equipment" ON public.security_equipment;
DROP POLICY IF EXISTS "Leaders can insert security equipment" ON public.security_equipment;
DROP POLICY IF EXISTS "Leaders can update security equipment" ON public.security_equipment;

CREATE POLICY "Members can view security equipment"
  ON public.security_equipment
  FOR SELECT
  TO authenticated
  USING (public.is_active_church_member(church_id));

CREATE POLICY "Leaders can insert security equipment"
  ON public.security_equipment
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_security_equipment(church_id));

CREATE POLICY "Leaders can update security equipment"
  ON public.security_equipment
  FOR UPDATE
  TO authenticated
  USING (public.can_manage_security_equipment(church_id))
  WITH CHECK (public.can_manage_security_equipment(church_id));

-- Intentionally no DELETE policy — archive instead.
REVOKE ALL ON TABLE public.security_equipment FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.security_equipment TO authenticated;

-- ---------------------------------------------------------------------------
-- Category detail tables (1:1 via UNIQUE equipment_id + denormalized church_id)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.radio_details (
  equipment_id uuid PRIMARY KEY REFERENCES public.security_equipment (id) ON DELETE CASCADE,
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  radio_type text,
  frequency_band text,
  channel_plan_name text,
  number_of_channels integer,
  digital_or_analog text,
  encryption_capable boolean,
  encryption_enabled boolean,
  fcc_license_reference text,
  call_sign text,
  programming_profile text,
  battery_type text,
  spare_battery_count integer,
  charger_type text,
  earpiece_available boolean,
  shoulder_microphone_available boolean,
  assigned_call_sign text,
  assigned_team_position text,
  last_programming_date date,
  firmware_version text,
  radio_id text,
  notes text,
  CONSTRAINT radio_details_channels_check
    CHECK (number_of_channels IS NULL OR number_of_channels >= 0),
  CONSTRAINT radio_details_spare_batteries_check
    CHECK (spare_battery_count IS NULL OR spare_battery_count >= 0)
);

CREATE TABLE IF NOT EXISTS public.camera_details (
  equipment_id uuid PRIMARY KEY REFERENCES public.security_equipment (id) ON DELETE CASCADE,
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  camera_type text,
  indoor_outdoor text,
  resolution text,
  lens_type text,
  field_of_view text,
  ptz_capable boolean,
  audio_capable boolean,
  audio_enabled boolean,
  infrared_night_vision boolean,
  analytics_capable boolean,
  recording_enabled boolean,
  recording_destination text,
  video_platform text,
  nvr_equipment_id uuid REFERENCES public.security_equipment (id) ON DELETE SET NULL,
  camera_channel text,
  ip_address text,
  mac_address text,
  vlan text,
  poe_enabled boolean,
  onvif_supported boolean,
  rtsp_supported boolean,
  firmware_version text,
  coverage_area text,
  privacy_masking_enabled boolean,
  retention_days integer,
  last_image_verification_date date,
  notes text,
  CONSTRAINT camera_details_retention_check
    CHECK (retention_days IS NULL OR retention_days >= 0)
);

CREATE TABLE IF NOT EXISTS public.video_recorder_details (
  equipment_id uuid PRIMARY KEY REFERENCES public.security_equipment (id) ON DELETE CASCADE,
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  recorder_type text,
  channel_capacity integer,
  channels_in_use integer,
  storage_capacity text,
  raid_configuration text,
  estimated_retention_days integer,
  video_platform text,
  ip_address text,
  mac_address text,
  vlan text,
  firmware_version text,
  remote_access_enabled boolean,
  cloud_connected boolean,
  ups_protected boolean,
  last_backup_verification date,
  last_playback_test date,
  notes text,
  CONSTRAINT video_recorder_channel_capacity_check
    CHECK (channel_capacity IS NULL OR channel_capacity >= 0),
  CONSTRAINT video_recorder_channels_in_use_check
    CHECK (channels_in_use IS NULL OR channels_in_use >= 0)
);

CREATE TABLE IF NOT EXISTS public.network_device_details (
  equipment_id uuid PRIMARY KEY REFERENCES public.security_equipment (id) ON DELETE CASCADE,
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  device_type text,
  hostname text,
  ip_address text,
  mac_address text,
  management_ip text,
  vlan text,
  subnet text,
  network_zone text,
  poe_capability boolean,
  poe_budget text,
  port_count integer,
  ports_in_use integer,
  internet_facing boolean,
  managed_or_unmanaged text,
  manufacturer_os text,
  firmware_version text,
  configuration_backup_location_ref text,
  last_configuration_backup date,
  last_firmware_review date,
  monitoring_enabled boolean,
  ups_protected boolean,
  redundancy_available boolean,
  notes text,
  CONSTRAINT network_device_port_count_check
    CHECK (port_count IS NULL OR port_count >= 0),
  CONSTRAINT network_device_ports_in_use_check
    CHECK (ports_in_use IS NULL OR ports_in_use >= 0)
);

CREATE TABLE IF NOT EXISTS public.access_control_details (
  equipment_id uuid PRIMARY KEY REFERENCES public.security_equipment (id) ON DELETE CASCADE,
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  device_type text,
  controlled_door_or_area text,
  reader_type text,
  credential_type text,
  controller_equipment_id uuid REFERENCES public.security_equipment (id) ON DELETE SET NULL,
  lock_type text,
  fail_safe_or_secure text,
  door_position_sensor boolean,
  request_to_exit_device boolean,
  emergency_release_available boolean,
  battery_backup boolean,
  network_connected boolean,
  ip_address text,
  firmware_version text,
  last_functional_test date,
  notes text
);

CREATE TABLE IF NOT EXISTS public.alarm_device_details (
  equipment_id uuid PRIMARY KEY REFERENCES public.security_equipment (id) ON DELETE CASCADE,
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  device_type text,
  monitored_by text,
  monitoring_account_reference text,
  location_note text,
  silent_or_audible text,
  fixed_or_wireless text,
  battery_powered boolean,
  last_test_date date,
  next_test_date date,
  escalation_group text,
  police_dispatch_enabled boolean,
  medical_dispatch_enabled boolean,
  fire_dispatch_enabled boolean,
  notes text
);

CREATE TABLE IF NOT EXISTS public.sensor_details (
  equipment_id uuid PRIMARY KEY REFERENCES public.security_equipment (id) ON DELETE CASCADE,
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  sensor_type text,
  connectivity_type text,
  reporting_protocol text,
  measurement_unit text,
  normal_threshold text,
  warning_threshold text,
  critical_threshold text,
  battery_powered boolean,
  battery_level text,
  last_reading text,
  last_reading_at timestamptz,
  last_communication_at timestamptz,
  gateway_equipment_id uuid REFERENCES public.security_equipment (id) ON DELETE SET NULL,
  calibration_required boolean,
  last_calibration_date date,
  next_calibration_date date,
  alerting_enabled boolean,
  notes text
);

CREATE TABLE IF NOT EXISTS public.power_backup_details (
  equipment_id uuid PRIMARY KEY REFERENCES public.security_equipment (id) ON DELETE CASCADE,
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  equipment_type text,
  capacity text,
  battery_chemistry text,
  runtime_estimate text,
  protected_equipment text,
  input_voltage text,
  output_voltage text,
  network_management_available boolean,
  last_battery_test date,
  battery_replacement_date date,
  next_battery_replacement date,
  generator_backed boolean,
  notes text
);

CREATE TABLE IF NOT EXISTS public.first_response_details (
  equipment_id uuid PRIMARY KEY REFERENCES public.security_equipment (id) ON DELETE CASCADE,
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  equipment_type text,
  seal_number text,
  inspection_interval_days integer,
  last_inspection_date date,
  next_inspection_date date,
  expiration_date date,
  supply_status text,
  assigned_location text,
  responsible_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  notes text,
  CONSTRAINT first_response_inspection_interval_check
    CHECK (inspection_interval_days IS NULL OR inspection_interval_days > 0)
);

-- Detail table RLS macro pattern
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'radio_details',
    'camera_details',
    'video_recorder_details',
    'network_device_details',
    'access_control_details',
    'alarm_device_details',
    'sensor_details',
    'power_backup_details',
    'first_response_details'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Members can view ' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_active_church_member(church_id))',
      'Members can view ' || t, t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Leaders can insert ' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.can_manage_security_equipment(church_id))',
      'Leaders can insert ' || t, t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Leaders can update ' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.can_manage_security_equipment(church_id)) WITH CHECK (public.can_manage_security_equipment(church_id))',
      'Leaders can update ' || t, t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Leaders can delete ' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.can_manage_security_equipment(church_id))',
      'Leaders can delete ' || t, t
    );

    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Relationships
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.equipment_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  parent_equipment_id uuid NOT NULL REFERENCES public.security_equipment (id) ON DELETE CASCADE,
  child_equipment_id uuid NOT NULL REFERENCES public.security_equipment (id) ON DELETE CASCADE,
  relationship_type public.equipment_relationship_type NOT NULL DEFAULT 'other'::public.equipment_relationship_type,
  notes text,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT equipment_relationships_not_self CHECK (parent_equipment_id <> child_equipment_id),
  CONSTRAINT equipment_relationships_unique UNIQUE (
    church_id, parent_equipment_id, child_equipment_id, relationship_type
  )
);

CREATE INDEX IF NOT EXISTS equipment_relationships_church_id_idx
  ON public.equipment_relationships (church_id);

CREATE INDEX IF NOT EXISTS equipment_relationships_parent_idx
  ON public.equipment_relationships (parent_equipment_id);

CREATE INDEX IF NOT EXISTS equipment_relationships_child_idx
  ON public.equipment_relationships (child_equipment_id);

CREATE OR REPLACE FUNCTION public.enforce_equipment_relationship_church()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_church uuid;
  v_child_church uuid;
BEGIN
  SELECT church_id INTO v_parent_church
  FROM public.security_equipment WHERE id = NEW.parent_equipment_id;

  SELECT church_id INTO v_child_church
  FROM public.security_equipment WHERE id = NEW.child_equipment_id;

  IF v_parent_church IS NULL OR v_child_church IS NULL THEN
    RAISE EXCEPTION 'VALIDATION: related equipment not found';
  END IF;

  IF v_parent_church <> NEW.church_id OR v_child_church <> NEW.church_id THEN
    RAISE EXCEPTION 'VALIDATION: equipment relationship must stay within one church';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS equipment_relationships_church ON public.equipment_relationships;
CREATE TRIGGER equipment_relationships_church
  BEFORE INSERT OR UPDATE
  ON public.equipment_relationships
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_equipment_relationship_church();

ALTER TABLE public.equipment_relationships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view equipment relationships" ON public.equipment_relationships;
DROP POLICY IF EXISTS "Leaders can insert equipment relationships" ON public.equipment_relationships;
DROP POLICY IF EXISTS "Leaders can update equipment relationships" ON public.equipment_relationships;
DROP POLICY IF EXISTS "Leaders can delete equipment relationships" ON public.equipment_relationships;

CREATE POLICY "Members can view equipment relationships"
  ON public.equipment_relationships FOR SELECT TO authenticated
  USING (public.is_active_church_member(church_id));

CREATE POLICY "Leaders can insert equipment relationships"
  ON public.equipment_relationships FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_security_equipment(church_id));

CREATE POLICY "Leaders can update equipment relationships"
  ON public.equipment_relationships FOR UPDATE TO authenticated
  USING (public.can_manage_security_equipment(church_id))
  WITH CHECK (public.can_manage_security_equipment(church_id));

CREATE POLICY "Leaders can delete equipment relationships"
  ON public.equipment_relationships FOR DELETE TO authenticated
  USING (public.can_manage_security_equipment(church_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipment_relationships TO authenticated;

-- ---------------------------------------------------------------------------
-- Assignments / check-out history
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.equipment_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  equipment_id uuid NOT NULL REFERENCES public.security_equipment (id) ON DELETE CASCADE,
  assigned_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  assigned_team text,
  assigned_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  expected_return_date date,
  returned_at timestamptz,
  return_condition text,
  assignment_notes text,
  status public.equipment_assignment_status NOT NULL DEFAULT 'active'::public.equipment_assignment_status,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS equipment_assignments_equipment_idx
  ON public.equipment_assignments (equipment_id, assigned_at DESC);

CREATE INDEX IF NOT EXISTS equipment_assignments_church_status_idx
  ON public.equipment_assignments (church_id, status);

CREATE INDEX IF NOT EXISTS equipment_assignments_user_idx
  ON public.equipment_assignments (assigned_user_id);

DROP TRIGGER IF EXISTS equipment_assignments_updated_at ON public.equipment_assignments;
CREATE TRIGGER equipment_assignments_updated_at
  BEFORE UPDATE ON public.equipment_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.equipment_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view equipment assignments" ON public.equipment_assignments;
DROP POLICY IF EXISTS "Operators can insert equipment assignments" ON public.equipment_assignments;
DROP POLICY IF EXISTS "Operators can update equipment assignments" ON public.equipment_assignments;

CREATE POLICY "Members can view equipment assignments"
  ON public.equipment_assignments FOR SELECT TO authenticated
  USING (public.is_active_church_member(church_id));

CREATE POLICY "Operators can insert equipment assignments"
  ON public.equipment_assignments FOR INSERT TO authenticated
  WITH CHECK (public.can_operate_security_equipment(church_id));

CREATE POLICY "Operators can update equipment assignments"
  ON public.equipment_assignments FOR UPDATE TO authenticated
  USING (public.can_operate_security_equipment(church_id))
  WITH CHECK (public.can_operate_security_equipment(church_id));

GRANT SELECT, INSERT, UPDATE ON public.equipment_assignments TO authenticated;

-- ---------------------------------------------------------------------------
-- Maintenance
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.equipment_maintenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  equipment_id uuid NOT NULL REFERENCES public.security_equipment (id) ON DELETE CASCADE,
  maintenance_type public.equipment_maintenance_type NOT NULL DEFAULT 'inspection'::public.equipment_maintenance_type,
  status public.equipment_maintenance_status NOT NULL DEFAULT 'scheduled'::public.equipment_maintenance_status,
  description text,
  scheduled_date date,
  completed_date date,
  completed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  vendor text,
  cost numeric(12, 2),
  work_order_number text,
  findings text,
  corrective_action text,
  next_maintenance_date date,
  attachment_path text,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT equipment_maintenance_cost_check
    CHECK (cost IS NULL OR cost >= 0)
);

CREATE INDEX IF NOT EXISTS equipment_maintenance_equipment_idx
  ON public.equipment_maintenance (equipment_id, scheduled_date DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS equipment_maintenance_church_status_idx
  ON public.equipment_maintenance (church_id, status);

CREATE INDEX IF NOT EXISTS equipment_maintenance_due_idx
  ON public.equipment_maintenance (church_id, scheduled_date)
  WHERE status IN (
    'scheduled'::public.equipment_maintenance_status,
    'in_progress'::public.equipment_maintenance_status
  );

DROP TRIGGER IF EXISTS equipment_maintenance_updated_at ON public.equipment_maintenance;
CREATE TRIGGER equipment_maintenance_updated_at
  BEFORE UPDATE ON public.equipment_maintenance
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.equipment_maintenance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view equipment maintenance" ON public.equipment_maintenance;
DROP POLICY IF EXISTS "Operators can insert equipment maintenance" ON public.equipment_maintenance;
DROP POLICY IF EXISTS "Operators can update equipment maintenance" ON public.equipment_maintenance;

CREATE POLICY "Members can view equipment maintenance"
  ON public.equipment_maintenance FOR SELECT TO authenticated
  USING (public.is_active_church_member(church_id));

CREATE POLICY "Operators can insert equipment maintenance"
  ON public.equipment_maintenance FOR INSERT TO authenticated
  WITH CHECK (public.can_operate_security_equipment(church_id));

CREATE POLICY "Operators can update equipment maintenance"
  ON public.equipment_maintenance FOR UPDATE TO authenticated
  USING (public.can_operate_security_equipment(church_id))
  WITH CHECK (public.can_operate_security_equipment(church_id));

GRANT SELECT, INSERT, UPDATE ON public.equipment_maintenance TO authenticated;

-- ---------------------------------------------------------------------------
-- Attachments metadata
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.equipment_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  equipment_id uuid NOT NULL REFERENCES public.security_equipment (id) ON DELETE CASCADE,
  kind public.equipment_attachment_kind NOT NULL DEFAULT 'other'::public.equipment_attachment_kind,
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  byte_size integer NOT NULL CHECK (byte_size > 0),
  original_filename text,
  uploaded_by uuid NOT NULL REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT equipment_attachments_storage_path_key UNIQUE (storage_path),
  CONSTRAINT equipment_attachments_mime_type_check CHECK (
    mime_type IN (
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif',
      'application/pdf'
    )
  )
);

CREATE INDEX IF NOT EXISTS equipment_attachments_equipment_idx
  ON public.equipment_attachments (equipment_id, created_at ASC);

CREATE INDEX IF NOT EXISTS equipment_attachments_church_id_idx
  ON public.equipment_attachments (church_id);

ALTER TABLE public.equipment_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view equipment attachments" ON public.equipment_attachments;
DROP POLICY IF EXISTS "Operators can insert equipment attachments" ON public.equipment_attachments;
DROP POLICY IF EXISTS "Leaders can delete equipment attachments" ON public.equipment_attachments;

CREATE POLICY "Members can view equipment attachments"
  ON public.equipment_attachments FOR SELECT TO authenticated
  USING (public.is_active_church_member(church_id));

CREATE POLICY "Operators can insert equipment attachments"
  ON public.equipment_attachments FOR INSERT TO authenticated
  WITH CHECK (
    public.can_operate_security_equipment(church_id)
    AND uploaded_by = auth.uid()
  );

CREATE POLICY "Leaders can delete equipment attachments"
  ON public.equipment_attachments FOR DELETE TO authenticated
  USING (
    public.can_manage_security_equipment(church_id)
    OR (
      public.can_operate_security_equipment(church_id)
      AND uploaded_by = auth.uid()
    )
  );

GRANT SELECT, INSERT, DELETE ON public.equipment_attachments TO authenticated;

-- ---------------------------------------------------------------------------
-- Private storage bucket: equipment-media
-- Path: churches/{church_id}/equipment/{equipment_id}/{kind}/{uuid}.{ext}
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'equipment-media',
  'equipment-media',
  false,
  10485760,
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.church_id_from_equipment_media_path(object_name text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  parts text[];
  church_id uuid;
BEGIN
  parts := string_to_array(object_name, '/');
  -- churches / {church_id} / equipment / {equipment_id} / {kind} / file
  IF array_length(parts, 1) < 5 THEN
    RETURN NULL;
  END IF;
  IF parts[1] <> 'churches' OR parts[3] <> 'equipment' THEN
    RETURN NULL;
  END IF;
  BEGIN
    church_id := parts[2]::uuid;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  RETURN church_id;
END;
$$;

REVOKE ALL ON FUNCTION public.church_id_from_equipment_media_path(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.church_id_from_equipment_media_path(text) TO authenticated;

DROP POLICY IF EXISTS "Members can read equipment media" ON storage.objects;
DROP POLICY IF EXISTS "Operators can upload equipment media" ON storage.objects;
DROP POLICY IF EXISTS "Operators can delete equipment media" ON storage.objects;

CREATE POLICY "Members can read equipment media"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'equipment-media'
    AND public.is_active_church_member(
      public.church_id_from_equipment_media_path(name)
    )
  );

CREATE POLICY "Operators can upload equipment media"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'equipment-media'
    AND public.can_operate_security_equipment(
      public.church_id_from_equipment_media_path(name)
    )
  );

CREATE POLICY "Operators can delete equipment media"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'equipment-media'
    AND public.can_operate_security_equipment(
      public.church_id_from_equipment_media_path(name)
    )
  );
