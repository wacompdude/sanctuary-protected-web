import { createClient } from "@/lib/supabase/server";
import type {
  EquipmentAssignmentRecord,
  EquipmentMaintenanceRecord,
} from "@/lib/security-hardware/operations";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function inDaysIso(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function listMaintenanceForEquipment(
  churchId: string,
  equipmentId: string,
): Promise<EquipmentMaintenanceRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("equipment_maintenance")
    .select("*")
    .eq("church_id", churchId)
    .eq("equipment_id", equipmentId)
    .order("scheduled_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as EquipmentMaintenanceRecord[];
}

export async function listAssignmentsForEquipment(
  churchId: string,
  equipmentId: string,
): Promise<EquipmentAssignmentRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("equipment_assignments")
    .select("*")
    .eq("church_id", churchId)
    .eq("equipment_id", equipmentId)
    .order("assigned_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as EquipmentAssignmentRecord[];
}

export async function getActiveAssignment(
  churchId: string,
  equipmentId: string,
): Promise<EquipmentAssignmentRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("equipment_assignments")
    .select("*")
    .eq("church_id", churchId)
    .eq("equipment_id", equipmentId)
    .eq("status", "active")
    .order("assigned_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return (data as EquipmentAssignmentRecord | null) ?? null;
}

export type MaintenanceDashboardData = {
  overdue: EquipmentMaintenanceRecord[];
  dueSoon: EquipmentMaintenanceRecord[];
  scheduled: EquipmentMaintenanceRecord[];
  recentlyCompleted: EquipmentMaintenanceRecord[];
  failed: EquipmentMaintenanceRecord[];
  outOfServiceEquipment: {
    id: string;
    name: string;
    asset_tag: string | null;
    status: string;
  }[];
};

export async function getMaintenanceDashboard(
  churchId: string,
): Promise<MaintenanceDashboardData> {
  const supabase = await createClient();
  const today = todayIso();
  const soon = inDaysIso(30);

  const { data: openRows, error: openError } = await supabase
    .from("equipment_maintenance")
    .select("*")
    .eq("church_id", churchId)
    .in("status", ["scheduled", "in_progress"])
    .order("scheduled_date", { ascending: true, nullsFirst: false });

  if (openError) {
    throw new Error(
      openError.message.includes("equipment_maintenance")
        ? "Run supabase/migrations/022_security_equipment.sql in the Supabase SQL Editor."
        : openError.message,
    );
  }

  const { data: completedRows } = await supabase
    .from("equipment_maintenance")
    .select("*")
    .eq("church_id", churchId)
    .eq("status", "completed")
    .order("completed_date", { ascending: false, nullsFirst: false })
    .limit(20);

  const { data: failedRows } = await supabase
    .from("equipment_maintenance")
    .select("*")
    .eq("church_id", churchId)
    .eq("status", "failed_inspection")
    .order("updated_at", { ascending: false })
    .limit(20);

  const { data: outOfService } = await supabase
    .from("security_equipment")
    .select("id, name, asset_tag, status")
    .eq("church_id", churchId)
    .is("archived_at", null)
    .in("status", ["out_of_service", "maintenance"])
    .order("name", { ascending: true });

  const open = (openRows ?? []) as EquipmentMaintenanceRecord[];
  const equipmentIds = [
    ...new Set([
      ...open.map((row) => row.equipment_id),
      ...((completedRows ?? []) as EquipmentMaintenanceRecord[]).map(
        (row) => row.equipment_id,
      ),
      ...((failedRows ?? []) as EquipmentMaintenanceRecord[]).map(
        (row) => row.equipment_id,
      ),
    ]),
  ];

  const nameById = new Map<string, { name: string; asset_tag: string | null }>();
  if (equipmentIds.length > 0) {
    const { data: equipment } = await supabase
      .from("security_equipment")
      .select("id, name, asset_tag")
      .eq("church_id", churchId)
      .in("id", equipmentIds);
    for (const row of equipment ?? []) {
      nameById.set(row.id as string, {
        name: row.name as string,
        asset_tag: (row.asset_tag as string | null) ?? null,
      });
    }
  }

  const withNames = (
    rows: EquipmentMaintenanceRecord[],
  ): EquipmentMaintenanceRecord[] =>
    rows.map((row) => ({
      ...row,
      equipment_name: nameById.get(row.equipment_id)?.name ?? null,
      equipment_asset_tag: nameById.get(row.equipment_id)?.asset_tag ?? null,
    }));

  const overdue: EquipmentMaintenanceRecord[] = [];
  const dueSoon: EquipmentMaintenanceRecord[] = [];
  const scheduled: EquipmentMaintenanceRecord[] = [];

  for (const row of withNames(open)) {
    const due = row.scheduled_date?.slice(0, 10) ?? null;
    if (due && due < today) {
      overdue.push(row);
    } else if (due && due <= soon) {
      dueSoon.push(row);
    } else {
      scheduled.push(row);
    }
  }

  return {
    overdue,
    dueSoon,
    scheduled,
    recentlyCompleted: withNames(
      (completedRows ?? []) as EquipmentMaintenanceRecord[],
    ),
    failed: withNames((failedRows ?? []) as EquipmentMaintenanceRecord[]),
    outOfServiceEquipment: (outOfService ?? []) as MaintenanceDashboardData["outOfServiceEquipment"],
  };
}
