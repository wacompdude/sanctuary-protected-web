import type { NotificationProvider } from "@/lib/notifications/providers/provider-interface";
import type {
  NotificationMessage,
  NotificationSendResult,
} from "@/lib/notifications/types";

/** Placeholder until mobile push / Expo device registration exists. */
export class PushProviderPlaceholder implements NotificationProvider {
  channel = "push" as const;
  name = "push_placeholder";

  isConfigured(): boolean {
    return false;
  }

  async send(message: NotificationMessage): Promise<NotificationSendResult> {
    void message;
    return {
      ok: false,
      status: "suppressed",
      errorCode: "push_not_configured",
      errorMessage: "Push notifications are not configured yet.",
    };
  }
}
