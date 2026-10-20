/**
 * Automatic SMS replenishment reconciliation safety net.
 * Candidate selection is an optimization; claim/orchestrator remains authoritative.
 * No Stripe, credit grant, or SMS send.
 */

export const SMS_REPLENISHMENT_RECONCILIATION_SOURCE = "reconciliation_cron" as const;
export const SMS_REPLENISHMENT_RECONCILIATION_BATCH_SIZE = 50;

export type SmsReplenishmentReconciliationConfigRow = {
  organizationId: string;
  status: string;
  thresholdSegments: number | null;
  paymentMethodId: string | null;
  purchasedBalance: number | null;
  purchasedReserved: number | null;
};

export type SmsReplenishmentReconciliationOutcomeBucket =
  | "started"
  | "above_threshold"
  | "not_enabled"
  | "open_attempt"
  | "awaiting_settlement"
  | "attention"
  | "period_cap"
  | "error"
  | "other";

export type SmsReplenishmentReconciliationSummary = {
  status: "ok" | "partial" | "error";
  candidateCount: number;
  processedCount: number;
  batchSize: number;
  outcomes: Record<SmsReplenishmentReconciliationOutcomeBucket, number>;
  durationMs: number;
};

export type SmsReplenishmentReconciliationOrchestrate = (
  organizationId: string,
) => Promise<{ outcome: string; attemptId: string | null }>;

export type SmsReplenishmentReconciliationLog = (payload: {
  organizationId: string;
  triggerSource: typeof SMS_REPLENISHMENT_RECONCILIATION_SOURCE;
  outcome?: string;
  attemptId?: string | null;
  errorName?: string;
}) => void;

const ORGANIZATION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ATTENTION_STATUSES = new Set([
  "disabled",
  "payment_attention_required",
  "tax_attention_required",
  "authorization_review_required",
]);

export function emptyReconciliationOutcomes(): Record<
  SmsReplenishmentReconciliationOutcomeBucket,
  number
> {
  return {
    started: 0,
    above_threshold: 0,
    not_enabled: 0,
    open_attempt: 0,
    awaiting_settlement: 0,
    attention: 0,
    period_cap: 0,
    error: 0,
    other: 0,
  };
}

export function classifySmsReplenishmentReconciliationOutcome(
  outcome: string,
): SmsReplenishmentReconciliationOutcomeBucket {
  switch (outcome) {
    case "payment_pending":
    case "claimed":
    case "charging":
      return "started";
    case "above_threshold":
      return "above_threshold";
    case "not_enabled":
    case "not_active":
    case "sms_not_entitled":
    case "payment_method_missing":
    case "catalog_invalid":
    case "configuration_invalid":
    case "not_eligible":
      return "not_enabled";
    case "open_attempt_exists":
      return "open_attempt";
    case "awaiting_settlement":
      return "awaiting_settlement";
    case "payment_attention_required":
    case "tax_attention_required":
    case "authorization_review_required":
      return "attention";
    case "period_cap_reached":
      return "period_cap";
    default:
      return "other";
  }
}

/**
 * Conservative candidate filter. Purchased-available <= threshold may include
 * false positives when included capacity remains high; claim no-ops those.
 */
export function selectSmsReplenishmentReconciliationCandidates(
  rows: SmsReplenishmentReconciliationConfigRow[],
  openAttemptOrganizationIds: ReadonlySet<string>,
  batchSize: number = SMS_REPLENISHMENT_RECONCILIATION_BATCH_SIZE,
): string[] {
  const selected: string[] = [];
  const ordered = [...rows].sort((a, b) =>
    a.organizationId.localeCompare(b.organizationId),
  );
  for (const row of ordered) {
    if (selected.length >= batchSize) break;
    if (!ORGANIZATION_ID.test(row.organizationId)) continue;
    if (row.status !== "enabled") continue;
    if (ATTENTION_STATUSES.has(row.status)) continue;
    if (!row.paymentMethodId?.trim()) continue;
    if (
      row.thresholdSegments == null ||
      !Number.isInteger(row.thresholdSegments) ||
      row.thresholdSegments < 1
    ) {
      continue;
    }
    if (openAttemptOrganizationIds.has(row.organizationId)) continue;
    const purchasedAvailable = Math.max(
      0,
      (row.purchasedBalance ?? 0) - (row.purchasedReserved ?? 0),
    );
    if (purchasedAvailable > row.thresholdSegments) continue;
    selected.push(row.organizationId);
  }
  return selected;
}

export function defaultSmsReplenishmentReconciliationLog(
  payload: Parameters<SmsReplenishmentReconciliationLog>[0],
): void {
  console.info("sms_replenishment_reconciliation", {
    organizationId: payload.organizationId,
    triggerSource: payload.triggerSource,
    outcome: payload.outcome ?? null,
    attemptId: payload.attemptId ?? null,
    errorName: payload.errorName ?? null,
  });
}

export async function runSmsReplenishmentReconciliation(input: {
  candidates: string[];
  orchestrate: SmsReplenishmentReconciliationOrchestrate;
  log?: SmsReplenishmentReconciliationLog;
  batchSize?: number;
  nowMs?: () => number;
}): Promise<SmsReplenishmentReconciliationSummary> {
  const log = input.log ?? defaultSmsReplenishmentReconciliationLog;
  const batchSize = input.batchSize ?? SMS_REPLENISHMENT_RECONCILIATION_BATCH_SIZE;
  const nowMs = input.nowMs ?? Date.now;
  const startedAt = nowMs();
  const outcomes = emptyReconciliationOutcomes();
  const candidates = input.candidates.slice(0, batchSize);
  let processedCount = 0;

  for (const organizationId of candidates) {
    try {
      const result = await input.orchestrate(organizationId);
      const bucket = classifySmsReplenishmentReconciliationOutcome(result.outcome);
      outcomes[bucket] += 1;
      processedCount += 1;
      log({
        organizationId,
        triggerSource: SMS_REPLENISHMENT_RECONCILIATION_SOURCE,
        outcome: result.outcome,
        attemptId: result.attemptId,
      });
    } catch (error) {
      outcomes.error += 1;
      processedCount += 1;
      log({
        organizationId,
        triggerSource: SMS_REPLENISHMENT_RECONCILIATION_SOURCE,
        errorName: error instanceof Error ? error.name : "Error",
      });
    }
  }

  const durationMs = Math.max(0, nowMs() - startedAt);
  const status =
    outcomes.error > 0 && outcomes.error === processedCount
      ? "error"
      : outcomes.error > 0
        ? "partial"
        : "ok";

  return {
    status,
    candidateCount: candidates.length,
    processedCount,
    batchSize,
    outcomes,
    durationMs,
  };
}
