import { createNotification } from "@/lib/notifications/create-notification";
import { formatChurchDate } from "@/lib/datetime/format";

export async function notifyPolicyPublished(params: {
  churchId: string;
  policyId: string;
  title: string;
  versionLabel: string;
  actorUserId: string;
}) {
  try {
    await createNotification({
      churchId: params.churchId,
      notificationType: "policy.published",
      severity: "medium",
      entityType: "policy_document",
      entityId: params.policyId,
      actionUrl: `/policies/${params.policyId}`,
      deduplicationKey: `policy.published:${params.policyId}:${params.versionLabel}`,
      createdBy: params.actorUserId,
      templateVariables: {
        policy_title: params.title,
        policy_version: params.versionLabel,
      },
      title: `Policy published: ${params.title}`,
      body: `${params.title} (v${params.versionLabel}) is now published.`,
    });
  } catch (error) {
    console.error("policy.published notification failed:", error);
  }
}

export async function notifyPolicyAcknowledgmentsRequired(params: {
  churchId: string;
  policyId: string;
  title: string;
  versionLabel: string;
  recipientUserIds: string[];
  dueAt: string | null;
  actorUserId: string;
  timeZone?: string | null;
}) {
  if (params.recipientUserIds.length === 0) return;

  const dueLabel = params.dueAt
    ? formatChurchDate(params.dueAt, { timeZone: params.timeZone })
    : "See policy for due date";

  try {
    await createNotification({
      churchId: params.churchId,
      notificationType: "policy.acknowledgment_required",
      severity: "high",
      entityType: "policy_document",
      entityId: params.policyId,
      actionUrl: `/policies/${params.policyId}`,
      deduplicationKey: `policy.ack:${params.policyId}:${params.versionLabel}`,
      createdBy: params.actorUserId,
      recipientUserIds: params.recipientUserIds,
      templateVariables: {
        policy_title: params.title,
        policy_version: params.versionLabel,
        acknowledgment_due: dueLabel,
      },
      title: `Please acknowledge: ${params.title}`,
      body: `You must acknowledge ${params.title}. Due: ${dueLabel}.`,
    });
  } catch (error) {
    console.error("policy.acknowledgment_required notification failed:", error);
  }
}
