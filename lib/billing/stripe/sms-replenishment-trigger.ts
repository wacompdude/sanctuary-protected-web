/**
 * Post-commit automatic SMS replenishment trigger core.
 * Pure scheduling/isolation logic. Production binds after() + live orchestrator
 * in sms-replenishment-trigger-live.ts.
 */

import type { SmsReplenishmentOrchestrationResult } from "@/lib/billing/stripe/sms-replenishment-orchestrator";

export const SMS_REPLENISHMENT_TRIGGER_SOURCE = "post_commit" as const;

export type SmsReplenishmentTriggerOrchestrate = (
  organizationId: string,
) => Promise<SmsReplenishmentOrchestrationResult>;

export type SmsReplenishmentTriggerSchedule = (
  work: () => void | Promise<void>,
) => void;

export type SmsReplenishmentTriggerLog = (payload: {
  organizationId: string;
  triggerSource: typeof SMS_REPLENISHMENT_TRIGGER_SOURCE;
  outcome?: string;
  attemptId?: string | null;
  errorName?: string;
}) => void;

export type SmsReplenishmentTriggerDeps = {
  orchestrate: SmsReplenishmentTriggerOrchestrate;
  schedule: SmsReplenishmentTriggerSchedule;
  log?: SmsReplenishmentTriggerLog;
};

const ORGANIZATION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function defaultSmsReplenishmentTriggerLog(
  payload: Parameters<SmsReplenishmentTriggerLog>[0],
): void {
  console.info("sms_replenishment_trigger", {
    organizationId: payload.organizationId,
    triggerSource: payload.triggerSource,
    outcome: payload.outcome ?? null,
    attemptId: payload.attemptId ?? null,
    errorName: payload.errorName ?? null,
  });
}

export async function runAutomaticSmsReplenishmentTrigger(
  organizationId: string,
  deps: Pick<SmsReplenishmentTriggerDeps, "orchestrate"> &
    Partial<Pick<SmsReplenishmentTriggerDeps, "log">>,
): Promise<void> {
  const log = deps.log ?? defaultSmsReplenishmentTriggerLog;
  const id = organizationId.trim();
  if (!ORGANIZATION_ID.test(id)) {
    log({
      organizationId: id.slice(0, 36),
      triggerSource: SMS_REPLENISHMENT_TRIGGER_SOURCE,
      errorName: "invalid_organization_id",
    });
    return;
  }
  try {
    const result = await deps.orchestrate(id);
    log({
      organizationId: id,
      triggerSource: SMS_REPLENISHMENT_TRIGGER_SOURCE,
      outcome: result.outcome,
      attemptId: result.attemptId ?? null,
    });
  } catch (error) {
    log({
      organizationId: id,
      triggerSource: SMS_REPLENISHMENT_TRIGGER_SOURCE,
      errorName: error instanceof Error ? error.name : "Error",
    });
  }
}

/**
 * Schedules claim-gated replenishment after a successful Application SMS commit.
 * Never throws into the SMS dispatch result.
 */
export function scheduleAutomaticSmsReplenishmentAfterCommit(
  organizationId: string,
  deps: SmsReplenishmentTriggerDeps,
): void {
  const log = deps.log ?? defaultSmsReplenishmentTriggerLog;
  const id = organizationId.trim();
  try {
    deps.schedule(() => runAutomaticSmsReplenishmentTrigger(id, deps));
  } catch (error) {
    log({
      organizationId: id.slice(0, 36),
      triggerSource: SMS_REPLENISHMENT_TRIGGER_SOURCE,
      errorName: error instanceof Error ? error.name : "schedule_failed",
    });
  }
}
