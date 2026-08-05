import { getEmailProvider } from "@/lib/notifications/providers/email-provider";
import { requirePlatformAdminClient } from "@/lib/platform/queries";

export type NotifyChurchOwnersResult = {
  attempted: number;
  sent: number;
  errors: string[];
};

/**
 * Notify active ownership-tier members about a platform-driven plan change.
 * Uses billing sender category. Never includes secrets.
 */
export async function notifyChurchOwnersOfPlanChange(params: {
  churchId: string;
  churchName: string;
  oldPlanDisplayName: string;
  newPlanDisplayName: string;
  reason: string;
  changedByEmail: string;
}): Promise<NotifyChurchOwnersResult> {
  const admin = requirePlatformAdminClient();
  const { data: memberships, error } = await admin
    .from("organization_memberships")
    .select("user_id, role")
    .eq("organization_id", params.churchId)
    .eq("status", "active")
    .in("role", ["owner", "co_owner"]);

  if (error) {
    return {
      attempted: 0,
      sent: 0,
      errors: [error.message],
    };
  }

  const userIds = (memberships ?? []).map((row) => String(row.user_id));
  if (userIds.length === 0) {
    return { attempted: 0, sent: 0, errors: [] };
  }

  const emailByUserId = new Map<string, string>();
  const lookupErrors: string[] = [];
  for (const userId of userIds) {
    const { data, error: userError } = await admin.auth.admin.getUserById(userId);
    if (userError) {
      lookupErrors.push(userError.message);
      continue;
    }
    if (data.user?.email) {
      emailByUserId.set(userId, data.user.email);
    }
  }

  const provider = getEmailProvider();
  if (!provider.isConfigured()) {
    return {
      attempted: emailByUserId.size,
      sent: 0,
      errors: ["Email provider is not configured."],
    };
  }

  const subject = `Subscription plan updated for ${params.churchName}`;
  const text = [
    `Hello,`,
    ``,
    `The subscription plan for ${params.churchName} was changed by a Sanctuary Protected platform administrator.`,
    ``,
    `Previous plan: ${params.oldPlanDisplayName}`,
    `New plan: ${params.newPlanDisplayName}`,
    `Changed by: ${params.changedByEmail}`,
    `Reason: ${params.reason}`,
    ``,
    `No payment secrets or credentials are included in this message.`,
    `If you have questions, contact support.`,
    ``,
    `— Sanctuary Protected`,
  ].join("\n");

  const html = `
    <p>Hello,</p>
    <p>The subscription plan for <strong>${escapeHtml(params.churchName)}</strong>
      was changed by a Sanctuary Protected platform administrator.</p>
    <ul>
      <li>Previous plan: <strong>${escapeHtml(params.oldPlanDisplayName)}</strong></li>
      <li>New plan: <strong>${escapeHtml(params.newPlanDisplayName)}</strong></li>
      <li>Changed by: ${escapeHtml(params.changedByEmail)}</li>
      <li>Reason: ${escapeHtml(params.reason)}</li>
    </ul>
    <p>If you have questions, contact support.</p>
    <p>— Sanctuary Protected</p>
  `.trim();

  let sent = 0;
  const errors: string[] = [...lookupErrors];
  for (const email of emailByUserId.values()) {
    const result = await provider.send({
      to: email,
      subject,
      text,
      html,
      senderCategory: "billing",
      tags: {
        category: "platform_plan_change",
        sender_category: "billing",
      },
    });
    if (result.ok) sent += 1;
    else if (result.errorMessage) errors.push(result.errorMessage);
  }

  return {
    attempted: emailByUserId.size,
    sent,
    errors,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
