import type { EmailSenderCategory } from "@/lib/email/email-sender-types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEADER_INJECTION = /[\r\n\0]/;

export class EmailSenderConfigError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "EmailSenderConfigError";
    this.code = code;
  }
}

export function getApprovedEmailDomain(): string {
  const domain =
    process.env.EMAIL_DOMAIN?.trim().toLowerCase() || "sanctuaryprotected.com";
  if (!domain || domain.includes("@") || HEADER_INJECTION.test(domain)) {
    throw new EmailSenderConfigError(
      "invalid_email_domain",
      "EMAIL_DOMAIN is not configured correctly.",
    );
  }
  return domain;
}

export function assertSafeHeaderValue(
  label: string,
  value: string,
  maxLength = 200,
): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new EmailSenderConfigError(
      "invalid_header_value",
      `${label} is required.`,
    );
  }
  if (HEADER_INJECTION.test(trimmed)) {
    throw new EmailSenderConfigError(
      "header_injection",
      `${label} contains invalid characters.`,
    );
  }
  if (trimmed.length > maxLength) {
    throw new EmailSenderConfigError(
      "header_too_long",
      `${label} is too long.`,
    );
  }
  return trimmed;
}

export function assertApprovedSenderAddress(
  address: string,
  category: EmailSenderCategory,
): string {
  const trimmed = assertSafeHeaderValue("Sender address", address, 254).toLowerCase();
  if (!EMAIL_PATTERN.test(trimmed)) {
    throw new EmailSenderConfigError(
      "invalid_sender_address",
      `Sender address for ${category} is invalid.`,
    );
  }

  const domain = getApprovedEmailDomain();
  const at = trimmed.lastIndexOf("@");
  const addressDomain = trimmed.slice(at + 1);
  if (addressDomain !== domain) {
    throw new EmailSenderConfigError(
      "unapproved_sender_domain",
      `Sender address for ${category} must use @${domain}.`,
    );
  }

  return trimmed;
}

export function formatEmailSender(input: {
  name: string;
  address: string;
}): string {
  const name = assertSafeHeaderValue("Sender name", input.name, 120);
  const address = assertApprovedSenderAddress(
    input.address,
    // category only used for error wording; address already validated by domain
    "alerts",
  );
  return `${name} <${address}>`;
}
