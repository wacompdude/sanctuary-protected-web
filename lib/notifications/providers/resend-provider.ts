import {
  assertApprovedSenderAddress,
  extractEmailAddress,
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

/** Resend tags allow only ASCII letters, numbers, underscores, or dashes. */
function sanitizeResendTagToken(value: string, maxLength = 256): string {
  const cleaned = value
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "");
  return (cleaned || "unknown").slice(0, maxLength);
}

function buildResendTags(
  senderCategory: string,
  tags: Record<string, string> | undefined,
): Array<{ name: string; value: string }> {
  const entries = new Map<string, string>();
  entries.set("sender_category", sanitizeResendTagToken(senderCategory));

  for (const [name, value] of Object.entries(tags ?? {})) {
    const safeName = sanitizeResendTagToken(name, 50);
    const safeValue = sanitizeResendTagToken(String(value));
    if (!safeName || !safeValue) continue;
    entries.set(safeName, safeValue);
  }

  return [...entries.entries()].map(([name, value]) => ({ name, value }));
}

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
        try {
          replyTo = assertApprovedSenderAddress(
            extractEmailAddress(message.replyTo.trim()),
            sender.category,
          );
        } catch {
          console.warn(
            "[email] ignoring off-domain replyTo override; using registry reply-to",
          );
          replyTo = sender.replyTo || undefined;
        }
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
          code === "unapproved_sender_domain"
            ? "Email From/Reply-To must use the approved Sanctuary Protected domain."
            : code === "provider_not_configured"
              ? "Email provider is not configured."
              : `Email sender is not configured correctly (${code}).`,
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
          tags: buildResendTags(senderCategory, message.tags),
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
