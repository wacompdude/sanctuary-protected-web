import type { NotificationProvider } from "@/lib/notifications/providers/provider-interface";
import type {
  NotificationMessage,
  NotificationSendResult,
} from "@/lib/notifications/types";

/** Placeholder until SMS consent + provider are configured. */
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
      errorMessage: "SMS delivery is not configured yet.",
    };
  }
}
