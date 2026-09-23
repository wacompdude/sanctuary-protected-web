import { BirdSmsProvider } from "@/lib/notifications/providers/bird-sms-provider";
import { ConsoleSmsProvider } from "@/lib/notifications/providers/console-sms-provider";
import type { NotificationProvider } from "@/lib/notifications/providers/provider-interface";
import { SmsProviderPlaceholder } from "@/lib/notifications/providers/sms-provider-placeholder";
import { isBirdSmsConfigured } from "@/lib/sms/bird-send";

export function getSmsProvider(): NotificationProvider {
  const configured = (process.env.SMS_PROVIDER ?? "")
    .trim()
    .toLowerCase();

  if (configured === "console" || process.env.NODE_ENV === "test") {
    return new ConsoleSmsProvider();
  }

  if (configured === "none") {
    return new SmsProviderPlaceholder();
  }

  // Live Bird only when explicitly selected, or in production when configured.
  // Local/dev defaults to console so implementation never auto-sends SMS.
  if (configured === "bird") {
    return new BirdSmsProvider();
  }

  if (!configured && isBirdSmsConfigured() && process.env.NODE_ENV === "production") {
    return new BirdSmsProvider();
  }

  if (!configured && process.env.NODE_ENV === "production") {
    return new SmsProviderPlaceholder();
  }

  if (!configured) {
    return new ConsoleSmsProvider();
  }

  return new SmsProviderPlaceholder();
}

export function getSmsProviderStatus(): {
  provider: string;
  configured: boolean;
} {
  const provider = getSmsProvider();
  return {
    provider: provider.name,
    configured: provider.isConfigured(),
  };
}
