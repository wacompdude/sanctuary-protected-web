"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { getRequestIpAddress, writeAuditLog } from "@/lib/audit/log";
import { canManageChurchSettings } from "@/lib/church/settings";
import type { ActionState } from "@/lib/church/types";
import {
  isMultiContactType,
  labelForContactType,
  migrationHintFromContactsError,
  validateChurchContactForm,
  type ChurchContactType,
} from "@/lib/church/contacts";

function revalidateContactPaths() {
  revalidatePath("/settings/church", "layout");
  revalidatePath("/", "layout");
}

async function requireContactEditor() {
  const context = await getAuthenticatedUserWithChurch();
  if (!canManageChurchSettings(context.membership.role)) {
    return {
      error: "You do not have permission to manage church contacts.",
    } as const;
  }
  return { context } as const;
}

function safeContactError(message: string): string {
  return (
    migrationHintFromContactsError(message) ??
    (message.includes("church_contacts_singleton") ||
    message.includes("duplicate key")
      ? "A contact for that role already exists."
      : "Unable to save this contact.")
  );
}

export async function upsertChurchContact(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const validation = validateChurchContactForm(formData);
  if (validation.error) return { error: validation.error };
  if (validation.fieldErrors || !validation.data) {
    return { fieldErrors: validation.fieldErrors };
  }

  const contactId = String(formData.get("contact_id") ?? "").trim();

  try {
    const editor = await requireContactEditor();
    if ("error" in editor) return { error: editor.error };

    const { supabase, user, church } = editor.context;
    const input = validation.data;
    const payload = {
      church_id: church.id,
      contact_type: input.contactType,
      organization_name: input.organization_name,
      full_name: input.full_name,
      phone: input.phone,
      email: input.email,
      notes: input.notes,
      updated_by: user.id,
    };

    if (contactId) {
      const { data, error } = await supabase
        .from("church_contacts")
        .update(payload)
        .eq("id", contactId)
        .eq("church_id", church.id)
        .select("id")
        .maybeSingle();

      if (error) return { error: safeContactError(error.message) };
      if (!data) return { error: "Contact not found." };

      await writeAuditLog(supabase, {
        churchId: church.id,
        userId: user.id,
        action: AuditAction.CHURCH_CONTACT_UPDATED,
        entityType: AuditEntityType.CHURCH_CONTACT,
        entityId: contactId,
        metadata: {
          contact_type: input.contactType,
          label: labelForContactType(input.contactType),
        },
        ipAddress: await getRequestIpAddress(),
      });
    } else if (!isMultiContactType(input.contactType)) {
      const { data: existing } = await supabase
        .from("church_contacts")
        .select("id")
        .eq("church_id", church.id)
        .eq("contact_type", input.contactType)
        .maybeSingle();

      if (existing?.id) {
        const { error } = await supabase
          .from("church_contacts")
          .update(payload)
          .eq("id", existing.id)
          .eq("church_id", church.id);

        if (error) return { error: safeContactError(error.message) };

        await writeAuditLog(supabase, {
          churchId: church.id,
          userId: user.id,
          action: AuditAction.CHURCH_CONTACT_UPDATED,
          entityType: AuditEntityType.CHURCH_CONTACT,
          entityId: existing.id,
          metadata: {
            contact_type: input.contactType,
            label: labelForContactType(input.contactType),
          },
          ipAddress: await getRequestIpAddress(),
        });
      } else {
        const { data, error } = await supabase
          .from("church_contacts")
          .insert({ ...payload, created_by: user.id })
          .select("id")
          .single();

        if (error || !data) {
          return {
            error: safeContactError(
              error?.message ?? "Unable to create contact.",
            ),
          };
        }

        await writeAuditLog(supabase, {
          churchId: church.id,
          userId: user.id,
          action: AuditAction.CHURCH_CONTACT_CREATED,
          entityType: AuditEntityType.CHURCH_CONTACT,
          entityId: data.id,
          metadata: {
            contact_type: input.contactType,
            label: labelForContactType(input.contactType),
          },
          ipAddress: await getRequestIpAddress(),
        });
      }
    } else {
      const { data, error } = await supabase
        .from("church_contacts")
        .insert({ ...payload, created_by: user.id })
        .select("id")
        .single();

      if (error || !data) {
        return {
          error: safeContactError(
            error?.message ?? "Unable to create contact.",
          ),
        };
      }

      await writeAuditLog(supabase, {
        churchId: church.id,
        userId: user.id,
        action: AuditAction.CHURCH_CONTACT_CREATED,
        entityType: AuditEntityType.CHURCH_CONTACT,
        entityId: data.id,
        metadata: {
          contact_type: input.contactType,
          label: labelForContactType(input.contactType),
        },
        ipAddress: await getRequestIpAddress(),
      });
    }

    revalidateContactPaths();
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to save this contact.",
    };
  }
}

export async function deleteChurchContact(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const contactId = String(formData.get("contact_id") ?? "").trim();
  if (!contactId) return { error: "Missing contact." };

  try {
    const editor = await requireContactEditor();
    if ("error" in editor) return { error: editor.error };

    const { supabase, user, church } = editor.context;
    const { data: existing, error: loadError } = await supabase
      .from("church_contacts")
      .select("id, contact_type")
      .eq("id", contactId)
      .eq("church_id", church.id)
      .maybeSingle();

    if (loadError) return { error: safeContactError(loadError.message) };
    if (!existing) return { error: "Contact not found." };

    const { error } = await supabase
      .from("church_contacts")
      .delete()
      .eq("id", contactId)
      .eq("church_id", church.id);

    if (error) return { error: safeContactError(error.message) };

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.CHURCH_CONTACT_REMOVED,
      entityType: AuditEntityType.CHURCH_CONTACT,
      entityId: contactId,
      metadata: {
        contact_type: existing.contact_type,
        label: labelForContactType(existing.contact_type as ChurchContactType),
      },
      ipAddress: await getRequestIpAddress(),
    });

    revalidateContactPaths();
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to remove this contact.",
    };
  }
}
