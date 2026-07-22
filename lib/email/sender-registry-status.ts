import {
  EMAIL_SENDER_CATEGORIES,
  EMAIL_SENDER_LABELS,
  type EmailSenderCategory,
  type EmailSenderConfiguration,
} from "@/lib/email/email-sender-types";
import { getEmailSenders } from "@/lib/email/email-senders";
import { EmailSenderConfigError, getApprovedEmailDomain } from "@/lib/email/validate-email-sender";

export type EmailSenderStatusRow = {
  category: EmailSenderCategory;
  label: string;
  name: string;
  address: string;
  replyTo: string | null;
  allowReplies: boolean;
  description: string;
  status: "configured" | "error";
  errorCode: string | null;
};

export type EmailSenderRegistryStatus = {
  domain: string | null;
  rows: EmailSenderStatusRow[];
  configuredCount: number;
  errorCount: number;
};

export function getEmailSenderRegistryStatus(): EmailSenderRegistryStatus {
  let domain: string | null = null;
  try {
    domain = getApprovedEmailDomain();
  } catch {
    domain = null;
  }

  let registry: Record<EmailSenderCategory, EmailSenderConfiguration> | null =
    null;
  let registryError: string | null = null;
  try {
    registry = getEmailSenders();
  } catch (error) {
    registryError =
      error instanceof EmailSenderConfigError
        ? error.code
        : "sender_resolution_failed";
  }

  const rows: EmailSenderStatusRow[] = EMAIL_SENDER_CATEGORIES.map((category) => {
    if (!registry) {
      return {
        category,
        label: EMAIL_SENDER_LABELS[category],
        name: "",
        address: "",
        replyTo: null,
        allowReplies: false,
        description: "",
        status: "error" as const,
        errorCode: registryError,
      };
    }

    const sender = registry[category];
    return {
      category,
      label: EMAIL_SENDER_LABELS[category],
      name: sender.name,
      address: sender.address,
      replyTo: sender.replyTo ?? null,
      allowReplies: sender.allowReplies,
      description: sender.description,
      status: "configured" as const,
      errorCode: null,
    };
  });

  return {
    domain,
    rows,
    configuredCount: rows.filter((row) => row.status === "configured").length,
    errorCount: rows.filter((row) => row.status === "error").length,
  };
}
