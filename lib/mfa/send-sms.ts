import { maskPhoneForMfa } from "@/lib/mfa/mask";
import {
  birdCategoryForAppMessage,
  isBirdSmsConfigured,
  sendBirdSms,
} from "@/lib/sms/bird-send";

export type MfaSmsSendResult = {
  ok: boolean;
  provider: string;
  error?: string;
};

export interface MfaSmsSender {
  name: string;
  isConfigured(): boolean;
  send(input: { toE164: string; code: string }): Promise<MfaSmsSendResult>;
}

class UnconfiguredMfaSmsSender implements MfaSmsSender {
  name = "none";
  isConfigured(): boolean {
    return false;
  }
  async send(): Promise<MfaSmsSendResult> {
    return {
      ok: false,
      provider: this.name,
      error: "Text/SMS delivery is not configured yet.",
    };
  }
}

class BirdMfaSmsSender implements MfaSmsSender {
  name = "bird";
  isConfigured(): boolean {
    return isBirdSmsConfigured();
  }
  async send(input: { toE164: string; code: string }): Promise<MfaSmsSendResult> {
    const result = await sendBirdSms({
      toE164: input.toE164,
      text: `Your Sanctuary Protected verification code is ${input.code}. This code expires in 10 minutes.`,
      category: birdCategoryForAppMessage("enrollment_otp"),
    });
    if (!result.ok) {
      return {
        ok: false,
        provider: this.name,
        error: result.error ?? "Unable to send the text message.",
      };
    }
    return { ok: true, provider: this.name };
  }
}

class ConsoleMfaSmsSender implements MfaSmsSender {
  name = "console";
  isConfigured(): boolean {
    return process.env.NODE_ENV !== "production";
  }
  async send(input: { toE164: string; code: string }): Promise<MfaSmsSendResult> {
    void input.code;
    if (process.env.NODE_ENV !== "production") {
      console.info(
        "[mfa:sms:console] verification code generated for",
        maskPhoneForMfa(input.toE164),
      );
    }
    return { ok: true, provider: this.name };
  }
}

export function getMfaSmsSender(): MfaSmsSender {
  const configured = (process.env.MFA_SMS_PROVIDER ?? "")
    .trim()
    .toLowerCase();

  if (process.env.NODE_ENV === "test") {
    return new ConsoleMfaSmsSender();
  }
  if (configured === "console") {
    if (process.env.NODE_ENV === "production") {
      return new UnconfiguredMfaSmsSender();
    }
    return new ConsoleMfaSmsSender();
  }
  if (configured === "none") {
    return new UnconfiguredMfaSmsSender();
  }
  if (configured === "bird" || (!configured && isBirdSmsConfigured())) {
    return new BirdMfaSmsSender();
  }
  if (!configured && process.env.NODE_ENV === "development") {
    return new ConsoleMfaSmsSender();
  }
  return new UnconfiguredMfaSmsSender();
}

export async function sendMfaSmsCode(input: {
  toE164: string;
  code: string;
}): Promise<MfaSmsSendResult> {
  const sender = getMfaSmsSender();
  if (!sender.isConfigured()) {
    return {
      ok: false,
      provider: sender.name,
      error: "Text/SMS delivery is not configured yet.",
    };
  }
  return sender.send(input);
}

export function isMfaSmsConfigured(): boolean {
  return getMfaSmsSender().isConfigured();
}

export function shouldExposeDevMfaCode(providerName: string): boolean {
  return (
    providerName === "console" && process.env.NODE_ENV !== "production"
  );
}
