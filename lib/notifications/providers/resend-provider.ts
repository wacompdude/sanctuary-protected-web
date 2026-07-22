import {
  assertApprovedSenderAddress,
  formatEmailSender,
  isEmailProviderApiConfigured,
  resolveEmailSender,
  EmailSenderConfigError,
} from "@/lib/email";
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
    if (!isEmailProviderApiConfigured()) return false;
    try {
      resolveEmailSender("alerts");
      return true;
    } catch {
      return false;
    }
  }

  async send(message: NotificationMessage): Promise<NotificationSendResult> {
    const apiKey =
      process.env.EMAIL_PROVIDER_API_KEY?.trim() ||
      process.env.RESEND_API_KEY?.trim();

    if (!apiKey) {
      return {
        ok: false,
        status: "failed",
        errorCode: "provider_not_configured",
        errorMessage:
          "Email provider is not configured. Set EMAIL_PROVIDER_API_KEY.",
      };
    }

    let from: string;
    let replyTo: string | undefined;
    let senderCategory = message.senderCategory;

    try {
      const sender = resolveEmailSender(message.senderCategory);
      senderCategory = sender.category;
      from = formatEmailSender(sender);
      if (message.replyTo?.trim()) {
        replyTo = assertApprovedSenderAddress(
          message.replyTo.trim(),
          sender.category,
        );
      } else {
        replyTo = sender.replyTo || undefined;
      }
    } catch (error) {
      const code =
        error instanceof EmailSenderConfigError
          ? error.code
          : "sender_resolution_failed";
      console.error("[email] Resend send blocked:", code);
      return {
        ok: false,
        status: "rejected",
        errorCode: code,
        errorMessage:
          "Email sender is not configured correctly for this message type.",
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
          from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: message.html || undefined,
          reply_to: replyTo || undefined,
          tags: [
            { name: "sender_category", value: senderCategory },
            ...(message.tags
              ? Object.entries(message.tags).map(([name, value]) => ({
                  name,
                  value,
                }))
              : []),
          ],
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
        providerResponse: {
          id: success.id ?? null,
          sender_category: senderCategory,
        },
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
