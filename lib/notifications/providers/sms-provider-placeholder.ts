import type { NotificationProvider } from "@/lib/notifications/providers/provider-interface";
import type {
  NotificationMessage,
  NotificationSendResult,
} from "@/lib/notifications/types";

/**
 * Placeholder until Text/SMS consent + provider are configured.
 * Bird sends reserve capacity before the provider call and commit only
 * after Bird accepts. This placeholder does not send or consume credits.
 */
export class SmsProviderPlaceholder implements NotificationProvider {
  channel = "sms" as const;
  name = "sms_placeholder";

  isConfigured(): boolean {
    return false;
  }

  async send(message: NotificationMessage): Promise<NotificationSendResult> {
    void message;
    return {
      ok: false,
      status: "suppressed",
      errorCode: "sms_not_configured",
      errorMessage: "Text/SMS delivery is not configured yet.",
    };
  }
}
