/**
 * Server-only production binder for the post-commit SMS replenishment trigger.
 * Uses Next.js after() so work runs outside the SMS critical path.
 */

import "server-only";

import { after } from "next/server";
import { orchestrateAutomaticSmsReplenishment } from "@/lib/billing/stripe/sms-replenishment-orchestrator-live";
import {
  scheduleAutomaticSmsReplenishmentAfterCommit as scheduleCore,
} from "@/lib/billing/stripe/sms-replenishment-trigger";

/**
 * Schedules isolated orchestrator work after Application SMS credits commit.
 * Accepts only the trusted organization ID from SMS dispatch accounting.
 */
export function scheduleAutomaticSmsReplenishmentAfterCommit(
  organizationId: string,
): void {
  scheduleCore(organizationId, {
    schedule: (work) => {
      after(work);
    },
    orchestrate: orchestrateAutomaticSmsReplenishment,
  });
}
