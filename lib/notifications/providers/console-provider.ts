import type { NotificationProvider } from "@/lib/notifications/providers/provider-interface";
import type {
  NotificationMessage,
  NotificationSendResult,
} from "@/lib/notifications/types";

/** Development / CI provider — logs instead of sending. */
export class ConsoleEmailProvider implements NotificationProvider {
  channel = "email" as const;
  name = "console";

  isConfigured(): boolean {
    return true;
  }

  async send(message: NotificationMessage): Promise<NotificationSendResult> {
    console.info("[notifications:console]", {
      to: message.to,
      subject: message.subject,
      textPreview: message.text.slice(0, 180),
    });
    return {
      ok: true,
      providerMessageId: `console-${Date.now()}`,
      status: "sent",
      providerResponse: { provider: "console" },
    };
  }
}
