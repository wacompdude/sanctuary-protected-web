import { getEmailProvider } from "@/lib/notifications/providers/email-provider";
import { labelForPlatformRoleKey } from "@/lib/platform/invitations";

export type SendPlatformInvitationEmailResult = {
  sent: boolean;
  error?: string;
  providerMessageId?: string | null;
};

export async function sendPlatformInvitationEmail(params: {
  toEmail: string;
  displayName?: string | null;
  roleKeys: string[];
  invitationUrl: string;
  expiresAt: string;
  invitedByName?: string | null;
  invitationNote?: string | null;
}): Promise<SendPlatformInvitationEmailResult> {
  const provider = getEmailProvider();
  if (!provider.isConfigured()) {
    return {
      sent: false,
      error:
        "Email is not configured. Set EMAIL_PROVIDER (and API key when using Resend).",
    };
  }

  const roleLabels = params.roleKeys
    .map((key) => labelForPlatformRoleKey(key))
    .join(", ");
  const expiresLabel = new Date(params.expiresAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const inviter = params.invitedByName?.trim() || "A Sanctuary Protected administrator";
  const greetingName = params.displayName?.trim() || "there";
  const note = params.invitationNote?.trim();

  const subject = "You're invited to Sanctuary Protected platform administration";
  const text = [
    `Hello ${greetingName},`,
    ``,
    `${inviter} invited you to the Sanctuary Protected platform console.`,
    `Assigned roles: ${roleLabels || "developer"}.`,
    note ? `` : null,
    note ? `Note: ${note}` : null,
    ``,
    `Accept your invitation and create your password:`,
    params.invitationUrl,
    ``,
    `This invitation expires on ${expiresLabel}.`,
    `You will be required to enroll multi-factor authentication before using the console.`,
    ``,
    `If you did not expect this invitation, ignore this email.`,
    ``,
    `— Sanctuary Protected`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const html = `
    <p>Hello ${escapeHtml(greetingName)},</p>
    <p><strong>${escapeHtml(inviter)}</strong> invited you to the
      Sanctuary Protected <strong>platform administration</strong> console.</p>
    <p>Assigned roles: <strong>${escapeHtml(roleLabels || "developer")}</strong>.</p>
    ${
      note
        ? `<p>Note: ${escapeHtml(note)}</p>`
        : ""
    }
    <p><a href="${escapeAttr(params.invitationUrl)}">Accept invitation</a></p>
    <p>This invitation expires on <strong>${escapeHtml(expiresLabel)}</strong>.</p>
    <p>You must enroll multi-factor authentication before using the console.</p>
    <p>If you did not expect this invitation, ignore this email.</p>
    <p>— Sanctuary Protected</p>
  `.trim();

  const result = await provider.send({
    to: params.toEmail,
    subject,
    text,
    html,
    senderCategory: "access",
    tags: {
      category: "platform_invite",
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
