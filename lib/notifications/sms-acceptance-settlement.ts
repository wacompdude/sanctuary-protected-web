import type { SmsCapacityResult } from "@/lib/sms/sms-capacity";
import { mayAdvanceDeliveryStatus } from "@/lib/notifications/delivery-status";

export const SMS_COMMIT_RECONCILIATION_CODE =
  "sms_reservation_pending_reconciliation";

export const SMS_COMMIT_RECONCILIATION_MESSAGE =
  "Bird accepted this SMS, but the credit commit still needs reconciliation.";

export const SMS_UNKNOWN_ACCEPTANCE_MESSAGE =
  "SMS reservation is waiting for reconciliation and was not sent again.";

const RETRYABLE_HOLD_STATUSES = new Set(["pending", "queued", "processing"]);

export function smsCommitSucceeded(result: SmsCapacityResult): boolean {
  return result.ok === true && result.outcome === "committed";
}

/**
 * send_started without a provider id is an unknown Bird outcome.
 * Do not send, commit, or release it.
 */
export function birdOutcomeRecovery(
  providerMessageId: string | null | undefined,
  sendStarted: boolean,
): "commit-only" | "strand" | "send" {
  if ((providerMessageId ?? "").trim()) return "commit-only";
  if (sendStarted) return "strand";
  return "send";
}

export function providerAcceptancePatch(
  currentStatus: string,
  providerMessageId: string,
  nowIso: string,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    provider: "bird",
    provider_message_id: providerMessageId,
    updated_at: nowIso,
    last_error_code: null,
    last_error_message: null,
  };
  if (RETRYABLE_HOLD_STATUSES.has(currentStatus)) {
    patch.status = "queued";
    patch.scheduled_for = nowIso;
    patch.failed_at = null;
  }
  return patch;
}

export function reconciliationPatch(
  currentStatus: string,
  nowIso: string,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    last_error_code: SMS_COMMIT_RECONCILIATION_CODE,
    last_error_message: SMS_COMMIT_RECONCILIATION_MESSAGE,
    updated_at: nowIso,
    failed_at: null,
  };
  if (RETRYABLE_HOLD_STATUSES.has(currentStatus) || currentStatus === "failed") {
    patch.status = "queued";
    patch.scheduled_for = nowIso;
  }
  return patch;
}

export function finalizeAcceptedDeliveryPatch(
  currentStatus: string,
  nowIso: string,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    provider: "bird",
    last_error_code: null,
    last_error_message: null,
    updated_at: nowIso,
  };
  if (mayAdvanceDeliveryStatus(currentStatus, "sent")) {
    patch.status = "sent";
    patch.sent_at = nowIso;
  }
  return patch;
}

export function unknownAcceptancePatch(nowIso: string): Record<string, unknown> {
  return {
    status: "failed",
    failed_at: nowIso,
    last_error_code: SMS_COMMIT_RECONCILIATION_CODE,
    last_error_message: SMS_UNKNOWN_ACCEPTANCE_MESSAGE,
    updated_at: nowIso,
  };
}
