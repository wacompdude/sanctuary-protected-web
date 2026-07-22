"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import type { ActionState } from "@/lib/church/types";
import { hasMinRole } from "@/lib/church/navigation";
import {
  EMAIL_SENDER_LABELS,
  EMERGENCY_ELIGIBLE_NOTIFICATION_TYPES,
  isEmailSenderCategory,
  mapNotificationTypeToSenderCategory,
  type EmailSenderCategory,
} from "@/lib/email";
import { canManageNotificationTemplates } from "@/lib/notifications/permissions";
import { writeAuditLog } from "@/lib/audit/log";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";

/**
 * Church template overrides may set a default sender category.
 * System templates are seeded/read-only for sender category.
 * Emergency is restricted to owner/co_owner/administrator.
 */
export async function updateTemplateSenderCategoryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase, church, user, membership } =
      await getAuthenticatedUserWithChurch();
    if (!canManageNotificationTemplates(membership.role)) {
      return { error: "You do not have permission to update templates." };
    }

    const templateId = String(formData.get("template_id") ?? "").trim();
    const categoryRaw = String(formData.get("default_sender_category") ?? "").trim();

    if (!templateId) return { error: "Template is required." };
    if (categoryRaw && !isEmailSenderCategory(categoryRaw)) {
      return { error: "Select a valid sender category." };
    }

    const { data: template, error: loadError } = await supabase
      .from("notification_templates")
      .select(
        "id, church_id, template_key, is_system_template, default_sender_category",
      )
      .eq("id", templateId)
      .maybeSingle();

    if (loadError || !template) {
      return { error: loadError?.message ?? "Template not found." };
    }

    const row = template as {
      id: string;
      church_id: string | null;
      template_key: string;
      is_system_template: boolean;
      default_sender_category: string | null;
    };

    if (row.is_system_template || row.church_id == null) {
      return {
        error:
          "System template sender categories are platform-controlled. Create a church override to customize.",
      };
    }

    if (row.church_id !== church.id) {
      return { error: "Template not found for this church." };
    }

    if (categoryRaw === "emergency" && !hasMinRole(membership.role, "administrator")) {
      return {
        error: "Only owners and administrators can assign the emergency sender.",
      };
    }

    if (categoryRaw === "emergency") {
      const mapped = mapNotificationTypeToSenderCategory(row.template_key);
      const eligible =
        mapped.category === "emergency" ||
        EMERGENCY_ELIGIBLE_NOTIFICATION_TYPES.has(row.template_key);
      if (!eligible) {
        return {
          error:
            "Emergency sender is not allowed for this notification type.",
        };
      }
    }

    const nextCategory: EmailSenderCategory | null = isEmailSenderCategory(
      categoryRaw,
    )
      ? categoryRaw
      : null;
    const { error } = await supabase
      .from("notification_templates")
      .update({
        default_sender_category: nextCategory,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("church_id", church.id);

    if (error) {
      if (/default_sender_category|column/i.test(error.message)) {
        return {
          error:
            "Sender category column is missing. Apply supabase/migrations/037_email_sender_snapshots.sql.",
        };
      }
      return { error: error.message };
    }

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.EMAIL_SENDER_CATEGORY_CHANGED,
      entityType: AuditEntityType.NOTIFICATION_TEMPLATE,
      entityId: row.id,
      metadata: {
        template_key: row.template_key,
        previous_category: row.default_sender_category,
        sender_category: nextCategory,
        label: nextCategory ? EMAIL_SENDER_LABELS[nextCategory] : null,
      },
    });

    revalidatePath("/notifications/templates");
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to update template sender category.",
    };
  }
}
