import type {
  EmailSenderCategory,
  EmailSenderConfiguration,
} from "@/lib/email/email-sender-types";
import { EMAIL_SENDER_CATEGORIES } from "@/lib/email/email-sender-types";
import {
  assertApprovedSenderAddress,
  assertSafeHeaderValue,
  EmailSenderConfigError,
  getApprovedEmailDomain,
} from "@/lib/email/validate-email-sender";

type SenderBlueprint = {
  category: EmailSenderCategory;
  name: string;
  localPart: string;
  envAddressKey: string;
  allowReplies: boolean;
  description: string;
  /** Env key for reply-to, or "none" / "default" / "support" / "billing". */
  replyToPolicy: "none" | "default" | "support" | "billing" | "self";
};

/**
 * Operational note (outside the app):
 * - allowReplies=true senders need a real mailbox or forwarding rule for replyTo.
 * - no_reply intentionally omits reply-to (or can use support via EMAIL_REPLY_TO_DEFAULT).
 * - Do not assume Resend creates inboxes; configure DNS + mailbox/forwarding separately.
 */
const SENDER_BLUEPRINTS: readonly SenderBlueprint[] = [
  {
    category: "alerts",
    name: "Sanctuary Protected Alerts",
    localPart: "alerts",
    envAddressKey: "EMAIL_FROM_ALERTS",
    allowReplies: false,
    description: "General automated alerts",
    replyToPolicy: "default",
  },
  {
    category: "no_reply",
    name: "Sanctuary Protected",
    localPart: "no-reply",
    envAddressKey: "EMAIL_FROM_NO_REPLY",
    allowReplies: false,
    description: "Automated account messages that do not accept replies",
    replyToPolicy: "none",
  },
  {
    category: "info",
    name: "Sanctuary Protected",
    localPart: "info",
    envAddressKey: "EMAIL_FROM_INFO",
    allowReplies: true,
    description: "General information and announcements",
    replyToPolicy: "support",
  },
  {
    category: "emergency",
    name: "Sanctuary Protected Emergency",
    localPart: "emergency",
    envAddressKey: "EMAIL_FROM_EMERGENCY",
    allowReplies: false,
    description: "Critical emergency alerts",
    replyToPolicy: "support",
  },
  {
    category: "incidents",
    name: "Sanctuary Protected Incidents",
    localPart: "incidents",
    envAddressKey: "EMAIL_FROM_INCIDENTS",
    allowReplies: true,
    description: "Incident notifications and updates",
    replyToPolicy: "support",
  },
  {
    category: "access",
    name: "Sanctuary Protected Access",
    localPart: "access",
    envAddressKey: "EMAIL_FROM_ACCESS",
    allowReplies: true,
    description: "Invitations, membership, authentication, and access changes",
    replyToPolicy: "support",
  },
  {
    category: "support",
    name: "Sanctuary Protected Support",
    localPart: "support",
    envAddressKey: "EMAIL_FROM_SUPPORT",
    allowReplies: true,
    description: "Customer and technical support communication",
    replyToPolicy: "support",
  },
  {
    category: "billing",
    name: "Sanctuary Protected Billing",
    localPart: "billing",
    envAddressKey: "EMAIL_FROM_BILLING",
    allowReplies: true,
    description: "Subscription, payment, invoice, and trial messages",
    replyToPolicy: "billing",
  },
  {
    category: "hardware",
    name: "Sanctuary Protected Hardware",
    localPart: "hardware",
    envAddressKey: "EMAIL_FROM_HARDWARE",
    allowReplies: true,
    description: "Hardware, camera, sensor, radio, and maintenance messages",
    replyToPolicy: "support",
  },
] as const;

function readEnv(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value || undefined;
}

function defaultAddressFor(localPart: string): string {
  return `${localPart}@${getApprovedEmailDomain()}`;
}

function resolveReplyTo(
  policy: SenderBlueprint["replyToPolicy"],
  selfAddress: string,
): string | undefined {
  if (policy === "none") return undefined;

  if (policy === "billing") {
    return (
      readEnv("EMAIL_REPLY_TO_BILLING") ||
      readEnv("EMAIL_FROM_BILLING") ||
      defaultAddressFor("billing")
    );
  }

  if (policy === "self") {
    return selfAddress;
  }

  // default + support
  return (
    readEnv("EMAIL_REPLY_TO_SUPPORT") ||
    readEnv("EMAIL_REPLY_TO_DEFAULT") ||
    readEnv("EMAIL_REPLY_TO") ||
    readEnv("EMAIL_FROM_SUPPORT") ||
    defaultAddressFor("support")
  );
}

function resolveAddress(
  blueprint: SenderBlueprint,
): { address: string; usedLegacyFallback: boolean } {
  const fromCategoryEnv = readEnv(blueprint.envAddressKey);
  if (fromCategoryEnv) {
    return { address: fromCategoryEnv, usedLegacyFallback: false };
  }

  // Deprecated bridge: EMAIL_FROM_ADDRESS still fills alerts when EMAIL_FROM_ALERTS
  // is unset. Prefer EMAIL_FROM_ALERTS / category-specific env vars.
  if (blueprint.category === "alerts") {
    const legacy = readEnv("EMAIL_FROM_ADDRESS");
    if (legacy) {
      console.warn(
        "[email] EMAIL_FROM_ADDRESS is deprecated; set EMAIL_FROM_ALERTS instead.",
      );
      return { address: legacy, usedLegacyFallback: true };
    }
  }

  return {
    address: defaultAddressFor(blueprint.localPart),
    usedLegacyFallback: false,
  };
}

export function buildEmailSenderRegistry(): Record<
  EmailSenderCategory,
  EmailSenderConfiguration
> {
  const registry = {} as Record<EmailSenderCategory, EmailSenderConfiguration>;

  for (const blueprint of SENDER_BLUEPRINTS) {
    const { address: rawAddress, usedLegacyFallback } = resolveAddress(blueprint);
    const address = assertApprovedSenderAddress(rawAddress, blueprint.category);
    const name = assertSafeHeaderValue("Sender name", blueprint.name, 120);
    const replyToRaw = resolveReplyTo(blueprint.replyToPolicy, address);
    const replyTo = replyToRaw
      ? assertApprovedSenderAddress(replyToRaw, blueprint.category)
      : undefined;

    registry[blueprint.category] = {
      category: blueprint.category,
      name,
      address,
      replyTo,
      allowReplies: blueprint.allowReplies,
      description: blueprint.description,
      usedLegacyFallback,
    };
  }

  return registry;
}

/** Snapshot of approved senders for the current process env. */
export function getEmailSenders(): Record<
  EmailSenderCategory,
  EmailSenderConfiguration
> {
  return buildEmailSenderRegistry();
}

export function listEmailSenderConfigurations(): EmailSenderConfiguration[] {
  const registry = getEmailSenders();
  return EMAIL_SENDER_CATEGORIES.map((category) => registry[category]);
}

export function isEmailProviderApiConfigured(): boolean {
  return Boolean(
    process.env.EMAIL_PROVIDER_API_KEY?.trim() ||
      process.env.RESEND_API_KEY?.trim(),
  );
}

export function isEmailSenderSystemConfigured(): boolean {
  if (!isEmailProviderApiConfigured()) return false;
  try {
    const alerts = buildEmailSenderRegistry().alerts;
    return Boolean(alerts.address);
  } catch (error) {
    if (error instanceof EmailSenderConfigError) {
      console.error("[email] sender configuration error:", error.code);
      return false;
    }
    throw error;
  }
}
