"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { getRequestIpAddress, writeAuditLog } from "@/lib/audit/log";
import { getOperationalChurchContext } from "@/lib/church/auth";
import { POLICY_MIGRATION_HINT } from "@/lib/policies/constants";
import { canManagePolicyDocuments } from "@/lib/policies/permissions";
import { assignPolicyAcknowledgments } from "@/lib/policies/acknowledgments";
import {
  POLICY_ATTACHMENT_MAX_COUNT,
  collectPolicyAttachmentFiles,
  uploadPolicyAttachmentFiles,
  validatePolicyAttachmentFile,
} from "@/lib/policies/attachment-storage";
import {
  notifyPolicyAcknowledgmentsRequired,
  notifyPolicyPublished,
} from "@/lib/policies/notify";
import {
  getDefaultReviewPeriodDays,
  getPolicyById,
  listCampusesForPolicies,
  listPolicyCategories,
  listPolicyVersions,
} from "@/lib/policies/queries";
import type {
  PolicyActionState,
  PolicyApprovalDecision,
  PolicyDocumentStatus,
  PolicyVersionStatus,
  PolicyWorkflowAction,
} from "@/lib/policies/types";
import {
  validatePolicyForm,
  validateWorkflowNotes,
  type PolicyFormInput,
} from "@/lib/policies/validation";
import {
  countWords,
  formatVersionLabel,
  initialDraftVersionNumber,
  nextDraftVersionNumber,
  slugifyPolicyTitle,
  versionNumberForPublish,
} from "@/lib/policies/versioning";
import {
  canPerformWorkflowAction,
  isEditableVersionStatus,
  nextDocumentStatus,
  nextVersionStatus,
} from "@/lib/policies/workflow";

type SupabaseClient = Awaited<
  ReturnType<typeof getOperationalChurchContext>
>["supabase"];

function policyPath(id: string) {
  return `/policies/${id}`;
}

function policyEditPath(id: string) {
  return `/policies/${id}/edit`;
}

function migrationOrError(message: string | undefined, fallback: string) {
  if (
    message &&
    /policy_documents|policy_versions|033_policy|PGRST205|42P01|does not exist/i.test(
      message,
    )
  ) {
    return POLICY_MIGRATION_HINT;
  }
  return message || fallback;
}

async function assertCampusBelongsToChurch(
  churchId: string,
  campusId: string | null,
): Promise<string | null> {
  if (!campusId) return null;
  const campuses = await listCampusesForPolicies(churchId);
  if (!campuses.some((campus) => campus.id === campusId)) {
    return "Selected campus does not belong to this church.";
  }
  return null;
}

async function assertCategoryBelongsToChurch(
  churchId: string,
  categoryId: string | null,
): Promise<string | null> {
  if (!categoryId) return null;
  const categories = await listPolicyCategories(churchId);
  if (!categories.some((category) => category.id === categoryId)) {
    return "Selected category does not belong to this church.";
  }
  return null;
}

async function allocateUniqueSlug(
  supabase: SupabaseClient,
  churchId: string,
  title: string,
  excludeId?: string,
): Promise<string> {
  const base = slugifyPolicyTitle(title);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const slug = attempt === 0 ? base : `${base.slice(0, 70)}-${attempt + 1}`;
    let query = supabase
      .from("policy_documents")
      .select("id")
      .eq("church_id", churchId)
      .eq("slug", slug)
      .limit(1);
    if (excludeId) query = query.neq("id", excludeId);
    const { data, error } = await query;
    if (error) {
      throw new Error(error.message);
    }
    if (!data || data.length === 0) return slug;
  }
  return `${base.slice(0, 60)}-${Date.now().toString(36)}`;
}

function tagSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "tag"
  );
}

async function syncPolicyTags(params: {
  supabase: SupabaseClient;
  churchId: string;
  policyId: string;
  tags: string[];
}) {
  const { supabase, churchId, policyId, tags } = params;
  await supabase
    .from("policy_document_tags")
    .delete()
    .eq("church_id", churchId)
    .eq("policy_document_id", policyId);

  if (tags.length === 0) return;

  const tagIds: string[] = [];
  for (const name of tags) {
    const slug = tagSlug(name);
    const { data: existing } = await supabase
      .from("policy_tags")
      .select("id")
      .eq("church_id", churchId)
      .eq("slug", slug)
      .maybeSingle();

    if (existing?.id) {
      tagIds.push(existing.id);
      continue;
    }

    const { data: created, error } = await supabase
      .from("policy_tags")
      .insert({ church_id: churchId, name: name.slice(0, 80), slug })
      .select("id")
      .single();
    if (error || !created) {
      throw new Error(error?.message || "Unable to create policy tag.");
    }
    tagIds.push(created.id);
  }

  const { error } = await supabase.from("policy_document_tags").insert(
    tagIds.map((tag_id) => ({
      church_id: churchId,
      policy_document_id: policyId,
      tag_id,
    })),
  );
  if (error) {
    throw new Error(error.message);
  }
}

async function refreshSearch(
  supabase: SupabaseClient,
  policyId: string,
) {
  try {
    await supabase.rpc("refresh_policy_document_search", {
      p_document_id: policyId,
    });
  } catch {
    // Best-effort; search still works via title/summary filters.
  }
}

async function insertApproval(params: {
  supabase: SupabaseClient;
  churchId: string;
  policyId: string;
  versionId: string;
  userId: string;
  decision: PolicyApprovalDecision;
  notes?: string | null;
}) {
  const { error } = await params.supabase.from("policy_approvals").insert({
    church_id: params.churchId,
    policy_document_id: params.policyId,
    policy_version_id: params.versionId,
    decision: params.decision,
    notes: params.notes ?? null,
    actor_user_id: params.userId,
  });
  if (error) {
    throw new Error(error.message);
  }
}

function documentFieldsFromInput(
  input: PolicyFormInput,
  userId: string,
  slug?: string,
) {
  return {
    ...(slug ? { slug } : {}),
    title: input.title,
    document_type: input.document_type,
    category_id: input.category_id,
    campus_id: input.campus_id,
    summary: input.summary,
    audience_scope: input.audience_scope,
    minimum_role: input.minimum_role,
    requires_acknowledgment: input.requires_acknowledgment,
    acknowledgment_due_days: input.acknowledgment_due_days,
    reacknowledge_on_publish: input.reacknowledge_on_publish,
    is_emergency_document: input.is_emergency_document,
    is_featured: input.is_featured,
    mobile_available: input.mobile_available,
    offline_mobile_allowed: input.offline_mobile_allowed,
    effective_date: input.effective_date,
    review_due_date: input.review_due_date,
    updated_by: userId,
  };
}

export async function createPolicy(
  _prev: PolicyActionState,
  formData: FormData,
): Promise<PolicyActionState> {
  let policyId = "";

  try {
    const { supabase, user, church, membership } =
      await getOperationalChurchContext();

    if (!canManagePolicyDocuments(membership.role)) {
      return { error: "You do not have permission to create policies." };
    }

    const validation = validatePolicyForm(formData);
    if (validation.fieldErrors || !validation.data) {
      return { fieldErrors: validation.fieldErrors };
    }

    const input = validation.data;
    const campusError = await assertCampusBelongsToChurch(
      church.id,
      input.campus_id,
    );
    if (campusError) return { fieldErrors: { campus_id: campusError } };

    const categoryError = await assertCategoryBelongsToChurch(
      church.id,
      input.category_id,
    );
    if (categoryError) {
      return { fieldErrors: { category_id: categoryError } };
    }

    const attachmentFiles = collectPolicyAttachmentFiles(formData);
    if (attachmentFiles.length > POLICY_ATTACHMENT_MAX_COUNT) {
      return {
        fieldErrors: {
          attachments: `You can attach at most ${POLICY_ATTACHMENT_MAX_COUNT} files.`,
        },
      };
    }
    for (const file of attachmentFiles) {
      const fileError = validatePolicyAttachmentFile(file);
      if (fileError) {
        return { fieldErrors: { attachments: fileError } };
      }
    }

    const slug = await allocateUniqueSlug(supabase, church.id, input.title);
    const versionNumber = initialDraftVersionNumber();
    const versionLabel = formatVersionLabel(versionNumber);

    const { data: document, error: docError } = await supabase
      .from("policy_documents")
      .insert({
        church_id: church.id,
        ...documentFieldsFromInput(input, user.id, slug),
        status: "draft" satisfies PolicyDocumentStatus,
        owner_user_id: user.id,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (docError || !document) {
      return {
        error: migrationOrError(docError?.message, "Unable to create policy."),
      };
    }

    policyId = document.id;

    const { data: version, error: versionError } = await supabase
      .from("policy_versions")
      .insert({
        church_id: church.id,
        policy_document_id: policyId,
        version_number: versionNumber,
        version_label: versionLabel,
        title_snapshot: input.title,
        summary_snapshot: input.summary,
        content: input.content,
        content_format: "markdown",
        change_summary: input.change_summary ?? "Initial draft",
        created_by: user.id,
        status: "draft" satisfies PolicyVersionStatus,
        word_count: countWords(input.content),
      })
      .select("id")
      .single();

    if (versionError || !version) {
      return {
        error: migrationOrError(
          versionError?.message,
          "Policy created, but the first version failed.",
        ),
      };
    }

    const { error: linkError } = await supabase
      .from("policy_documents")
      .update({
        current_version_id: version.id,
        updated_by: user.id,
      })
      .eq("id", policyId)
      .eq("church_id", church.id);

    if (linkError) {
      return { error: linkError.message };
    }

    await syncPolicyTags({
      supabase,
      churchId: church.id,
      policyId,
      tags: input.tags,
    });
    await refreshSearch(supabase, policyId);

    let attachmentCount = 0;
    let attachmentError: string | undefined;
    if (attachmentFiles.length > 0) {
      const uploadResult = await uploadPolicyAttachmentFiles({
        supabase,
        churchId: church.id,
        policyId,
        versionId: version.id,
        userId: user.id,
        files: attachmentFiles,
      });
      attachmentCount = uploadResult.uploaded;
      if (uploadResult.error) {
        attachmentError = uploadResult.error;
      }
    }

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.POLICY_CREATED,
      entityType: AuditEntityType.POLICY_DOCUMENT,
      entityId: policyId,
      metadata: {
        title: input.title,
        document_type: input.document_type,
        version_label: versionLabel,
        attachment_count: attachmentCount,
        attachment_error: attachmentError,
      },
      ipAddress: await getRequestIpAddress(),
    });

    if (attachmentError) {
      // Policy was created; surface attachment issue after redirect via edit page.
      console.error("Policy attachment upload failed:", attachmentError);
    }
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to create policy.",
    };
  }

  revalidatePath("/policies");
  revalidatePath("/policies/manage");
  revalidatePath(policyPath(policyId));
  revalidatePath(policyEditPath(policyId));
  redirect(policyEditPath(policyId));
}

export async function updatePolicy(
  policyId: string,
  _prev: PolicyActionState,
  formData: FormData,
): Promise<PolicyActionState> {
  try {
    const { supabase, user, church, membership } =
      await getOperationalChurchContext();

    if (!canManagePolicyDocuments(membership.role)) {
      return { error: "You do not have permission to update policies." };
    }

    const existing = await getPolicyById(church.id, policyId);
    if (!existing) {
      return { error: "Policy not found." };
    }

    if (
      existing.status === "archived" ||
      existing.status === "retired" ||
      existing.status === "published"
    ) {
      return {
        error:
          existing.status === "published"
            ? "Start a revision before editing a published policy."
            : "Restore this policy before editing.",
      };
    }

    const validation = validatePolicyForm(formData);
    if (validation.fieldErrors || !validation.data) {
      return { fieldErrors: validation.fieldErrors };
    }

    const input = validation.data;
    const campusError = await assertCampusBelongsToChurch(
      church.id,
      input.campus_id,
    );
    if (campusError) return { fieldErrors: { campus_id: campusError } };

    const categoryError = await assertCategoryBelongsToChurch(
      church.id,
      input.category_id,
    );
    if (categoryError) {
      return { fieldErrors: { category_id: categoryError } };
    }

    const slug =
      existing.title === input.title
        ? existing.slug
        : await allocateUniqueSlug(supabase, church.id, input.title, policyId);

    const currentVersion = existing.current_version;
    if (!currentVersion || !isEditableVersionStatus(currentVersion.status)) {
      return {
        error: "No editable draft version is available. Start a revision first.",
      };
    }

    const { error: docError } = await supabase
      .from("policy_documents")
      .update(documentFieldsFromInput(input, user.id, slug))
      .eq("id", policyId)
      .eq("church_id", church.id);

    if (docError) {
      return {
        error: migrationOrError(docError.message, "Unable to update policy."),
      };
    }

    const { error: versionError } = await supabase
      .from("policy_versions")
      .update({
        title_snapshot: input.title,
        summary_snapshot: input.summary,
        content: input.content,
        change_summary: input.change_summary,
        word_count: countWords(input.content),
      })
      .eq("id", currentVersion.id)
      .eq("church_id", church.id);

    if (versionError) {
      return {
        error: migrationOrError(
          versionError.message,
          "Unable to update policy version.",
        ),
      };
    }

    await syncPolicyTags({
      supabase,
      churchId: church.id,
      policyId,
      tags: input.tags,
    });
    await refreshSearch(supabase, policyId);

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.POLICY_UPDATED,
      entityType: AuditEntityType.POLICY_DOCUMENT,
      entityId: policyId,
      metadata: {
        title: input.title,
        version_id: currentVersion.id,
        version_label: currentVersion.version_label,
      },
      ipAddress: await getRequestIpAddress(),
    });
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to update policy.",
    };
  }

  revalidatePath("/policies");
  revalidatePath("/policies/manage");
  revalidatePath(policyPath(policyId));
  revalidatePath(policyEditPath(policyId));
  return { success: true };
}

async function runWorkflowAction(params: {
  policyId: string;
  action: PolicyWorkflowAction;
  formData?: FormData;
}): Promise<PolicyActionState> {
  const { policyId, action, formData } = params;

  try {
    const { supabase, user, church, membership } =
      await getOperationalChurchContext();

    if (!canManagePolicyDocuments(membership.role)) {
      return { error: "You do not have permission to manage policies." };
    }

    const existing = await getPolicyById(church.id, policyId);
    if (!existing) return { error: "Policy not found." };

    if (!canPerformWorkflowAction(existing.status, action)) {
      return {
        error: `Cannot ${action.replaceAll("_", " ")} from ${existing.status.replaceAll("_", " ")}.`,
      };
    }

    const notesResult = formData
      ? validateWorkflowNotes(
          formData,
          action === "request_changes",
        )
      : { notes: null as string | null };
    if (notesResult.fieldErrors) {
      return { fieldErrors: notesResult.fieldErrors };
    }

    const nextStatus = nextDocumentStatus(existing.status, action);
    if (!nextStatus) {
      return { error: "Invalid workflow transition." };
    }

    const now = new Date().toISOString();
    let versionId = existing.current_version_id;

    if (action === "start_revision") {
      const versions = await listPolicyVersions(church.id, policyId);
      const published = versions.find((version) => version.status === "published");
      const source = published ?? existing.current_version;
      if (!source) {
        return { error: "No published version available to revise." };
      }

      const draftNumber = nextDraftVersionNumber(source.version_number);
      const { data: draft, error: draftError } = await supabase
        .from("policy_versions")
        .insert({
          church_id: church.id,
          policy_document_id: policyId,
          version_number: draftNumber,
          version_label: formatVersionLabel(draftNumber),
          title_snapshot: existing.title,
          summary_snapshot: existing.summary,
          content: source.content,
          content_format: source.content_format,
          change_summary: null,
          created_by: user.id,
          status: "draft" satisfies PolicyVersionStatus,
          word_count: countWords(source.content),
        })
        .select("id")
        .single();

      if (draftError || !draft) {
        return {
          error: migrationOrError(
            draftError?.message,
            "Unable to start a revision.",
          ),
        };
      }

      versionId = draft.id;
      const { error: docError } = await supabase
        .from("policy_documents")
        .update({
          status: "draft" satisfies PolicyDocumentStatus,
          current_version_id: draft.id,
          updated_by: user.id,
          retired_at: null,
          archived_at: null,
        })
        .eq("id", policyId)
        .eq("church_id", church.id);

      if (docError) {
        return { error: docError.message };
      }

      await writeAuditLog(supabase, {
        churchId: church.id,
        userId: user.id,
        action: AuditAction.POLICY_REVISION_STARTED,
        entityType: AuditEntityType.POLICY_DOCUMENT,
        entityId: policyId,
        metadata: {
          version_id: draft.id,
          version_label: formatVersionLabel(draftNumber),
          from_version_id: source.id,
        },
        ipAddress: await getRequestIpAddress(),
      });

      revalidatePath("/policies");
      revalidatePath("/policies/manage");
      revalidatePath(policyPath(policyId));
      revalidatePath(policyEditPath(policyId));
      return { success: true };
    }

    if (!versionId || !existing.current_version) {
      return { error: "This policy has no current version." };
    }

    if (action === "publish") {
      const content = existing.current_version.content?.trim() ?? "";
      if (!content) {
        return {
          fieldErrors: {
            content: "Add policy content before publishing.",
          },
        };
      }

      const changeSummary =
        (formData
          ? String(formData.get("notes") ?? "").trim()
          : "") ||
        existing.current_version.change_summary?.trim() ||
        "";
      if (!changeSummary) {
        return {
          fieldErrors: {
            notes:
              "Add a change summary (or notes) before publishing.",
          },
        };
      }

      const versions = await listPolicyVersions(church.id, policyId);
      const priorPublished = versions.filter(
        (version) =>
          version.status === "published" || version.status === "superseded",
      );
      const hasPriorPublished = priorPublished.some(
        (version) => version.id !== existing.current_version_id,
      );
      const publishNumber = versionNumberForPublish(
        existing.current_version.version_number,
        hasPriorPublished,
      );
      const publishLabel = formatVersionLabel(publishNumber);

      for (const version of versions) {
        if (
          version.status === "published" &&
          version.id !== existing.current_version_id
        ) {
          const { error: supersedeError } = await supabase
            .from("policy_versions")
            .update({
              status: "superseded" satisfies PolicyVersionStatus,
              superseded_at: now,
            })
            .eq("id", version.id)
            .eq("church_id", church.id);
          if (supersedeError) {
            return { error: supersedeError.message };
          }
        }
      }

      const reviewDays = await getDefaultReviewPeriodDays(church.id);
      const reviewDue =
        existing.review_due_date ??
        new Date(Date.now() + reviewDays * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);

      const { error: versionError } = await supabase
        .from("policy_versions")
        .update({
          status: "published" satisfies PolicyVersionStatus,
          version_number: publishNumber,
          version_label: publishLabel,
          change_summary: changeSummary,
          published_at: now,
          approved_by: existing.current_version.approved_by ?? user.id,
          approved_at: existing.current_version.approved_at ?? now,
        })
        .eq("id", existing.current_version_id!)
        .eq("church_id", church.id);

      if (versionError) {
        return {
          error: migrationOrError(
            versionError.message,
            "Unable to publish this version.",
          ),
        };
      }

      const { error: docError } = await supabase
        .from("policy_documents")
        .update({
          status: "published" satisfies PolicyDocumentStatus,
          published_by: user.id,
          published_at: now,
          effective_date: existing.effective_date ?? now.slice(0, 10),
          review_due_date: reviewDue,
          updated_by: user.id,
          retired_at: null,
          archived_at: null,
        })
        .eq("id", policyId)
        .eq("church_id", church.id);

      if (docError) {
        return { error: docError.message };
      }

      await insertApproval({
        supabase,
        churchId: church.id,
        policyId,
        versionId: existing.current_version_id!,
        userId: user.id,
        decision: "published",
        notes: changeSummary,
      });
      await refreshSearch(supabase, policyId);

      await writeAuditLog(supabase, {
        churchId: church.id,
        userId: user.id,
        action: AuditAction.POLICY_PUBLISHED,
        entityType: AuditEntityType.POLICY_DOCUMENT,
        entityId: policyId,
        metadata: {
          version_id: existing.current_version_id,
          version_label: publishLabel,
        },
        ipAddress: await getRequestIpAddress(),
      });

      await notifyPolicyPublished({
        churchId: church.id,
        policyId,
        title: existing.title,
        versionLabel: publishLabel,
        actorUserId: user.id,
      });

      if (existing.requires_acknowledgment) {
        try {
          const assignedUserIds = await assignPolicyAcknowledgments(policyId);
          if (assignedUserIds.length > 0) {
            const dueAt =
              existing.acknowledgment_due_days != null
                ? new Date(
                    Date.now() +
                      existing.acknowledgment_due_days * 24 * 60 * 60 * 1000,
                  ).toISOString()
                : null;
            await notifyPolicyAcknowledgmentsRequired({
              churchId: church.id,
              policyId,
              title: existing.title,
              versionLabel: publishLabel,
              recipientUserIds: assignedUserIds,
              dueAt,
              actorUserId: user.id,
              timeZone: church.timezone,
            });
            await writeAuditLog(supabase, {
              churchId: church.id,
              userId: user.id,
              action: AuditAction.POLICY_ACKNOWLEDGMENTS_ASSIGNED,
              entityType: AuditEntityType.POLICY_DOCUMENT,
              entityId: policyId,
              metadata: {
                assigned_count: assignedUserIds.length,
                version_label: publishLabel,
              },
              ipAddress: await getRequestIpAddress(),
            });
          }
        } catch (ackError) {
          console.error("Policy acknowledgment assignment failed:", ackError);
        }
      }

      revalidatePath("/policies");
      revalidatePath("/policies/manage");
      revalidatePath("/policies/acknowledgments");
      revalidatePath(policyPath(policyId));
      revalidatePath(policyEditPath(policyId));
      return { success: true };
    }

    const versionStatus = nextVersionStatus(action);
    const documentUpdate: Record<string, unknown> = {
      status: nextStatus,
      updated_by: user.id,
    };

    if (action === "retire") {
      documentUpdate.retired_at = now;
    }
    if (action === "archive") {
      documentUpdate.archived_at = now;
    }
    if (action === "restore") {
      documentUpdate.retired_at = null;
      documentUpdate.archived_at = null;
    }

    const { error: docError } = await supabase
      .from("policy_documents")
      .update(documentUpdate)
      .eq("id", policyId)
      .eq("church_id", church.id);

    if (docError) {
      return { error: docError.message };
    }

    if (
      versionStatus &&
      existing.current_version &&
      isEditableVersionStatus(existing.current_version.status)
    ) {
      const versionUpdate: Record<string, unknown> = {
        status: versionStatus,
      };
      if (action === "submit") {
        versionUpdate.submitted_for_review_at = now;
      }
      if (action === "approve") {
        versionUpdate.approved_by = user.id;
        versionUpdate.approved_at = now;
      }
      const { error: versionError } = await supabase
        .from("policy_versions")
        .update(versionUpdate)
        .eq("id", existing.current_version_id!)
        .eq("church_id", church.id);
      if (versionError) {
        return { error: versionError.message };
      }
    }

    if (
      action === "submit" ||
      action === "request_changes" ||
      action === "approve"
    ) {
      await insertApproval({
        supabase,
        churchId: church.id,
        policyId,
        versionId: existing.current_version_id!,
        userId: user.id,
        decision:
          action === "submit"
            ? "submitted"
            : action === "request_changes"
              ? "changes_requested"
              : "approved",
        notes: notesResult.notes,
      });
    }

    const auditByAction: Partial<Record<PolicyWorkflowAction, string>> = {
      submit: AuditAction.POLICY_SUBMITTED,
      request_changes: AuditAction.POLICY_CHANGES_REQUESTED,
      approve: AuditAction.POLICY_APPROVED,
      retire: AuditAction.POLICY_RETIRED,
      archive: AuditAction.POLICY_ARCHIVED,
      restore: AuditAction.POLICY_RESTORED,
    };

    const auditAction = auditByAction[action];
    if (auditAction) {
      await writeAuditLog(supabase, {
        churchId: church.id,
        userId: user.id,
        action: auditAction,
        entityType: AuditEntityType.POLICY_DOCUMENT,
        entityId: policyId,
        metadata: {
          from_status: existing.status,
          to_status: nextStatus,
          version_id: versionId,
          notes: notesResult.notes,
        },
        ipAddress: await getRequestIpAddress(),
      });
    }
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to update policy workflow.",
    };
  }

  revalidatePath("/policies");
  revalidatePath("/policies/manage");
  revalidatePath(policyPath(policyId));
  revalidatePath(policyEditPath(policyId));
  return { success: true };
}

export async function submitPolicyForReview(
  policyId: string,
  _prev: PolicyActionState,
  formData: FormData,
) {
  return runWorkflowAction({ policyId, action: "submit", formData });
}

export async function requestPolicyChanges(
  policyId: string,
  _prev: PolicyActionState,
  formData: FormData,
) {
  return runWorkflowAction({
    policyId,
    action: "request_changes",
    formData,
  });
}

export async function approvePolicy(
  policyId: string,
  _prev: PolicyActionState,
  formData: FormData,
) {
  return runWorkflowAction({ policyId, action: "approve", formData });
}

export async function publishPolicy(
  policyId: string,
  _prev: PolicyActionState,
  formData: FormData,
) {
  return runWorkflowAction({ policyId, action: "publish", formData });
}

export async function retirePolicy(policyId: string) {
  return runWorkflowAction({ policyId, action: "retire" });
}

export async function archivePolicy(policyId: string) {
  return runWorkflowAction({ policyId, action: "archive" });
}

export async function restorePolicy(policyId: string) {
  return runWorkflowAction({ policyId, action: "restore" });
}

export async function startPolicyRevision(policyId: string) {
  return runWorkflowAction({ policyId, action: "start_revision" });
}
