import { ConsoleEmailProvider } from "@/lib/notifications/providers/console-provider";
import type { NotificationProvider } from "@/lib/notifications/providers/provider-interface";
import { ResendEmailProvider } from "@/lib/notifications/providers/resend-provider";

export function getEmailProvider(): NotificationProvider {
  const configured = (process.env.EMAIL_PROVIDER ?? "resend")
    .trim()
    .toLowerCase();

  if (configured === "console" || process.env.NODE_ENV === "test") {
    return new ConsoleEmailProvider();
  }

  if (configured === "resend" || configured === "") {
    const resend = new ResendEmailProvider();
    if (!resend.isConfigured() && process.env.NODE_ENV === "development") {
      return new ConsoleEmailProvider();
    }
    return resend;
  }

  // Unknown providers fall back to console so business logic never hard-codes Resend.
  console.warn(
    `[notifications] Unknown EMAIL_PROVIDER "${configured}"; using console provider.`,
  );
  return new ConsoleEmailProvider();
}

export function getEmailProviderStatus(): {
  provider: string;
  configured: boolean;
  channelEnabled: true;
} {
  const provider = getEmailProvider();
  return {
    provider: provider.name,
    configured: provider.isConfigured(),
    channelEnabled: true,
  };
}
