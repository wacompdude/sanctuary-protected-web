import { getEmailProvider } from "@/lib/notifications/providers/email-provider";
import { labelForMembershipRole } from "@/lib/church/invitations";

/**
 * Invitation reply-to is resolved from the access sender registry
 * (EMAIL_REPLY_TO_SUPPORT / EMAIL_REPLY_TO_DEFAULT). MEMBERSHIP_INVITE_REPLY_TO
 * remains a temporary override for existing deployments.
 */
export const MEMBERSHIP_INVITE_REPLY_TO =
  process.env.MEMBERSHIP_INVITE_REPLY_TO?.trim() || undefined;

export type SendInvitationEmailResult = {
  sent: boolean;
  error?: string;
  providerMessageId?: string | null;
};

export async function sendChurchInvitationEmail(params: {
  toEmail: string;
  churchName: string;
  role: string;
  invitationUrl: string;
  expiresAt: string;
  invitedByName?: string | null;
}): Promise<SendInvitationEmailResult> {
  const provider = getEmailProvider();
  if (!provider.isConfigured()) {
    return {
      sent: false,
      error:
        "Email is not configured. Set EMAIL_PROVIDER_API_KEY and sender addresses.",
    };
  }

  const roleLabel = labelForMembershipRole(params.role);
  const expiresLabel = new Date(params.expiresAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const inviter = params.invitedByName?.trim() || "A team administrator";

  const subject = `You're invited to join ${params.churchName} on Sanctuary Protected`;
  const text = [
    `Hello,`,
    ``,
    `${inviter} invited you to join ${params.churchName} on Sanctuary Protected as ${roleLabel}.`,
    ``,
    `Accept your invitation:`,
    params.invitationUrl,
    ``,
    `This invitation expires on ${expiresLabel}.`,
    ``,
    `If you have questions, reply to this email.`,
    ``,
    `— Sanctuary Protected`,
  ].join("\n");

  const html = `
    <p>Hello,</p>
    <p><strong>${escapeHtml(inviter)}</strong> invited you to join
      <strong>${escapeHtml(params.churchName)}</strong> on Sanctuary Protected
      as <strong>${escapeHtml(roleLabel)}</strong>.</p>
    <p><a href="${escapeAttr(params.invitationUrl)}">Accept your invitation</a></p>
    <p>This invitation expires on <strong>${escapeHtml(expiresLabel)}</strong>.</p>
    <p>If you have questions, reply to this email.</p>
    <p>— Sanctuary Protected</p>
  `.trim();

  const result = await provider.send({
    to: params.toEmail,
    subject,
    text,
    html,
    senderCategory: "access",
    replyTo: MEMBERSHIP_INVITE_REPLY_TO,
    tags: {
      category: "membership_invite",
      sender_category: "access",
    },
  });

  if (!result.ok) {
    return {
      sent: false,
      error: result.errorMessage || "Unable to send invitation email.",
      providerMessageId: result.providerMessageId,
    };
  }

  return {
    sent: true,
    providerMessageId: result.providerMessageId,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replaceAll("'", "&#39;");
}
