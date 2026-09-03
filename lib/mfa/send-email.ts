import { getEmailProvider } from "@/lib/notifications/providers/email-provider";

export type MfaEmailSendResult = {
  ok: boolean;
  provider: string;
  error?: string;
};

export async function sendMfaEmailCode(input: {
  toEmail: string;
  code: string;
}): Promise<MfaEmailSendResult> {
  const provider = getEmailProvider();
  if (!provider.isConfigured()) {
    return {
      ok: false,
      provider: provider.name,
      error:
        "Email delivery is not configured. Set EMAIL_PROVIDER and sender addresses.",
    };
  }

  const subject = "Your Sanctuary Protected verification code";
  const text = [
    "Your verification code is:",
    "",
    input.code,
    "",
    "This code expires in 10 minutes. If you did not try to sign in, you can ignore this email.",
    "",
    "— Sanctuary Protected",
  ].join("\n");
  const html = `
    <p>Your verification code is:</p>
    <p style="font-size:28px;letter-spacing:6px;font-weight:700">${escapeHtml(input.code)}</p>
    <p>This code expires in 10 minutes. If you did not try to sign in, you can ignore this email.</p>
    <p>— Sanctuary Protected</p>
  `.trim();

  const result = await provider.send({
    to: input.toEmail,
    subject,
    text,
    html,
    senderCategory: "access",
    tags: {
      category: "login_mfa",
      sender_category: "access",
    },
  });

  if (!result.ok) {
    return {
      ok: false,
      provider: provider.name,
      error: result.errorMessage || "Unable to send the verification email.",
    };
  }

  return { ok: true, provider: provider.name };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
