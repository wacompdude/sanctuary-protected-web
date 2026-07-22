import type {
  EmailSenderCategory,
  EmailSenderConfiguration,
} from "@/lib/email/email-sender-types";
import { isEmailSenderCategory } from "@/lib/email/email-sender-types";
import { getEmailSenders } from "@/lib/email/email-senders";
import {
  assertSafeHeaderValue,
  EmailSenderConfigError,
  formatEmailSender,
} from "@/lib/email/validate-email-sender";

export { formatEmailSender };

export function resolveEmailSender(
  category: EmailSenderCategory,
): EmailSenderConfiguration {
  if (!isEmailSenderCategory(category)) {
    throw new EmailSenderConfigError(
      "unsupported_sender_category",
      "Unsupported email sender category.",
    );
  }

  try {
    const sender = getEmailSenders()[category];
    // Re-validate friendly name before use.
    assertSafeHeaderValue("Sender name", sender.name, 120);
    return sender;
  } catch (error) {
    if (error instanceof EmailSenderConfigError) {
      console.error("[email] resolveEmailSender failed:", error.code);
      throw error;
    }
    console.error("[email] resolveEmailSender failed with unexpected error");
    throw new EmailSenderConfigError(
      "sender_resolution_failed",
      "Unable to resolve email sender configuration.",
    );
  }
}

export function formatResolvedEmailSender(
  category: EmailSenderCategory,
): { sender: EmailSenderConfiguration; from: string } {
  const sender = resolveEmailSender(category);
  return {
    sender,
    from: formatEmailSender(sender),
  };
}
