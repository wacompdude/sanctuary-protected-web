/**
 * Server-only reconciliation scan for automatic SMS replenishment.
 * Invokes the claim-gated orchestrator only. Does not call Stripe or grant credits.
 */

import "server-only";

import { orchestrateAutomaticSmsReplenishment } from "@/lib/billing/stripe/sms-replenishment-orchestrator-live";
import {
  runSmsReplenishmentReconciliation,
  selectSmsReplenishmentReconciliationCandidates,
  SMS_REPLENISHMENT_RECONCILIATION_BATCH_SIZE,
  type SmsReplenishmentReconciliationConfigRow,
  type SmsReplenishmentReconciliationSummary,
} from "@/lib/billing/stripe/sms-replenishment-reconciliation";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";

async function loadCandidateRows(): Promise<SmsReplenishmentReconciliationConfigRow[]> {
  const admin = createAdminClient();
  const { data: configs, error: configError } = await admin
    .from("organization_sms_auto_replenishment")
    .select("organization_id, status, low_balance_threshold_segments, payment_method_id")
    .eq("status", "enabled")
    .order("organization_id", { ascending: true })
    .limit(SMS_REPLENISHMENT_RECONCILIATION_BATCH_SIZE * 4);
  if (configError) {
    throw new Error("Unable to load SMS replenishment reconciliation candidates.");
  }
  const rows = configs ?? [];
  if (rows.length === 0) return [];

  const organizationIds = rows
    .map((row) => String(row.organization_id ?? ""))
    .filter(Boolean);
  const { data: balances, error: balanceError } = await admin
    .from("organization_sms_credit_balances")
    .select("organization_id, balance, reserved")
    .in("organization_id", organizationIds);
  if (balanceError) {
    throw new Error("Unable to load SMS credit balances for reconciliation.");
  }
  const balanceByOrg = new Map(
    (balances ?? []).map((row) => [
      String(row.organization_id),
      {
        balance: row.balance == null ? null : Number(row.balance),
        reserved: row.reserved == null ? null : Number(row.reserved),
      },
    ]),
  );

  return rows.map((row) => {
    const organizationId = String(row.organization_id ?? "");
    const balance = balanceByOrg.get(organizationId);
    return {
      organizationId,
      status: String(row.status ?? ""),
      thresholdSegments:
        row.low_balance_threshold_segments == null
          ? null
          : Number(row.low_balance_threshold_segments),
      paymentMethodId:
        typeof row.payment_method_id === "string" ? row.payment_method_id : null,
      purchasedBalance: balance?.balance ?? null,
      purchasedReserved: balance?.reserved ?? null,
    };
  });
}

async function loadOpenAttemptOrganizationIds(): Promise<Set<string>> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("organization_sms_replenishment_attempts")
    .select("organization_id")
    .in("status", ["claimed", "charging", "payment_pending"]);
  if (error) {
    throw new Error("Unable to load open SMS replenishment attempts.");
  }
  return new Set(
    (data ?? [])
      .map((row) => String(row.organization_id ?? ""))
      .filter(Boolean),
  );
}

export async function reconcileAutomaticSmsReplenishment(): Promise<SmsReplenishmentReconciliationSummary> {
  if (!isServiceRoleConfigured()) {
    return {
      status: "error",
      candidateCount: 0,
      processedCount: 0,
      batchSize: SMS_REPLENISHMENT_RECONCILIATION_BATCH_SIZE,
      outcomes: {
        started: 0,
        above_threshold: 0,
        not_enabled: 0,
        open_attempt: 0,
        awaiting_settlement: 0,
        attention: 0,
        period_cap: 0,
        error: 1,
        other: 0,
      },
      durationMs: 0,
    };
  }

  const [rows, openAttempts] = await Promise.all([
    loadCandidateRows(),
    loadOpenAttemptOrganizationIds(),
  ]);
  const candidates = selectSmsReplenishmentReconciliationCandidates(
    rows,
    openAttempts,
    SMS_REPLENISHMENT_RECONCILIATION_BATCH_SIZE,
  );

  return runSmsReplenishmentReconciliation({
    candidates,
    orchestrate: async (organizationId) => {
      const result = await orchestrateAutomaticSmsReplenishment(organizationId);
      return { outcome: result.outcome, attemptId: result.attemptId };
    },
  });
}
