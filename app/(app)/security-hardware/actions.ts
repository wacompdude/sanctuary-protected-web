"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { getRequestIpAddress, writeAuditLog } from "@/lib/audit/log";
import {
  canManageSecurityEquipment,
} from "@/lib/security-hardware/types";
import {
  getChurchEquipmentWarningDays,
  getOperationalChurchContext,
  getSecurityEquipmentById,
  listCampusesForChurch,
  suggestAssetTag,
  upsertCategoryDetails,
  clearAllCategoryDetails,
} from "@/lib/security-hardware/queries";
import { parseCategoryDetailsFromForm } from "@/lib/security-hardware/category-details";
import { validateEquipmentForm } from "@/lib/security-hardware/validation";
import type { EquipmentActionState } from "@/lib/security-hardware/types";
import {
  EQUIPMENT_PHOTO_MAX_COUNT,
  collectEquipmentPhotoFiles,
  uploadEquipmentPhotoFiles,
  validateEquipmentPhotoFile,
} from "@/lib/security-hardware/attachment-storage";
import { FEATURE_KEYS } from "@/lib/subscriptions/feature-keys";
import { requireFeature } from "@/lib/subscriptions/resolver";

async function assertCampusBelongsToChurch(
  churchId: string,
  campusId: string | null,
): Promise<string | null> {
  if (!campusId) return null;
  const campuses = await listCampusesForChurch(churchId);
  if (!campuses.some((campus) => campus.id === campusId)) {
    return "Selected campus does not belong to this church.";
  }
  return null;
}

function equipmentPath(id: string) {
  return `/security-hardware/${id}`;
}

export async function createSecurityEquipment(
  _prev: EquipmentActionState,
  formData: FormData,
): Promise<EquipmentActionState> {
  let equipmentId = "";

  try {
    const { supabase, user, church, membership } =
      await getOperationalChurchContext();

    if (!canManageSecurityEquipment(membership.role)) {
      return {
        error: "You do not have permission to create security equipment.",
      };
    }

    await requireFeature({
      churchId: church.id,
      featureKey: FEATURE_KEYS.HARDWARE_INVENTORY,
    });

    const validation = validateEquipmentForm(formData);
    if (validation.fieldErrors || !validation.data) {
      return { fieldErrors: validation.fieldErrors };
    }

    const photoFiles = collectEquipmentPhotoFiles(formData);
    if (photoFiles.length > 0) {
      await requireFeature({
        churchId: church.id,
        featureKey: FEATURE_KEYS.HARDWARE_PHOTOS,
      });
    }
    if (photoFiles.length > EQUIPMENT_PHOTO_MAX_COUNT) {
      return {
        fieldErrors: {
          photos: `You can attach at most ${EQUIPMENT_PHOTO_MAX_COUNT} photos.`,
        },
      };
    }
    for (const file of photoFiles) {
      const fileError = validateEquipmentPhotoFile(file);
      if (fileError) {
        return { fieldErrors: { photos: fileError } };
      }
    }

    const input = validation.data;
    const campusError = await assertCampusBelongsToChurch(
      church.id,
      input.campus_id,
    );
    if (campusError) {
      return { fieldErrors: { campus_id: campusError } };
    }

    let assetTag = input.asset_tag;
    const autoTag = String(formData.get("auto_asset_tag") ?? "") === "on";
    if (autoTag || !assetTag) {
      const warnings = await getChurchEquipmentWarningDays(church.id);
      assetTag = await suggestAssetTag({
        churchId: church.id,
        campusId: input.campus_id,
        category: input.category,
        prefix: warnings.assetTagPrefix,
      });
    }

    const { data, error } = await supabase
      .from("security_equipment")
      .insert({
        church_id: church.id,
        campus_id: input.campus_id,
        category: input.category,
        subcategory: input.subcategory,
        name: input.name,
        description: input.description,
        status: input.status,
        criticality: input.criticality,
        location_name: input.location_name,
        building: input.building,
        floor: input.floor,
        room: input.room,
        installation_area: input.installation_area,
        asset_tag: assetTag,
        manufacturer: input.manufacturer,
        model: input.model,
        serial_number: input.serial_number,
        purchase_date: input.purchase_date,
        purchase_price: input.purchase_price,
        vendor_name: input.vendor_name,
        vendor_contact: input.vendor_contact,
        warranty_expiration: input.warranty_expiration,
        installed_date: input.installed_date,
        assigned_team: input.assigned_team,
        next_inspection_at: input.next_inspection_at
          ? `${input.next_inspection_at}T12:00:00.000Z`
          : null,
        next_maintenance_at: input.next_maintenance_at
          ? `${input.next_maintenance_at}T12:00:00.000Z`
          : null,
        expected_replacement_date: input.expected_replacement_date,
        replacement_cost_estimate: input.replacement_cost_estimate,
        notes: input.notes,
        created_by: user.id,
        updated_by: user.id,
      })
      .select("id")
      .single();

    if (error || !data) {
      if (error?.code === "23505") {
        return {
          fieldErrors: {
            asset_tag: "That asset tag is already used at this church.",
          },
        };
      }
      return {
        error:
          error?.message?.includes("022_security") ||
          error?.message?.includes("security_equipment")
            ? "Run supabase/migrations/022_security_equipment.sql, then try again."
            : error?.message || "Unable to create equipment.",
      };
    }

    equipmentId = data.id;

    const details = parseCategoryDetailsFromForm(formData, input.category);
    if (details) {
      const detailError = await upsertCategoryDetails({
        supabase,
        churchId: church.id,
        equipmentId,
        category: input.category,
        values: details.values,
      });
      if (detailError) {
        return {
          error: `Equipment created, but technical details failed: ${detailError}`,
        };
      }
    } else {
      await clearAllCategoryDetails({
        supabase,
        churchId: church.id,
        equipmentId,
      });
    }

    let photoCount = 0;
    let photoError: string | undefined;
    if (photoFiles.length > 0) {
      const photoResult = await uploadEquipmentPhotoFiles({
        supabase,
        churchId: church.id,
        equipmentId,
        userId: user.id,
        files: photoFiles,
      });
      photoCount = photoResult.uploaded;
      if (photoResult.error) {
        photoError = photoResult.error;
      }
    }

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.EQUIPMENT_CREATED,
      entityType: AuditEntityType.SECURITY_EQUIPMENT,
      entityId: equipmentId,
      metadata: {
        name: input.name,
        category: input.category,
        status: input.status,
        asset_tag: assetTag,
        has_category_details: Boolean(details),
        photo_count: photoCount,
        photo_error: photoError,
      },
      ipAddress: await getRequestIpAddress(),
    });

    if (photoError) {
      console.error("Equipment photo upload failed:", photoError);
    }
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to create equipment.",
    };
  }

  revalidatePath("/security-hardware");
  revalidatePath(equipmentPath(equipmentId));
  redirect(equipmentPath(equipmentId));
}

export async function updateSecurityEquipment(
  equipmentId: string,
  _prev: EquipmentActionState,
  formData: FormData,
): Promise<EquipmentActionState> {
  try {
    const { supabase, user, church, membership } =
      await getOperationalChurchContext();

    if (!canManageSecurityEquipment(membership.role)) {
      return {
        error: "You do not have permission to update security equipment.",
      };
    }

    await requireFeature({
      churchId: church.id,
      featureKey: FEATURE_KEYS.HARDWARE_INVENTORY,
    });

    const existing = await getSecurityEquipmentById(equipmentId, church.id);
    if (!existing) {
      return { error: "Equipment not found." };
    }

    const validation = validateEquipmentForm(formData);
    if (validation.fieldErrors || !validation.data) {
      return { fieldErrors: validation.fieldErrors };
    }

    const input = validation.data;
    const campusError = await assertCampusBelongsToChurch(
      church.id,
      input.campus_id,
    );
    if (campusError) {
      return { fieldErrors: { campus_id: campusError } };
    }

    const previousStatus = existing.status;
    const { error } = await supabase
      .from("security_equipment")
      .update({
        campus_id: input.campus_id,
        category: input.category,
        subcategory: input.subcategory,
        name: input.name,
        description: input.description,
        status: input.status,
        criticality: input.criticality,
        location_name: input.location_name,
        building: input.building,
        floor: input.floor,
        room: input.room,
        installation_area: input.installation_area,
        asset_tag: input.asset_tag,
        manufacturer: input.manufacturer,
        model: input.model,
        serial_number: input.serial_number,
        purchase_date: input.purchase_date,
        purchase_price: input.purchase_price,
        vendor_name: input.vendor_name,
        vendor_contact: input.vendor_contact,
        warranty_expiration: input.warranty_expiration,
        installed_date: input.installed_date,
        assigned_team: input.assigned_team,
        next_inspection_at: input.next_inspection_at
          ? `${input.next_inspection_at}T12:00:00.000Z`
          : null,
        next_maintenance_at: input.next_maintenance_at
          ? `${input.next_maintenance_at}T12:00:00.000Z`
          : null,
        expected_replacement_date: input.expected_replacement_date,
        replacement_cost_estimate: input.replacement_cost_estimate,
        notes: input.notes,
        updated_by: user.id,
      })
      .eq("id", equipmentId)
      .eq("church_id", church.id);

    if (error) {
      if (error.code === "23505") {
        return {
          fieldErrors: {
            asset_tag: "That asset tag is already used at this church.",
          },
        };
      }
      return { error: error.message || "Unable to update equipment." };
    }

    const details = parseCategoryDetailsFromForm(formData, input.category);
    if (details) {
      const detailError = await upsertCategoryDetails({
        supabase,
        churchId: church.id,
        equipmentId,
        category: input.category,
        values: details.values,
      });
      if (detailError) {
        return { error: `Equipment updated, but technical details failed: ${detailError}` };
      }
    } else {
      await clearAllCategoryDetails({
        supabase,
        churchId: church.id,
        equipmentId,
      });
    }

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action:
        previousStatus !== input.status
          ? AuditAction.EQUIPMENT_STATUS_CHANGED
          : AuditAction.EQUIPMENT_UPDATED,
      entityType: AuditEntityType.SECURITY_EQUIPMENT,
      entityId: equipmentId,
      metadata: {
        name: input.name,
        previous_status: previousStatus,
        status: input.status,
        category: input.category,
        has_category_details: Boolean(details),
      },
      ipAddress: await getRequestIpAddress(),
    });

    revalidatePath("/security-hardware");
    revalidatePath(equipmentPath(equipmentId));
    revalidatePath(`${equipmentPath(equipmentId)}/edit`);
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to update equipment.",
    };
  }
}

export async function archiveSecurityEquipment(
  equipmentId: string,
): Promise<EquipmentActionState> {
  try {
    const { supabase, user, church, membership } =
      await getOperationalChurchContext();

    if (!canManageSecurityEquipment(membership.role)) {
      return { error: "You do not have permission to archive equipment." };
    }

    const existing = await getSecurityEquipmentById(equipmentId, church.id);
    if (!existing) {
      return { error: "Equipment not found." };
    }

    const { error } = await supabase
      .from("security_equipment")
      .update({
        archived_at: new Date().toISOString(),
        status:
          existing.status === "active" || existing.status === "maintenance"
            ? "retired"
            : existing.status,
        updated_by: user.id,
      })
      .eq("id", equipmentId)
      .eq("church_id", church.id);

    if (error) {
      return { error: error.message };
    }

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.EQUIPMENT_ARCHIVED,
      entityType: AuditEntityType.SECURITY_EQUIPMENT,
      entityId: equipmentId,
      metadata: { name: existing.name, previous_status: existing.status },
      ipAddress: await getRequestIpAddress(),
    });

    revalidatePath("/security-hardware");
    revalidatePath(equipmentPath(equipmentId));
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to archive equipment.",
    };
  }
}

export async function restoreSecurityEquipment(
  equipmentId: string,
): Promise<EquipmentActionState> {
  try {
    const { supabase, user, church, membership } =
      await getOperationalChurchContext();

    if (!canManageSecurityEquipment(membership.role)) {
      return { error: "You do not have permission to restore equipment." };
    }

    await requireFeature({
      churchId: church.id,
      featureKey: FEATURE_KEYS.HARDWARE_INVENTORY,
    });

    const existing = await getSecurityEquipmentById(equipmentId, church.id);
    if (!existing) {
      return { error: "Equipment not found." };
    }

    const { error } = await supabase
      .from("security_equipment")
      .update({
        archived_at: null,
        status: existing.status === "retired" ? "active" : existing.status,
        updated_by: user.id,
      })
      .eq("id", equipmentId)
      .eq("church_id", church.id);

    if (error) {
      return { error: error.message };
    }

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.EQUIPMENT_RESTORED,
      entityType: AuditEntityType.SECURITY_EQUIPMENT,
      entityId: equipmentId,
      metadata: { name: existing.name },
      ipAddress: await getRequestIpAddress(),
    });

    revalidatePath("/security-hardware");
    revalidatePath(equipmentPath(equipmentId));
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to restore equipment.",
    };
  }
}
