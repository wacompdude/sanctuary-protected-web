"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { getRequestIpAddress, writeAuditLog } from "@/lib/audit/log";
import {
  getMedicalSupplyById,
  getOperationalChurchContext,
} from "@/lib/medical-supplies/queries";
import {
  canManageMedicalSupplies,
  canRecordMedicalSupplyUsage,
  type MedicalSupplyActionState,
} from "@/lib/medical-supplies/types";
import { validateMedicalSupplyForm } from "@/lib/medical-supplies/validation";
import { FEATURE_KEYS } from "@/lib/subscriptions/feature-keys";
import { requireFeature } from "@/lib/subscriptions/resolver";

function revalidateMedicalPaths(supplyId?: string) {
  revalidatePath("/medical-supplies");
  revalidatePath("/medical-supplies/restock");
  if (supplyId) {
    revalidatePath(`/medical-supplies/${supplyId}`);
    revalidatePath(`/medical-supplies/${supplyId}/edit`);
  }
}

export async function createMedicalSupply(
  _prev: MedicalSupplyActionState,
  formData: FormData,
): Promise<MedicalSupplyActionState> {
  let supplyId = "";

  try {
    const { supabase, user, church, membership } =
      await getOperationalChurchContext();

    if (!canManageMedicalSupplies(membership.role)) {
      return { error: "You do not have permission to add medical supplies." };
    }

    await requireFeature({
      churchId: church.id,
      featureKey: FEATURE_KEYS.MEDICAL_INVENTORY,
    });

    const validation = validateMedicalSupplyForm(formData);
    if (validation.fieldErrors || !validation.data) {
      return { fieldErrors: validation.fieldErrors };
    }

    const input = validation.data;
    const { data, error } = await supabase
      .from("medical_supplies")
      .insert({
        church_id: church.id,
        ...input,
        created_by: user.id,
        updated_by: user.id,
      })
      .select("id")
      .single();

    if (error || !data) {
      return {
        error:
          error?.message ||
          "Unable to create supply. Confirm migration 023 has been applied.",
      };
    }

    supplyId = data.id;

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.MEDICAL_SUPPLY_CREATED,
      entityType: AuditEntityType.MEDICAL_SUPPLY,
      entityId: data.id,
      metadata: { name: input.name, category: input.category },
      ipAddress: await getRequestIpAddress(),
    });
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to create supply.",
    };
  }

  revalidateMedicalPaths(supplyId);
  redirect(`/medical-supplies/${supplyId}`);
}

export async function updateMedicalSupply(
  supplyId: string,
  _prev: MedicalSupplyActionState,
  formData: FormData,
): Promise<MedicalSupplyActionState> {
  try {
    const { supabase, user, church, membership } =
      await getOperationalChurchContext();

    if (!canManageMedicalSupplies(membership.role)) {
      return { error: "You do not have permission to edit medical supplies." };
    }

    await requireFeature({
      churchId: church.id,
      featureKey: FEATURE_KEYS.MEDICAL_INVENTORY,
    });

    const existing = await getMedicalSupplyById(supplyId, church.id);
    if (!existing) return { error: "Supply not found." };

    const validation = validateMedicalSupplyForm(formData);
    if (validation.fieldErrors || !validation.data) {
      return { fieldErrors: validation.fieldErrors };
    }

    const input = validation.data;
    const { error } = await supabase
      .from("medical_supplies")
      .update({
        ...input,
        updated_by: user.id,
      })
      .eq("id", supplyId)
      .eq("church_id", church.id);

    if (error) {
      return { error: error.message };
    }

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.MEDICAL_SUPPLY_UPDATED,
      entityType: AuditEntityType.MEDICAL_SUPPLY,
      entityId: supplyId,
      metadata: { name: input.name },
      ipAddress: await getRequestIpAddress(),
    });

    revalidateMedicalPaths(supplyId);
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to update supply.",
    };
  }
}

export async function archiveMedicalSupply(
  supplyId: string,
): Promise<MedicalSupplyActionState> {
  try {
    const { supabase, user, church, membership } =
      await getOperationalChurchContext();

    if (!canManageMedicalSupplies(membership.role)) {
      return { error: "You do not have permission to archive supplies." };
    }

    const { error } = await supabase
      .from("medical_supplies")
      .update({
        archived_at: new Date().toISOString(),
        updated_by: user.id,
      })
      .eq("id", supplyId)
      .eq("church_id", church.id);

    if (error) return { error: error.message };

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.MEDICAL_SUPPLY_ARCHIVED,
      entityType: AuditEntityType.MEDICAL_SUPPLY,
      entityId: supplyId,
      ipAddress: await getRequestIpAddress(),
    });

    revalidateMedicalPaths(supplyId);
    redirect("/medical-supplies");
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to archive supply.",
    };
  }
}

export async function restoreMedicalSupply(
  supplyId: string,
): Promise<MedicalSupplyActionState> {
  try {
    const { supabase, user, church, membership } =
      await getOperationalChurchContext();

    if (!canManageMedicalSupplies(membership.role)) {
      return { error: "You do not have permission to restore supplies." };
    }

    await requireFeature({
      churchId: church.id,
      featureKey: FEATURE_KEYS.MEDICAL_INVENTORY,
    });

    const { error } = await supabase
      .from("medical_supplies")
      .update({
        archived_at: null,
        updated_by: user.id,
      })
      .eq("id", supplyId)
      .eq("church_id", church.id);

    if (error) return { error: error.message };

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.MEDICAL_SUPPLY_RESTORED,
      entityType: AuditEntityType.MEDICAL_SUPPLY,
      entityId: supplyId,
      ipAddress: await getRequestIpAddress(),
    });

    revalidateMedicalPaths(supplyId);
    redirect(`/medical-supplies/${supplyId}`);
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to restore supply.",
    };
  }
}

export async function recordMedicalSupplyUsage(
  incidentId: string,
  _prev: MedicalSupplyActionState,
  formData: FormData,
): Promise<MedicalSupplyActionState> {
  try {
    const { supabase, user, church, membership } =
      await getOperationalChurchContext();

    if (!canRecordMedicalSupplyUsage(membership.role)) {
      return { error: "You do not have permission to record supply usage." };
    }

    await requireFeature({
      churchId: church.id,
      featureKey: FEATURE_KEYS.MEDICAL_INCIDENT_USAGE,
    });

    const supplyId = String(formData.get("medical_supply_id") ?? "").trim();
    const quantityRaw = String(formData.get("quantity_used") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim().slice(0, 2000) || null;
    const quantity = Number.parseInt(quantityRaw, 10);

    if (!supplyId) {
      return { fieldErrors: { medical_supply_id: "Select a supply." } };
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { fieldErrors: { quantity_used: "Enter a quantity greater than zero." } };
    }

    const { data: incident, error: incidentError } = await supabase
      .from("incidents")
      .select("id, church_id, type")
      .eq("id", incidentId)
      .eq("church_id", church.id)
      .maybeSingle();

    if (incidentError || !incident) {
      return { error: "Incident not found." };
    }
    if (incident.type !== "medical") {
      return { error: "Supplies can only be recorded on medical incidents." };
    }

    const supply = await getMedicalSupplyById(supplyId, church.id);
    if (!supply || supply.archived_at) {
      return { fieldErrors: { medical_supply_id: "Supply not found." } };
    }
    if (supply.quantity_on_hand < quantity) {
      return {
        fieldErrors: {
          quantity_used: `Only ${supply.quantity_on_hand} ${supply.unit} on hand.`,
        },
      };
    }

    const { data, error } = await supabase
      .from("medical_supply_usage")
      .insert({
        church_id: church.id,
        incident_id: incidentId,
        medical_supply_id: supplyId,
        quantity_used: quantity,
        recorded_by: user.id,
        notes,
      })
      .select("id")
      .single();

    if (error || !data) {
      const message = error?.message ?? "Unable to record usage.";
      if (message.includes("insufficient quantity")) {
        return { fieldErrors: { quantity_used: message } };
      }
      if (message.includes("medical incidents")) {
        return { error: message };
      }
      return { error: message };
    }

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.MEDICAL_SUPPLY_USED,
      entityType: AuditEntityType.MEDICAL_SUPPLY_USAGE,
      entityId: data.id,
      metadata: {
        incident_id: incidentId,
        medical_supply_id: supplyId,
        quantity_used: quantity,
        supply_name: supply.name,
      },
      ipAddress: await getRequestIpAddress(),
    });

    revalidateMedicalPaths(supplyId);
    revalidatePath(`/incidents/${incidentId}`);
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to record usage.",
    };
  }
}

export async function removeMedicalSupplyUsage(
  usageId: string,
  incidentId: string,
): Promise<MedicalSupplyActionState> {
  try {
    const { supabase, user, church, membership } =
      await getOperationalChurchContext();

    if (!canManageMedicalSupplies(membership.role)) {
      return { error: "Only leaders can remove recorded usage." };
    }

    const { data: usage, error: fetchError } = await supabase
      .from("medical_supply_usage")
      .select("*")
      .eq("id", usageId)
      .eq("church_id", church.id)
      .eq("incident_id", incidentId)
      .maybeSingle();

    if (fetchError || !usage) {
      return { error: fetchError?.message || "Usage record not found." };
    }

    const { error } = await supabase
      .from("medical_supply_usage")
      .delete()
      .eq("id", usageId)
      .eq("church_id", church.id);

    if (error) return { error: error.message };

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.MEDICAL_SUPPLY_USAGE_REMOVED,
      entityType: AuditEntityType.MEDICAL_SUPPLY_USAGE,
      entityId: usageId,
      metadata: {
        incident_id: incidentId,
        medical_supply_id: usage.medical_supply_id,
        quantity_used: usage.quantity_used,
      },
      ipAddress: await getRequestIpAddress(),
    });

    revalidateMedicalPaths(usage.medical_supply_id);
    revalidatePath(`/incidents/${incidentId}`);
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to remove usage.",
    };
  }
}
