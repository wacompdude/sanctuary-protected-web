"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import {
  auditCampusCreated,
  auditCampusUpdated,
} from "@/lib/audit/church-events";
import { getRequestIpAddress, writeAuditLog } from "@/lib/audit/log";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
} from "@/lib/church/auth";
import {
  CAMPUS_MIGRATION_HINT,
  campusMigrationHintFromError,
} from "@/lib/campuses/constants";
import { canManageCampuses } from "@/lib/campuses/permissions";
import type { CampusActionState } from "@/lib/campuses/types";
import { validateCampusForm } from "@/lib/campuses/validation";
import { createClient } from "@/lib/supabase/server";
import { requireCampusCreateCapacity } from "@/lib/subscriptions/enforcement";

function isRedirectError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "digest" in error &&
      String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT"),
  );
}

async function requireCampusManager() {
  const ctx = await getAuthenticatedUserWithChurch();
  if (!canManageCampuses(ctx.membership.role)) {
    throw new ChurchAccessError(
      "You do not have permission to manage campuses.",
    );
  }
  return ctx;
}

function revalidateCampusPaths(campusId?: string) {
  revalidatePath("/campuses");
  if (campusId) {
    revalidatePath(`/campuses/${campusId}`);
    revalidatePath(`/campuses/${campusId}/edit`);
    revalidatePath(`/campuses/${campusId}/settings`);
  }
}

async function clearOtherPrimaries(
  supabase: Awaited<ReturnType<typeof createClient>>,
  churchId: string,
  exceptCampusId?: string,
) {
  let query = supabase
    .from("campuses")
    .update({ is_primary: false })
    .eq("church_id", churchId)
    .eq("is_primary", true);
  if (exceptCampusId) {
    query = query.neq("id", exceptCampusId);
  }
  await query;
}

export async function createCampusAction(
  _prev: CampusActionState,
  formData: FormData,
): Promise<CampusActionState> {
  try {
    const { user, church } = await requireCampusManager();
    const validated = validateCampusForm(formData);
    if (!validated.data) {
      return {
        error: validated.error ?? "Invalid campus data.",
        fieldErrors: validated.fieldErrors,
      };
    }

    await requireCampusCreateCapacity({
      churchId: church.id,
      willBeActive: validated.data.status === "active",
    });

    const supabase = await createClient();

    const { data: existingPrimary } = await supabase
      .from("campuses")
      .select("id")
      .eq("church_id", church.id)
      .eq("is_primary", true)
      .maybeSingle();

    const makePrimary = validated.data.is_primary || !existingPrimary;
    if (makePrimary) {
      await clearOtherPrimaries(supabase, church.id);
    }

    const payload = {
      church_id: church.id,
      ...validated.data,
      is_primary: makePrimary,
      timezone:
        validated.data.timezone ||
        church.timezone ||
        "America/Los_Angeles",
      archived_at:
        validated.data.status === "archived" ? new Date().toISOString() : null,
      created_by: user.id,
      updated_by: user.id,
    };

    const { data, error } = await supabase
      .from("campuses")
      .insert(payload)
      .select("id")
      .single();

    if (error || !data) {
      if (/duplicate|unique/i.test(error?.message ?? "")) {
        return {
          error: "A campus with that name or slug already exists.",
          fieldErrors: { name: "Must be unique within this church." },
        };
      }
      return {
        error:
          campusMigrationHintFromError(error?.message ?? "") ??
          error?.message ??
          CAMPUS_MIGRATION_HINT,
      };
    }

    await auditCampusCreated(supabase, {
      churchId: church.id,
      userId: user.id,
      campusId: data.id,
      name: validated.data.name,
    });

    revalidateCampusPaths(data.id);
    redirect(`/campuses/${data.id}`);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (error instanceof ChurchAccessError) return { error: error.message };
    return {
      error: error instanceof Error ? error.message : "Unable to create campus.",
    };
  }
}

export async function updateCampusAction(
  campusId: string,
  _prev: CampusActionState,
  formData: FormData,
): Promise<CampusActionState> {
  try {
    const { user, church } = await requireCampusManager();
    const validated = validateCampusForm(formData);
    if (!validated.data) {
      return {
        error: validated.error ?? "Invalid campus data.",
        fieldErrors: validated.fieldErrors,
      };
    }

    const supabase = await createClient();
    if (validated.data.is_primary) {
      await clearOtherPrimaries(supabase, church.id, campusId);
    }

    const { data: existing } = await supabase
      .from("campuses")
      .select("id, is_primary, status")
      .eq("church_id", church.id)
      .eq("id", campusId)
      .maybeSingle();

    if (!existing) {
      return { error: "Campus not found." };
    }

    // Never leave the church without a primary
    if (existing.is_primary && !validated.data.is_primary) {
      return {
        error:
          "Set another campus as primary before removing the primary flag.",
        fieldErrors: { is_primary: "Required for the current primary campus." },
      };
    }

    if (
      existing.is_primary &&
      (validated.data.status === "archived" ||
        validated.data.status === "closed")
    ) {
      return {
        error:
          "Set another campus as primary before closing or archiving this one.",
        fieldErrors: { status: "Primary campus cannot be closed or archived." },
      };
    }

    const { error } = await supabase
      .from("campuses")
      .update({
        ...validated.data,
        timezone:
          validated.data.timezone ||
          church.timezone ||
          "America/Los_Angeles",
        archived_at:
          validated.data.status === "archived"
            ? new Date().toISOString()
            : null,
        updated_by: user.id,
      })
      .eq("church_id", church.id)
      .eq("id", campusId);

    if (error) {
      if (/duplicate|unique/i.test(error.message)) {
        return {
          error: "A campus with that name or slug already exists.",
          fieldErrors: { name: "Must be unique within this church." },
        };
      }
      return {
        error:
          campusMigrationHintFromError(error.message) ??
          "Unable to update campus.",
      };
    }

    await auditCampusUpdated(supabase, {
      churchId: church.id,
      userId: user.id,
      campusId,
      changedFields: Object.keys(validated.data),
    });

    if (existing.status !== validated.data.status) {
      await writeAuditLog(supabase, {
        churchId: church.id,
        userId: user.id,
        action: AuditAction.CAMPUS_STATUS_CHANGED,
        entityType: AuditEntityType.CAMPUS,
        entityId: campusId,
        metadata: {
          previous_status: existing.status,
          new_status: validated.data.status,
        },
        ipAddress: await getRequestIpAddress(),
      });
    }

    if (!existing.is_primary && validated.data.is_primary) {
      await writeAuditLog(supabase, {
        churchId: church.id,
        userId: user.id,
        action: AuditAction.CAMPUS_PRIMARY_CHANGED,
        entityType: AuditEntityType.CAMPUS,
        entityId: campusId,
        metadata: { is_primary: true },
        ipAddress: await getRequestIpAddress(),
      });
    }

    revalidateCampusPaths(campusId);
    return { success: true, campusId };
  } catch (error) {
    if (error instanceof ChurchAccessError) return { error: error.message };
    return {
      error: error instanceof Error ? error.message : "Unable to update campus.",
    };
  }
}

export async function updateCampusStatusAction(
  campusId: string,
  _prev: CampusActionState,
  formData: FormData,
): Promise<CampusActionState> {
  try {
    const { user, church } = await requireCampusManager();
    const status = String(formData.get("status") ?? "").trim();
    const allowed = [
      "planned",
      "active",
      "inactive",
      "suspended",
      "closed",
      "archived",
    ];
    if (!allowed.includes(status)) {
      return {
        error: "Select a valid status.",
        fieldErrors: { status: "Invalid status." },
      };
    }

    const supabase = await createClient();
    const { data: existing } = await supabase
      .from("campuses")
      .select("id, is_primary, status, name")
      .eq("church_id", church.id)
      .eq("id", campusId)
      .maybeSingle();

    if (!existing) return { error: "Campus not found." };

    if (
      existing.is_primary &&
      (status === "archived" || status === "closed")
    ) {
      return {
        error:
          "Set another campus as primary before closing or archiving this one.",
        fieldErrors: { status: "Primary campus cannot be closed or archived." },
      };
    }

    if (existing.status === status) {
      return { success: true, campusId };
    }

    if (status === "active" && existing.status !== "active") {
      await requireCampusCreateCapacity({
        churchId: church.id,
        willBeActive: true,
      });
    }

    const { error } = await supabase
      .from("campuses")
      .update({
        status,
        archived_at:
          status === "archived" ? new Date().toISOString() : null,
        updated_by: user.id,
      })
      .eq("church_id", church.id)
      .eq("id", campusId);

    if (error) {
      return {
        error:
          campusMigrationHintFromError(error.message) ??
          "Unable to update campus status.",
      };
    }

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action:
        status === "archived"
          ? AuditAction.CAMPUS_ARCHIVED
          : AuditAction.CAMPUS_STATUS_CHANGED,
      entityType: AuditEntityType.CAMPUS,
      entityId: campusId,
      metadata: {
        name: existing.name,
        previous_status: existing.status,
        new_status: status,
      },
      ipAddress: await getRequestIpAddress(),
    });

    revalidateCampusPaths(campusId);
    return { success: true, campusId };
  } catch (error) {
    if (error instanceof ChurchAccessError) return { error: error.message };
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to update campus status.",
    };
  }
}

export async function setPrimaryCampusAction(
  campusId: string,
): Promise<CampusActionState> {
  try {
    const { user, church } = await requireCampusManager();
    const supabase = await createClient();

    const { data: campus } = await supabase
      .from("campuses")
      .select("id, status, name")
      .eq("church_id", church.id)
      .eq("id", campusId)
      .maybeSingle();

    if (!campus) return { error: "Campus not found." };
    if (campus.status === "archived" || campus.status === "closed") {
      return { error: "Choose an active or planned campus as primary." };
    }

    await clearOtherPrimaries(supabase, church.id, campusId);
    const { error } = await supabase
      .from("campuses")
      .update({
        is_primary: true,
        campus_type: "main",
        updated_by: user.id,
      })
      .eq("church_id", church.id)
      .eq("id", campusId);

    if (error) {
      return {
        error:
          campusMigrationHintFromError(error.message) ??
          "Unable to set primary campus.",
      };
    }

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.CAMPUS_PRIMARY_CHANGED,
      entityType: AuditEntityType.CAMPUS,
      entityId: campusId,
      metadata: { name: campus.name, is_primary: true },
      ipAddress: await getRequestIpAddress(),
    });

    revalidateCampusPaths(campusId);
    return { success: true, campusId };
  } catch (error) {
    if (error instanceof ChurchAccessError) return { error: error.message };
    return {
      error:
        error instanceof Error ? error.message : "Unable to set primary campus.",
    };
  }
}
