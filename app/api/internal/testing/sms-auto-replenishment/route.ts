/**
 * TEMPORARY CONTROLLED BILLING TEST ROUTE
 *
 * Remove immediately after Phase 5C-3C-2E-2.
 * POST only. One hard-coded organization. No credit grant and no SMS send.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  handleSmsAutoReplenishmentTestRequest,
  SMS_REPLENISHMENT_TEST_ORGANIZATION_ID,
} from "@/lib/billing/stripe/sms-replenishment-test-invocation";
import { orchestrateAutomaticSmsReplenishment } from "@/lib/billing/stripe/sms-replenishment-orchestrator-live";

async function countControlledAttempts(): Promise<number> {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("organization_sms_replenishment_attempts")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", SMS_REPLENISHMENT_TEST_ORGANIZATION_ID);
  if (error || typeof count !== "number") {
    throw new Error("SMS replenishment test attempt state is unavailable.");
  }
  return count;
}

export async function POST(request: Request): Promise<Response> {
  return handleSmsAutoReplenishmentTestRequest(request, {
    env: process.env,
    countAttempts: countControlledAttempts,
    orchestrate: (organizationId) => {
      if (organizationId !== SMS_REPLENISHMENT_TEST_ORGANIZATION_ID) {
        throw new Error("SMS replenishment test route organization is fixed.");
      }
      return orchestrateAutomaticSmsReplenishment(SMS_REPLENISHMENT_TEST_ORGANIZATION_ID);
    },
  });
}
