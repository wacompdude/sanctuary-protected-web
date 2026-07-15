"use server";

import { revalidatePath } from "next/cache";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { getRequestIpAddress, writeAuditLog } from "@/lib/audit/log";
import {
  MAINTENANCE_TYPES,
  type EquipmentAssignmentStatus,
  type EquipmentMaintenanceStatus,
  type EquipmentMaintenanceType,
  type OpsActionState,
} from "@/lib/security-hardware/operations";
import {
  getActiveAssignment,
} from "@/lib/security-hardware/ops-queries";
import {
  getOperationalChurchContext,
  getSecurityEquipmentById,
} from "@/lib/security-hardware/queries";
import {
  canManageSecurityEquipment,
  canOperateSecurityEquipment,
} from "@/lib/security-hardware/types";

function text(formData: FormData, key: string, max = 2000): string | null {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) return null;
  return value.slice(0, max);
}

function dateOrNull(formData: FormData, key: string): string | null {
  const value = text(formData, key, 32);
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function revalidateEquipment(equipmentId: string) {
  revalidatePath("/security-hardware");
  revalidatePath(`/security-hardware/${equipmentId}`);
  revalidatePath("/security-hardware/maintenance");
  revalidatePath("/security-hardware/reports");
}

export async function scheduleEquipmentMaintenance(
  equipmentId: string,
  _prev: OpsActionState,
  formData: FormData,
): Promise<OpsActionState> {
  try {
    const { supabase, user, church, membership } =
      await getOperationalChurchContext();

    if (!canOperateSecurityEquipment(membership.role)) {
      return { error: "You do not have permission to schedule maintenance." };
    }

    const equipment = await getSecurityEquipmentById(equipmentId, church.id);
    if (!equipment) return { error: "Equipment not found." };

    const typeRaw = text(formData, "maintenance_type", 40) ?? "inspection";
    if (!MAINTENANCE_TYPES.some((item) => item.value === typeRaw)) {
      return { fieldErrors: { maintenance_type: "Select a valid type." } };
    }

    const scheduledDate = dateOrNull(formData, "scheduled_date");
    if (!scheduledDate) {
      return { fieldErrors: { scheduled_date: "Scheduled date is required." } };
    }

    const description = text(formData, "description", 2000);
    const vendor = text(formData, "vendor", 120);
    const workOrder = text(formData, "work_order_number", 80);

    const { data, error } = await supabase
      .from("equipment_maintenance")
      .insert({
        church_id: church.id,
        equipment_id: equipmentId,
        maintenance_type: typeRaw as EquipmentMaintenanceType,
        status: "scheduled" as EquipmentMaintenanceStatus,
        description,
        scheduled_date: scheduledDate,
        vendor,
        work_order_number: workOrder,
        created_by: user.id,
        updated_by: user.id,
      })
      .select("id")
      .single();

    if (error || !data) {
      return { error: error?.message || "Unable to schedule maintenance." };
    }

    const patch: Record<string, unknown> = {
      updated_by: user.id,
      next_maintenance_at: `${scheduledDate}T12:00:00.000Z`,
    };
    if (typeRaw === "inspection") {
      patch.next_inspection_at = `${scheduledDate}T12:00:00.000Z`;
    }

    await supabase
      .from("security_equipment")
      .update(patch)
      .eq("id", equipmentId)
      .eq("church_id", church.id);

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.EQUIPMENT_MAINTENANCE_SCHEDULED,
      entityType: AuditEntityType.EQUIPMENT_MAINTENANCE,
      entityId: data.id,
      metadata: {
        equipment_id: equipmentId,
        maintenance_type: typeRaw,
        scheduled_date: scheduledDate,
      },
      ipAddress: await getRequestIpAddress(),
    });

    revalidateEquipment(equipmentId);
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to schedule maintenance.",
    };
  }
}

export async function completeEquipmentMaintenance(
  maintenanceId: string,
  _prev: OpsActionState,
  formData: FormData,
): Promise<OpsActionState> {
  try {
    const { supabase, user, church, membership } =
      await getOperationalChurchContext();

    if (!canOperateSecurityEquipment(membership.role)) {
      return { error: "You do not have permission to complete maintenance." };
    }

    const { data: record, error: loadError } = await supabase
      .from("equipment_maintenance")
      .select("*")
      .eq("id", maintenanceId)
      .eq("church_id", church.id)
      .maybeSingle();

    if (loadError || !record) {
      return { error: "Maintenance record not found." };
    }

    const outcome = text(formData, "outcome", 40) ?? "completed";
    const nextStatus: EquipmentMaintenanceStatus =
      outcome === "failed_inspection" ? "failed_inspection" : "completed";

    const completedDate =
      dateOrNull(formData, "completed_date") ??
      new Date().toISOString().slice(0, 10);
    const findings = text(formData, "findings", 4000);
    const corrective = text(formData, "corrective_action", 4000);
    const nextDate = dateOrNull(formData, "next_maintenance_date");
    const costRaw = text(formData, "cost", 32);
    const cost =
      costRaw && Number.isFinite(Number(costRaw)) ? Number(costRaw) : null;

    const { error } = await supabase
      .from("equipment_maintenance")
      .update({
        status: nextStatus,
        completed_date: completedDate,
        completed_by: user.id,
        findings,
        corrective_action: corrective,
        next_maintenance_date: nextDate,
        cost,
        updated_by: user.id,
      })
      .eq("id", maintenanceId)
      .eq("church_id", church.id);

    if (error) {
      return { error: error.message };
    }

    const equipmentPatch: Record<string, unknown> = {
      updated_by: user.id,
      last_maintenance_at: `${completedDate}T12:00:00.000Z`,
    };

    if (record.maintenance_type === "inspection") {
      equipmentPatch.last_inspected_at = `${completedDate}T12:00:00.000Z`;
    }

    if (nextDate) {
      equipmentPatch.next_maintenance_at = `${nextDate}T12:00:00.000Z`;
      if (record.maintenance_type === "inspection") {
        equipmentPatch.next_inspection_at = `${nextDate}T12:00:00.000Z`;
      }
    }

    if (nextStatus === "failed_inspection") {
      equipmentPatch.status = "out_of_service";
    } else if (record.maintenance_type === "repair") {
      const equipment = await getSecurityEquipmentById(
        record.equipment_id,
        church.id,
      );
      if (
        equipment &&
        (equipment.status === "maintenance" ||
          equipment.status === "out_of_service")
      ) {
        equipmentPatch.status = "active";
      }
    }

    await supabase
      .from("security_equipment")
      .update(equipmentPatch)
      .eq("id", record.equipment_id)
      .eq("church_id", church.id);

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action:
        nextStatus === "failed_inspection"
          ? AuditAction.EQUIPMENT_INSPECTION_FAILED
          : AuditAction.EQUIPMENT_MAINTENANCE_COMPLETED,
      entityType: AuditEntityType.EQUIPMENT_MAINTENANCE,
      entityId: maintenanceId,
      metadata: {
        equipment_id: record.equipment_id,
        status: nextStatus,
        completed_date: completedDate,
      },
      ipAddress: await getRequestIpAddress(),
    });

    revalidateEquipment(record.equipment_id);
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to complete maintenance.",
    };
  }
}

export async function assignEquipment(
  equipmentId: string,
  _prev: OpsActionState,
  formData: FormData,
): Promise<OpsActionState> {
  try {
    const { supabase, user, church, membership } =
      await getOperationalChurchContext();

    if (!canOperateSecurityEquipment(membership.role)) {
      return { error: "You do not have permission to assign equipment." };
    }

    const equipment = await getSecurityEquipmentById(equipmentId, church.id);
    if (!equipment) return { error: "Equipment not found." };

    const active = await getActiveAssignment(church.id, equipmentId);
    if (active) {
      return {
        error:
          "This equipment already has an active assignment. Return it before assigning again.",
      };
    }

    const assignedTeam = text(formData, "assigned_team", 120);
    const assignedUserId = text(formData, "assigned_user_id", 64);
    const notes = text(formData, "assignment_notes", 2000);
    const expectedReturn = dateOrNull(formData, "expected_return_date");

    if (!assignedTeam && !assignedUserId) {
      return {
        fieldErrors: {
          assigned_team: "Provide a team name and/or select a member.",
        },
      };
    }

    const { data, error } = await supabase
      .from("equipment_assignments")
      .insert({
        church_id: church.id,
        equipment_id: equipmentId,
        assigned_user_id: assignedUserId,
        assigned_team: assignedTeam,
        assigned_by: user.id,
        expected_return_date: expectedReturn,
        assignment_notes: notes,
        status: "active" as EquipmentAssignmentStatus,
      })
      .select("id")
      .single();

    if (error || !data) {
      return { error: error?.message || "Unable to assign equipment." };
    }

    await supabase
      .from("security_equipment")
      .update({
        assigned_user_id: assignedUserId,
        assigned_team: assignedTeam,
        updated_by: user.id,
      })
      .eq("id", equipmentId)
      .eq("church_id", church.id);

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.EQUIPMENT_ASSIGNED,
      entityType: AuditEntityType.EQUIPMENT_ASSIGNMENT,
      entityId: data.id,
      metadata: {
        equipment_id: equipmentId,
        assigned_team: assignedTeam,
        assigned_user_id: assignedUserId,
      },
      ipAddress: await getRequestIpAddress(),
    });

    revalidateEquipment(equipmentId);
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to assign equipment.",
    };
  }
}

export async function returnEquipmentAssignment(
  assignmentId: string,
  _prev: OpsActionState,
  formData: FormData,
): Promise<OpsActionState> {
  try {
    const { supabase, user, church, membership } =
      await getOperationalChurchContext();

    if (!canOperateSecurityEquipment(membership.role)) {
      return { error: "You do not have permission to return equipment." };
    }

    const { data: assignment, error: loadError } = await supabase
      .from("equipment_assignments")
      .select("*")
      .eq("id", assignmentId)
      .eq("church_id", church.id)
      .maybeSingle();

    if (loadError || !assignment) {
      return { error: "Assignment not found." };
    }

    if (assignment.status !== "active") {
      return { error: "Only active assignments can be returned." };
    }

    const condition = text(formData, "return_condition", 200) ?? "returned";
    const notes = text(formData, "assignment_notes", 2000);
    let nextStatus: EquipmentAssignmentStatus = "returned";
    if (condition === "lost") nextStatus = "lost";
    if (condition === "damaged") nextStatus = "damaged";

    const { error } = await supabase
      .from("equipment_assignments")
      .update({
        status: nextStatus,
        returned_at: new Date().toISOString(),
        return_condition: condition,
        assignment_notes: notes ?? assignment.assignment_notes,
      })
      .eq("id", assignmentId)
      .eq("church_id", church.id);

    if (error) {
      return { error: error.message };
    }

    const equipmentPatch: Record<string, unknown> = {
      assigned_user_id: null,
      assigned_team: null,
      updated_by: user.id,
    };

    if (nextStatus === "lost") {
      equipmentPatch.status = "lost";
    }

    await supabase
      .from("security_equipment")
      .update(equipmentPatch)
      .eq("id", assignment.equipment_id)
      .eq("church_id", church.id);

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action:
        nextStatus === "lost"
          ? AuditAction.EQUIPMENT_REPORTED_LOST
          : AuditAction.EQUIPMENT_RETURNED,
      entityType: AuditEntityType.EQUIPMENT_ASSIGNMENT,
      entityId: assignmentId,
      metadata: {
        equipment_id: assignment.equipment_id,
        return_condition: condition,
        status: nextStatus,
      },
      ipAddress: await getRequestIpAddress(),
    });

    revalidateEquipment(assignment.equipment_id);
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to return equipment.",
    };
  }
}

export async function reportEquipmentLostOrStolen(
  equipmentId: string,
  _prev: OpsActionState,
  formData: FormData,
): Promise<OpsActionState> {
  try {
    const { supabase, user, church, membership } =
      await getOperationalChurchContext();

    if (!canManageSecurityEquipment(membership.role)) {
      return {
        error:
          "Only security leaders and above can report equipment lost or stolen.",
      };
    }

    const equipment = await getSecurityEquipmentById(equipmentId, church.id);
    if (!equipment) return { error: "Equipment not found." };

    const kind = text(formData, "report_kind", 20) ?? "lost";
    if (kind !== "lost" && kind !== "stolen") {
      return { fieldErrors: { report_kind: "Choose lost or stolen." } };
    }

    const notes = text(formData, "notes", 2000);
    const nextStatus = kind === "stolen" ? "stolen" : "lost";

    const { error } = await supabase
      .from("security_equipment")
      .update({
        status: nextStatus,
        notes: notes
          ? `${equipment.notes ? `${equipment.notes}\n\n` : ""}[${nextStatus.toUpperCase()}] ${notes}`
          : equipment.notes,
        updated_by: user.id,
      })
      .eq("id", equipmentId)
      .eq("church_id", church.id);

    if (error) {
      return { error: error.message };
    }

    const active = await getActiveAssignment(church.id, equipmentId);
    if (active) {
      await supabase
        .from("equipment_assignments")
        .update({
          status: "lost" as EquipmentAssignmentStatus,
          returned_at: new Date().toISOString(),
          return_condition: nextStatus,
          assignment_notes: notes ?? active.assignment_notes,
        })
        .eq("id", active.id)
        .eq("church_id", church.id);
    }

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action:
        nextStatus === "stolen"
          ? AuditAction.EQUIPMENT_REPORTED_STOLEN
          : AuditAction.EQUIPMENT_REPORTED_LOST,
      entityType: AuditEntityType.SECURITY_EQUIPMENT,
      entityId: equipmentId,
      metadata: { previous_status: equipment.status, status: nextStatus },
      ipAddress: await getRequestIpAddress(),
    });

    revalidateEquipment(equipmentId);
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to update equipment status.",
    };
  }
}
