import type { NotificationProvider } from "@/lib/notifications/providers/provider-interface";
import type {
  NotificationMessage,
  NotificationSendResult,
} from "@/lib/notifications/types";
import { maskMobileE164 } from "@/lib/sms/phone";

/** Dry-run SMS provider. Does not call Bird. */
export class ConsoleSmsProvider implements NotificationProvider {
  channel = "sms" as const;
  name = "console";

  isConfigured(): boolean {
    return true;
  }

  async send(message: NotificationMessage): Promise<NotificationSendResult> {
    console.info("[sms:console]", {
      to: maskMobileE164(message.to),
      segments: "dry-run",
    });
    return {
      ok: true,
      status: "sent",
      providerMessageId: `console_${message.tags?.delivery_id ?? "sms"}`,
    };
  }
}
