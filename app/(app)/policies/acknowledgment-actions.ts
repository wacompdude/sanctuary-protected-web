"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { getRequestIpAddress, writeAuditLog } from "@/lib/audit/log";
import { getOperationalChurchContext } from "@/lib/church/auth";
import type { ActionState } from "@/lib/church/types";
import {
  assignPolicyAcknowledgments,
  ensureMyPolicyAcknowledgment,
  getMyPolicyAcknowledgment,
} from "@/lib/policies/acknowledgments";
import { canManagePolicyDocuments } from "@/lib/policies/permissions";
import { getPolicyById } from "@/lib/policies/queries";
import {
  notifyPolicyAcknowledgmentsRequired,
} from "@/lib/policies/notify";

function revalidateAckPaths(policyId?: string) {
  revalidatePath("/policies");
  revalidatePath("/policies/acknowledgments");
  if (policyId) {
    revalidatePath(`/policies/${policyId}`);
    revalidatePath(`/policies/${policyId}/edit`);
  }
}

async function clientMeta() {
  const headerStore = await headers();
  const userAgent = headerStore.get("user-agent")?.slice(0, 500) ?? null;
  const ip = await getRequestIpAddress();
  return { userAgent, ip };
}

export async function markPolicyViewed(policyId: string): Promise<ActionState> {
  try {
    const { supabase, user, church } = await getOperationalChurchContext();
    await ensureMyPolicyAcknowledgment(policyId);

    const ack = await getMyPolicyAcknowledgment(church.id, policyId, user.id);
    if (!ack) return { success: true };
    if (
      ack.acknowledgment_status === "acknowledged" ||
      ack.acknowledgment_status === "waived"
    ) {
      return { success: true };
    }

    const now = new Date().toISOString();
    const nextStatus =
      ack.acknowledgment_status === "assigned" ? "viewed" : ack.acknowledgment_status;

    const { error } = await supabase
      .from("policy_acknowledgments")
      .update({
        acknowledgment_status: nextStatus,
        viewed_at: ack.viewed_at ?? now,
      })
      .eq("id", ack.id)
      .eq("user_id", user.id);

    if (error) return { error: error.message };

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.POLICY_ACKNOWLEDGMENT_VIEWED,
      entityType: AuditEntityType.POLICY_ACKNOWLEDGMENT,
      entityId: ack.id,
      metadata: { policy_id: policyId },
      ipAddress: await getRequestIpAddress(),
    });

    revalidateAckPaths(policyId);
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to mark as viewed.",
    };
  }
}

export async function acknowledgePolicy(
  policyId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase, user, church } = await getOperationalChurchContext();
    await ensureMyPolicyAcknowledgment(policyId);

    const ack = await getMyPolicyAcknowledgment(church.id, policyId, user.id);
    if (!ack) {
      return {
        error:
          "No acknowledgment is assigned for this policy. Ask a security leader to publish with acknowledgment required.",
      };
    }
    if (ack.acknowledgment_status === "acknowledged") {
      return { success: true };
    }
    if (ack.acknowledgment_status === "waived") {
      return { error: "This acknowledgment was waived." };
    }

    const text = String(formData.get("acknowledgment_text") ?? "").trim();
    if (text.length > 2000) {
      return {
        fieldErrors: {
          acknowledgment_text: "Keep your confirmation under 2000 characters.",
        },
      };
    }

    const { userAgent, ip } = await clientMeta();
    const now = new Date().toISOString();
    const updatePayload: Record<string, unknown> = {
      acknowledgment_status: "acknowledged",
      acknowledged_at: now,
      viewed_at: ack.viewed_at ?? now,
      acknowledgment_text: text || "I have read and understand this policy.",
      user_agent: userAgent,
    };
    if (
      ip &&
      (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip) || ip.includes(":"))
    ) {
      updatePayload.ip_address = ip;
    }

    const { error } = await supabase
      .from("policy_acknowledgments")
      .update(updatePayload)
      .eq("id", ack.id)
      .eq("user_id", user.id);

    if (error) return { error: error.message };

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.POLICY_ACKNOWLEDGED,
      entityType: AuditEntityType.POLICY_ACKNOWLEDGMENT,
      entityId: ack.id,
      metadata: { policy_id: policyId },
      ipAddress: ip,
    });

    revalidateAckPaths(policyId);
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to acknowledge this policy.",
    };
  }
}

export async function waivePolicyAcknowledgment(
  acknowledgmentId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase, user, church, membership } =
      await getOperationalChurchContext();

    if (!canManagePolicyDocuments(membership.role)) {
      return { error: "You do not have permission to waive acknowledgments." };
    }

    const reason = String(formData.get("waiver_reason") ?? "").trim();
    if (!reason) {
      return { fieldErrors: { waiver_reason: "A waiver reason is required." } };
    }

    const { data: ack, error: loadError } = await supabase
      .from("policy_acknowledgments")
      .select("id, policy_document_id, acknowledgment_status")
      .eq("id", acknowledgmentId)
      .eq("church_id", church.id)
      .maybeSingle();

    if (loadError || !ack) return { error: "Acknowledgment not found." };

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("policy_acknowledgments")
      .update({
        acknowledgment_status: "waived",
        waived_by: user.id,
        waived_at: now,
        waiver_reason: reason.slice(0, 2000),
      })
      .eq("id", acknowledgmentId)
      .eq("church_id", church.id);

    if (error) return { error: error.message };

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.POLICY_ACKNOWLEDGMENT_WAIVED,
      entityType: AuditEntityType.POLICY_ACKNOWLEDGMENT,
      entityId: acknowledgmentId,
      metadata: {
        policy_id: ack.policy_document_id,
        reason: reason.slice(0, 200),
      },
      ipAddress: await getRequestIpAddress(),
    });

    revalidateAckPaths(String(ack.policy_document_id));
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to waive acknowledgment.",
    };
  }
}

export async function runAssignPolicyAcknowledgments(
  policyId: string,
): Promise<ActionState> {
  try {
    const { supabase, user, church, membership } =
      await getOperationalChurchContext();

    if (!canManagePolicyDocuments(membership.role)) {
      return { error: "You do not have permission to assign acknowledgments." };
    }

    const policy = await getPolicyById(church.id, policyId);
    if (!policy) return { error: "Policy not found." };
    if (policy.status !== "published") {
      return { error: "Publish the policy before assigning acknowledgments." };
    }
    if (!policy.requires_acknowledgment) {
      return {
        error: "Enable “Requires acknowledgment” before assigning.",
      };
    }

    const userIds = await assignPolicyAcknowledgments(policyId);

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.POLICY_ACKNOWLEDGMENTS_ASSIGNED,
      entityType: AuditEntityType.POLICY_DOCUMENT,
      entityId: policyId,
      metadata: {
        assigned_count: userIds.length,
        version_id: policy.current_version_id,
      },
      ipAddress: await getRequestIpAddress(),
    });

    if (userIds.length > 0) {
      const dueAt =
        policy.acknowledgment_due_days != null
          ? new Date(
              Date.now() +
                policy.acknowledgment_due_days * 24 * 60 * 60 * 1000,
            ).toISOString()
          : null;

      await notifyPolicyAcknowledgmentsRequired({
        churchId: church.id,
        policyId,
        title: policy.title,
        versionLabel: policy.version_label ?? "1.0",
        recipientUserIds: userIds,
        dueAt,
        actorUserId: user.id,
        timeZone: church.timezone,
      });
    }

    revalidateAckPaths(policyId);
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to assign acknowledgments.",
    };
  }
}

export async function addPolicyAssignment(
  policyId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase, user, church, membership } =
      await getOperationalChurchContext();

    if (!canManagePolicyDocuments(membership.role)) {
      return { error: "You do not have permission to manage assignments." };
    }

    const assignmentType = String(formData.get("assignment_type") ?? "").trim();
    const role = String(formData.get("role") ?? "").trim() || null;
    const userId = String(formData.get("user_id") ?? "").trim() || null;
    const campusId = String(formData.get("campus_id") ?? "").trim() || null;

    const allowed = [
      "all_members",
      "role",
      "security_team",
      "campus",
      "user",
    ];
    if (!allowed.includes(assignmentType)) {
      return { fieldErrors: { assignment_type: "Select a valid assignment." } };
    }

    const payload: Record<string, unknown> = {
      church_id: church.id,
      policy_document_id: policyId,
      assignment_type: assignmentType,
      created_by: user.id,
      role: null,
      user_id: null,
      campus_id: null,
    };

    if (assignmentType === "role") {
      if (!role) return { fieldErrors: { role: "Select a role." } };
      payload.role = role;
    } else if (assignmentType === "user") {
      if (!userId) return { fieldErrors: { user_id: "Select a member." } };
      payload.user_id = userId;
    } else if (assignmentType === "campus") {
      if (!campusId) return { fieldErrors: { campus_id: "Select a campus." } };
      payload.campus_id = campusId;
    }

    const { data, error } = await supabase
      .from("policy_assignments")
      .insert(payload)
      .select("id")
      .single();

    if (error || !data) {
      return { error: error?.message || "Unable to add assignment." };
    }

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.POLICY_ASSIGNMENT_ADDED,
      entityType: AuditEntityType.POLICY_ASSIGNMENT,
      entityId: data.id,
      metadata: { policy_id: policyId, assignment_type: assignmentType },
      ipAddress: await getRequestIpAddress(),
    });

    revalidateAckPaths(policyId);
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to add assignment.",
    };
  }
}

export async function revokePolicyAssignment(
  assignmentId: string,
): Promise<ActionState> {
  try {
    const { supabase, user, church, membership } =
      await getOperationalChurchContext();

    if (!canManagePolicyDocuments(membership.role)) {
      return { error: "You do not have permission to revoke assignments." };
    }

    const { data: assignment, error: loadError } = await supabase
      .from("policy_assignments")
      .select("id, policy_document_id")
      .eq("id", assignmentId)
      .eq("church_id", church.id)
      .maybeSingle();

    if (loadError || !assignment) {
      return { error: "Assignment not found." };
    }

    const { error } = await supabase
      .from("policy_assignments")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", assignmentId)
      .eq("church_id", church.id);

    if (error) return { error: error.message };

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.POLICY_ASSIGNMENT_REVOKED,
      entityType: AuditEntityType.POLICY_ASSIGNMENT,
      entityId: assignmentId,
      metadata: { policy_id: assignment.policy_document_id },
      ipAddress: await getRequestIpAddress(),
    });

    revalidateAckPaths(String(assignment.policy_document_id));
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to revoke assignment.",
    };
  }
}
