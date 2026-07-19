"use server";

import { revalidatePath } from "next/cache";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { getRequestIpAddress, writeAuditLog } from "@/lib/audit/log";
import { getOperationalChurchContext } from "@/lib/church/auth";
import type { ActionState } from "@/lib/church/types";
import {
  POLICY_ATTACHMENT_MAX_COUNT,
  POLICY_MEDIA_BUCKET,
  collectPolicyAttachmentFiles,
  isPolicyMediaStoragePath,
  uploadPolicyAttachmentFiles,
  validatePolicyAttachmentFile,
} from "@/lib/policies/attachment-storage";
import { POLICY_ATTACHMENT_TYPES } from "@/lib/policies/constants";
import { canManagePolicyDocuments } from "@/lib/policies/permissions";
import { getPolicyById } from "@/lib/policies/queries";
import type { PolicyAttachmentType } from "@/lib/policies/types";

function revalidatePolicy(policyId: string) {
  revalidatePath("/policies");
  revalidatePath("/policies/manage");
  revalidatePath(`/policies/${policyId}`);
  revalidatePath(`/policies/${policyId}/edit`);
}

export async function uploadPolicyAttachments(
  policyId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase, user, church, membership } =
      await getOperationalChurchContext();

    if (!canManagePolicyDocuments(membership.role)) {
      return { error: "You do not have permission to upload attachments." };
    }

    const policy = await getPolicyById(church.id, policyId);
    if (!policy) return { error: "Policy not found." };
    if (!policy.current_version_id) {
      return { error: "This policy has no version to attach files to." };
    }

    const typeRaw = String(formData.get("attachment_type") ?? "").trim();
    let attachmentType: PolicyAttachmentType | undefined;
    if (typeRaw) {
      if (!POLICY_ATTACHMENT_TYPES.some((item) => item.value === typeRaw)) {
        return { fieldErrors: { attachment_type: "Select a valid type." } };
      }
      attachmentType = typeRaw as PolicyAttachmentType;
    }

    const files = collectPolicyAttachmentFiles(formData);
    if (files.length === 0) {
      return { fieldErrors: { files: "Choose at least one PDF or Word file." } };
    }

    const { count } = await supabase
      .from("policy_attachments")
      .select("id", { count: "exact", head: true })
      .eq("policy_document_id", policyId)
      .is("archived_at", null);

    if ((count ?? 0) + files.length > POLICY_ATTACHMENT_MAX_COUNT) {
      return {
        error: `Policies can have at most ${POLICY_ATTACHMENT_MAX_COUNT} attachments.`,
      };
    }

    for (const file of files) {
      const fileError = validatePolicyAttachmentFile(file);
      if (fileError) {
        return { error: fileError, fieldErrors: { files: fileError } };
      }
    }

    const result = await uploadPolicyAttachmentFiles({
      supabase,
      churchId: church.id,
      policyId,
      versionId: policy.current_version_id,
      userId: user.id,
      files,
      attachmentType,
    });

    if (result.error) {
      return { error: result.error, fieldErrors: { files: result.error } };
    }

    if (result.uploaded > 0) {
      await writeAuditLog(supabase, {
        churchId: church.id,
        userId: user.id,
        action: AuditAction.POLICY_ATTACHMENT_UPLOADED,
        entityType: AuditEntityType.POLICY_ATTACHMENT,
        entityId: policyId,
        metadata: {
          policy_id: policyId,
          uploaded_count: result.uploaded,
        },
        ipAddress: await getRequestIpAddress(),
      });
    }

    revalidatePolicy(policyId);
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to upload attachments.",
    };
  }
}

export async function archivePolicyAttachment(
  attachmentId: string,
): Promise<ActionState> {
  try {
    const { supabase, user, church, membership } =
      await getOperationalChurchContext();

    if (!canManagePolicyDocuments(membership.role)) {
      return { error: "You do not have permission to remove attachments." };
    }

    const { data: attachment, error } = await supabase
      .from("policy_attachments")
      .select("id, policy_document_id, storage_path, church_id")
      .eq("id", attachmentId)
      .eq("church_id", church.id)
      .maybeSingle();

    if (error || !attachment) {
      return { error: "Attachment not found." };
    }

    const { error: updateError } = await supabase
      .from("policy_attachments")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", attachmentId)
      .eq("church_id", church.id);

    if (updateError) {
      return { error: updateError.message };
    }

    if (
      isPolicyMediaStoragePath(
        String(attachment.storage_path),
        church.id,
        String(attachment.policy_document_id),
      )
    ) {
      await supabase.storage
        .from(POLICY_MEDIA_BUCKET)
        .remove([String(attachment.storage_path)]);
    }

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.POLICY_ATTACHMENT_REMOVED,
      entityType: AuditEntityType.POLICY_ATTACHMENT,
      entityId: attachmentId,
      metadata: {
        policy_id: attachment.policy_document_id,
        storage_path: attachment.storage_path,
      },
      ipAddress: await getRequestIpAddress(),
    });

    revalidatePolicy(String(attachment.policy_document_id));
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to remove attachment.",
    };
  }
}
