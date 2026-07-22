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
  replyToPolicy: "none" | "default" | "support" | "billing" | "self";
};

/**
 * Operational note (outside the app):
 * - allowReplies=true senders need a real mailbox or forwarding rule for replyTo.
 * - no_reply intentionally omits reply-to.
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

const BLUEPRINT_BY_CATEGORY = Object.fromEntries(
  SENDER_BLUEPRINTS.map((blueprint) => [blueprint.category, blueprint]),
) as Record<EmailSenderCategory, SenderBlueprint>;

function readEnv(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value || undefined;
}

/** Accept bare addresses or `Name <address@domain>` env values. */
export function extractEmailAddress(raw: string): string {
  const trimmed = raw.trim();
  const angled = trimmed.match(/<([^>]+)>/);
  if (angled?.[1]) return angled[1].trim();
  return trimmed;
}

function defaultAddressFor(localPart: string): string {
  return `${localPart}@${getApprovedEmailDomain()}`;
}

function tryApprovedAddress(
  raw: string | undefined,
  category: EmailSenderCategory,
): string | null {
  if (!raw) return null;
  try {
    return assertApprovedSenderAddress(extractEmailAddress(raw), category);
  } catch (error) {
    const code =
      error instanceof EmailSenderConfigError ? error.code : "invalid_address";
    console.warn(`[email] ignoring invalid address for ${category}:`, code);
    return null;
  }
}

function resolveReplyTo(
  policy: SenderBlueprint["replyToPolicy"],
  category: EmailSenderCategory,
  selfAddress: string,
): string | undefined {
  if (policy === "none") return undefined;

  const candidates =
    policy === "billing"
      ? [
          readEnv("EMAIL_REPLY_TO_BILLING"),
          readEnv("EMAIL_FROM_BILLING"),
          defaultAddressFor("billing"),
        ]
      : policy === "self"
        ? [selfAddress]
        : [
            readEnv("EMAIL_REPLY_TO_SUPPORT"),
            readEnv("EMAIL_REPLY_TO_DEFAULT"),
            readEnv("EMAIL_REPLY_TO"),
            readEnv("EMAIL_FROM_SUPPORT"),
            readEnv("MEMBERSHIP_INVITE_REPLY_TO"),
            defaultAddressFor("support"),
          ];

  for (const candidate of candidates) {
    const approved = tryApprovedAddress(candidate, category);
    if (approved) return approved;
  }

  // Last resort: always stay on the approved domain.
  return defaultAddressFor(policy === "billing" ? "billing" : "support");
}

function resolveAddress(
  blueprint: SenderBlueprint,
): { address: string; usedLegacyFallback: boolean } {
  const fromCategoryEnv = tryApprovedAddress(
    readEnv(blueprint.envAddressKey),
    blueprint.category,
  );
  if (fromCategoryEnv) {
    return { address: fromCategoryEnv, usedLegacyFallback: false };
  }

  // Deprecated bridge: EMAIL_FROM_ADDRESS still fills alerts when EMAIL_FROM_ALERTS
  // is unset. Prefer EMAIL_FROM_ALERTS / category-specific env vars.
  if (blueprint.category === "alerts") {
    const legacy = tryApprovedAddress(
      readEnv("EMAIL_FROM_ADDRESS"),
      blueprint.category,
    );
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

export function buildEmailSenderForCategory(
  category: EmailSenderCategory,
): EmailSenderConfiguration {
  const blueprint = BLUEPRINT_BY_CATEGORY[category];
  if (!blueprint) {
    throw new EmailSenderConfigError(
      "unsupported_sender_category",
      "Unsupported email sender category.",
    );
  }

  const { address: rawAddress, usedLegacyFallback } = resolveAddress(blueprint);
  const address = assertApprovedSenderAddress(rawAddress, blueprint.category);
  const name = assertSafeHeaderValue("Sender name", blueprint.name, 120);
  const replyTo = resolveReplyTo(
    blueprint.replyToPolicy,
    blueprint.category,
    address,
  );

  return {
    category: blueprint.category,
    name,
    address,
    replyTo,
    allowReplies: blueprint.allowReplies,
    description: blueprint.description,
    usedLegacyFallback,
  };
}

export function buildEmailSenderRegistry(): Record<
  EmailSenderCategory,
  EmailSenderConfiguration
> {
  const registry = {} as Record<EmailSenderCategory, EmailSenderConfiguration>;
  for (const category of EMAIL_SENDER_CATEGORIES) {
    registry[category] = buildEmailSenderForCategory(category);
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
  return EMAIL_SENDER_CATEGORIES.map((category) =>
    buildEmailSenderForCategory(category),
  );
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
    const alerts = buildEmailSenderForCategory("alerts");
    return Boolean(alerts.address);
  } catch (error) {
    if (error instanceof EmailSenderConfigError) {
      console.error("[email] sender configuration error:", error.code);
      return false;
    }
    throw error;
  }
}
