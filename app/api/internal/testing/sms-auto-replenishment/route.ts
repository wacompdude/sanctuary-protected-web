/**
 * TEMPORARY CONTROLLED BILLING TEST ROUTE
 *
 * Remove immediately after the authorized Phase 5C-3C-2E-3L retest.
 * POST only. One hard-coded organization. No credit grant and no SMS send.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  handleSmsAutoReplenishmentTestRequest,
  SMS_REPLENISHMENT_TEST_ORGANIZATION_ID,
  type SmsReplenishmentTestAttempt,
} from "@/lib/billing/stripe/sms-replenishment-test-invocation";
import { orchestrateAutomaticSmsReplenishment } from "@/lib/billing/stripe/sms-replenishment-orchestrator-live";

async function loadControlledAttempts(): Promise<SmsReplenishmentTestAttempt[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("organization_sms_replenishment_attempts")
    .select("id, status")
    .eq("organization_id", SMS_REPLENISHMENT_TEST_ORGANIZATION_ID);
  if (error || !Array.isArray(data)) {
    throw new Error("SMS replenishment test attempt state is unavailable.");
  }
  return data.map((row) => ({
    id: String(row.id),
    status: String(row.status),
  }));
}

export async function POST(request: Request): Promise<Response> {
  return handleSmsAutoReplenishmentTestRequest(request, {
    env: process.env,
    loadAttempts: loadControlledAttempts,
    orchestrate: (organizationId) => {
      if (organizationId !== SMS_REPLENISHMENT_TEST_ORGANIZATION_ID) {
        throw new Error("SMS replenishment test route organization is fixed.");
      }
      return orchestrateAutomaticSmsReplenishment(SMS_REPLENISHMENT_TEST_ORGANIZATION_ID);
    },
  });
}
