import type { NotificationProvider } from "@/lib/notifications/providers/provider-interface";
import type {
  NotificationMessage,
  NotificationSendResult,
} from "@/lib/notifications/types";
import { safeErrorMessage } from "@/lib/notifications/validation";

type ResendSuccess = { id?: string };
type ResendErrorBody = { message?: string; name?: string; statusCode?: number };

export class ResendEmailProvider implements NotificationProvider {
  channel = "email" as const;
  name = "resend";

  isConfigured(): boolean {
    return Boolean(
      process.env.EMAIL_PROVIDER_API_KEY?.trim() &&
        process.env.EMAIL_FROM_ADDRESS?.trim(),
    );
  }

  async send(message: NotificationMessage): Promise<NotificationSendResult> {
    const apiKey = process.env.EMAIL_PROVIDER_API_KEY?.trim();
    const fromAddress =
      message.fromAddress?.trim() ||
      process.env.EMAIL_FROM_ADDRESS?.trim() ||
      "";
    const fromName =
      message.fromName?.trim() ||
      process.env.EMAIL_FROM_NAME?.trim() ||
      "Sanctuary Protected";
    const replyTo =
      message.replyTo?.trim() || process.env.EMAIL_REPLY_TO?.trim() || undefined;

    if (!apiKey || !fromAddress) {
      return {
        ok: false,
        status: "failed",
        errorCode: "provider_not_configured",
        errorMessage:
          "Email provider is not configured. Set EMAIL_PROVIDER_API_KEY and EMAIL_FROM_ADDRESS.",
      };
    }

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${fromName} <${fromAddress}>`,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: message.html || undefined,
          reply_to: replyTo || undefined,
          tags: message.tags
            ? Object.entries(message.tags).map(([name, value]) => ({
                name,
                value,
              }))
            : undefined,
        }),
      });

      const raw = (await response.json().catch(() => ({}))) as
        | ResendSuccess
        | ResendErrorBody;

      if (!response.ok) {
        const err = raw as ResendErrorBody;
        const permanent =
          response.status === 400 ||
          response.status === 403 ||
          response.status === 422;
        return {
          ok: false,
          status: permanent ? "rejected" : "failed",
          errorCode: err.name ?? `http_${response.status}`,
          errorMessage: safeErrorMessage(err.message ?? "Resend request failed."),
          providerResponse: {
            status: response.status,
            name: err.name ?? null,
          },
        };
      }

      const success = raw as ResendSuccess;
      return {
        ok: true,
        providerMessageId: success.id ?? null,
        status: "sent",
        providerResponse: { id: success.id ?? null },
      };
    } catch (error) {
      return {
        ok: false,
        status: "failed",
        errorCode: "network_error",
        errorMessage: safeErrorMessage(
          error instanceof Error ? error.message : "Network error",
        ),
      };
    }
  }
}
