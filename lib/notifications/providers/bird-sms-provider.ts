import type { NotificationProvider } from "@/lib/notifications/providers/provider-interface";
import type {
  NotificationMessage,
  NotificationSendResult,
} from "@/lib/notifications/types";
import {
  birdCategoryForAppMessage,
  isBirdSmsConfigured,
  sendBirdSms,
} from "@/lib/sms/bird-send";
import { maskMobileE164 } from "@/lib/sms/phone";

export class BirdSmsProvider implements NotificationProvider {
  channel = "sms" as const;
  name = "bird";

  isConfigured(): boolean {
    return isBirdSmsConfigured();
  }

  async send(message: NotificationMessage): Promise<NotificationSendResult> {
    const to = message.to.trim();
    if (!to) {
      return {
        ok: false,
        status: "rejected",
        errorCode: "missing_mobile_number",
        errorMessage: "SMS delivery is missing a destination number.",
      };
    }

    const result = await sendBirdSms({
      toE164: to,
      text: message.text,
      category: birdCategoryForAppMessage("operational"),
    });

    if (!result.ok) {
      console.info("Bird SMS send failed", maskMobileE164(to));
      return {
        ok: false,
        status: "failed",
        errorCode: "bird_send_failed",
        errorMessage: result.error ?? "Unable to send the text message.",
      };
    }

    console.info("Bird SMS accepted");
    return {
      ok: true,
      status: "sent",
      providerMessageId: result.id ?? null,
      providerResponse: result.id ? { id: result.id } : {},
    };
  }
}
