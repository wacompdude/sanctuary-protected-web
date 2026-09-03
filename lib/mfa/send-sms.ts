import { maskPhoneForMfa } from "@/lib/mfa/mask";

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
      error: "Text message delivery is not configured yet.",
    };
  }
}

/** Bird Verify will replace this. Do not send from login until Bird is wired. */
class BirdMfaSmsPlaceholder implements MfaSmsSender {
  name = "bird";
  isConfigured(): boolean {
    return false;
  }
  async send(): Promise<MfaSmsSendResult> {
    return {
      ok: false,
      provider: this.name,
      error:
        "Text message delivery is not connected yet. Use the email code for now.",
    };
  }
}

class ConsoleMfaSmsSender implements MfaSmsSender {
  name = "console";
  isConfigured(): boolean {
    return true;
  }
  async send(input: { toE164: string; code: string }): Promise<MfaSmsSendResult> {
    console.info("[mfa:sms:console]", {
      to: maskPhoneForMfa(input.toE164),
      code: input.code,
    });
    return { ok: true, provider: this.name };
  }
}

export function getMfaSmsSender(): MfaSmsSender {
  const configured = (process.env.MFA_SMS_PROVIDER ?? "")
    .trim()
    .toLowerCase();

  if (configured === "console" || process.env.NODE_ENV === "test") {
    return new ConsoleMfaSmsSender();
  }
  if (configured === "bird") {
    return new BirdMfaSmsPlaceholder();
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
      error: "Text message delivery is not configured yet.",
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
