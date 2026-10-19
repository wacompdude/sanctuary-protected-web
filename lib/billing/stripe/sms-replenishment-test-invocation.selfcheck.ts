/**
 * TEMPORARY CONTROLLED BILLING TEST ROUTE
 *
 * Remove immediately after the authorized Phase 5C-3C-2E-3C retest.
 * Mocks only. No Stripe, database mutation, orchestrator execution, or SMS.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  handleSmsAutoReplenishmentTestRequest,
  SMS_REPLENISHMENT_TEST_BASELINE_ATTEMPT_ID,
  SMS_REPLENISHMENT_TEST_ORGANIZATION_ID,
  type SmsReplenishmentTestAttempt,
  type SmsReplenishmentTestDeps,
} from "@/lib/billing/stripe/sms-replenishment-test-invocation";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const SECRET = "controlled-test-secret-not-a-credential";
const ORGANIZATION_ID = "a5246f30-84dc-4f8e-b27f-03390e8cadbe";
const BASELINE_ID = "1c0eb748-c9ea-4802-bece-c5ef694a11e5";
const baseline = (): SmsReplenishmentTestAttempt[] => [
  { id: BASELINE_ID, status: "canceled" },
];

function deps(overrides: Partial<SmsReplenishmentTestDeps> = {}): {
  deps: SmsReplenishmentTestDeps;
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    deps: {
      env: {
        NODE_ENV: "production",
        VERCEL_ENV: "production",
        SMS_REPLENISHMENT_TEST_ENABLED: "true",
        SMS_REPLENISHMENT_TEST_SECRET: SECRET,
      },
      loadAttempts: async () => baseline(),
      orchestrate: async (organizationId) => {
        calls.push(organizationId);
        return {
          outcome: "payment_pending",
          attemptId: "11111111-1111-4111-8111-111111111111",
          grantsCredits: false,
        };
      },
      ...overrides,
    },
  };
}

function request(method: string, body?: string, authorization?: string): Request {
  const headers = new Headers();
  if (authorization !== undefined) headers.set("authorization", authorization);
  return new Request("https://sanctuaryprotected.com/api/internal/testing/sms-auto-replenishment", {
    method,
    headers,
    body,
  });
}

async function main() {
  const get = deps();
  const getResponse = await handleSmsAutoReplenishmentTestRequest(
    request("GET", undefined, `Bearer ${SECRET}`),
    get.deps,
  );
  assert(getResponse.status === 405, "1 GET cannot execute");
  assert(get.calls.length === 0, "1 GET orchestrator calls");

  const absent = deps({
    env: {
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      SMS_REPLENISHMENT_TEST_SECRET: SECRET,
    },
  });
  const absentResponse = await handleSmsAutoReplenishmentTestRequest(
    request("POST", undefined, `Bearer ${SECRET}`),
    absent.deps,
  );
  assert((await absentResponse.json()).status === "disabled", "2 gate absent");
  assert(absent.calls.length === 0, "2 gate absent calls");

  const off = deps({
    env: {
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      SMS_REPLENISHMENT_TEST_ENABLED: "false",
      SMS_REPLENISHMENT_TEST_SECRET: SECRET,
    },
  });
  const offResponse = await handleSmsAutoReplenishmentTestRequest(
    request("POST", undefined, `Bearer ${SECRET}`),
    off.deps,
  );
  assert((await offResponse.json()).status === "disabled", "3 gate false");
  assert(off.calls.length === 0, "3 gate false calls");

  const missing = deps();
  const missingResponse = await handleSmsAutoReplenishmentTestRequest(request("POST"), missing.deps);
  assert(missingResponse.status === 401, "4 missing authorization");
  assert(missing.calls.length === 0, "4 missing authorization calls");

  const wrong = deps();
  const wrongResponse = await handleSmsAutoReplenishmentTestRequest(
    request("POST", undefined, "Bearer wrong-secret"),
    wrong.deps,
  );
  assert(wrongResponse.status === 401, "5 wrong bearer");
  assert(wrong.calls.length === 0, "5 wrong bearer calls");

  const local = deps({
    env: {
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      SMS_REPLENISHMENT_TEST_ENABLED: "true",
      SMS_REPLENISHMENT_TEST_SECRET: SECRET,
    } as NodeJS.ProcessEnv,
  });
  const localResponse = await handleSmsAutoReplenishmentTestRequest(
    request("POST", undefined, `Bearer ${SECRET}`),
    local.deps,
  );
  assert(localResponse.status === 403, "6 non-production");
  assert(local.calls.length === 0, "6 non-production calls");

  const injected = deps();
  const injectedResponse = await handleSmsAutoReplenishmentTestRequest(
    request(
      "POST",
      JSON.stringify({
        organization_id: "00000000-0000-4000-8000-000000000000",
        attemptId: BASELINE_ID,
        attemptCount: 1,
      }),
      `Bearer ${SECRET}`,
    ),
    injected.deps,
  );
  assert(injectedResponse.status === 400, "8 organization body rejected");
  assert(injected.calls.length === 0, "8 organization injection calls");

  const amount = deps();
  const amountResponse = await handleSmsAutoReplenishmentTestRequest(
    request("POST", JSON.stringify({ amount: 500, package: "sms_block_50", tax: 53 }), `Bearer ${SECRET}`),
    amount.deps,
  );
  assert(amountResponse.status === 400, "9 amount rejected");
  assert(amount.calls.length === 0, "9 amount calls");

  const card = deps();
  const cardResponse = await handleSmsAutoReplenishmentTestRequest(
    request("POST", JSON.stringify({ paymentMethod: "pm_other", threshold: 49, cap: 2500 }), `Bearer ${SECRET}`),
    card.deps,
  );
  assert(cardResponse.status === 400, "10 payment method rejected");
  assert(card.calls.length === 0, "10 payment method calls");

  const accepted = deps();
  const acceptedResponse = await handleSmsAutoReplenishmentTestRequest(
    request("POST", undefined, `Bearer ${SECRET}`),
    accepted.deps,
  );
  const acceptedBody = await acceptedResponse.json();
  assert(acceptedResponse.status === 200, "11 accepted");
  assert(accepted.calls.length === 1, "11 one orchestrator call");
  assert(accepted.calls[0] === ORGANIZATION_ID, "12 hard-coded organization");
  assert(accepted.calls[0] === SMS_REPLENISHMENT_TEST_ORGANIZATION_ID, "12 exported organization");
  assert(acceptedBody.status === "accepted", "11 status");
  assert(acceptedBody.attemptId === "11111111-1111-4111-8111-111111111111", "11 attempt");
  assert(acceptedBody.outcome === "payment_pending", "11 outcome");
  assert(!JSON.stringify(acceptedBody).includes(SECRET), "16 secret not returned");
  assert(!("grantsCredits" in acceptedBody), "13 response does not grant");

  const missingBaseline = deps({ loadAttempts: async () => [] });
  const missingBaselineResponse = await handleSmsAutoReplenishmentTestRequest(
    request("POST", undefined, `Bearer ${SECRET}`),
    missingBaseline.deps,
  );
  assert((await missingBaselineResponse.json()).status === "baseline_rejected", "9 empty baseline");
  assert(missingBaseline.calls.length === 0, "9 empty baseline calls");

  const wrongId = deps({
    loadAttempts: async () => [{ id: "22222222-2222-4222-8222-222222222222", status: "canceled" }],
  });
  const wrongIdResponse = await handleSmsAutoReplenishmentTestRequest(
    request("POST", undefined, `Bearer ${SECRET}`),
    wrongId.deps,
  );
  assert((await wrongIdResponse.json()).status === "baseline_rejected", "10 historical id");
  assert(wrongId.calls.length === 0, "10 historical id calls");

  const open = deps({
    loadAttempts: async () => [{ id: BASELINE_ID, status: "claimed" }],
  });
  const openResponse = await handleSmsAutoReplenishmentTestRequest(
    request("POST", undefined, `Bearer ${SECRET}`),
    open.deps,
  );
  assert((await openResponse.json()).status === "baseline_rejected", "11 historical status");
  assert(open.calls.length === 0, "11 historical status calls");

  const repeat = deps({
    loadAttempts: async () => [
      ...baseline(),
      { id: "33333333-3333-4333-8333-333333333333", status: "claimed" },
    ],
  });
  const repeatResponse = await handleSmsAutoReplenishmentTestRequest(
    request("POST", undefined, `Bearer ${SECRET}`),
    repeat.deps,
  );
  assert(repeatResponse.status === 409, "12 second attempt blocked");
  assert((await repeatResponse.json()).status === "already_invoked", "12 already invoked");
  assert(repeat.calls.length === 0, "12 second attempt calls");

  const route = readFileSync(
    join(process.cwd(), "app/api/internal/testing/sms-auto-replenishment/route.ts"),
    "utf8",
  );
  const handler = readFileSync(
    join(process.cwd(), "lib/billing/stripe/sms-replenishment-test-invocation.ts"),
    "utf8",
  );
  assert(route.includes("TEMPORARY CONTROLLED BILLING TEST ROUTE"), "route is marked temporary");
  assert(route.includes("Phase 5C-3C-2E-3C"), "route names the removal phase");
  assert(!route.includes("export async function GET") && !route.includes("export function GET"), "1 route has no GET");
  assert(route.includes("orchestrateAutomaticSmsReplenishment(SMS_REPLENISHMENT_TEST_ORGANIZATION_ID)"), "13 route calls the fixed organization");
  assert(route.includes("organization_sms_replenishment_attempts"), "baseline reads persistent attempts");
  assert(handler.includes("timingSafeEqual"), "4 comparison is timing-safe");
  assert(handler.includes(BASELINE_ID), "10 baseline id is hard-coded");
  assert(handler.includes(SMS_REPLENISHMENT_TEST_BASELINE_ATTEMPT_ID), "10 exported baseline");
  assert(handler.includes('status === "canceled"'), "11 canceled baseline");
  assert(handler.includes("attempts.length >= 2"), "12 count guard");
  assert(!route.includes("record_automatic_application_sms_replenishment"), "14 route does not grant");
  assert(!handler.includes("record_automatic_application_sms_replenishment"), "14 handler does not grant");
  assert(!route.includes("stripe.") && !handler.includes("stripe."), "15 no direct Stripe call");
  assert(!route.includes("paymentIntents") && !handler.includes("paymentIntents"), "15 no PaymentIntent create");
  assert(!route.toLowerCase().includes("sendsms") && !handler.toLowerCase().includes("sendsms"), "16 no SMS send");
  assert(!route.includes("NEXT_PUBLIC_SMS_REPLENISHMENT_TEST_SECRET"), "secret is server-only");
  assert(handler.includes("deps.orchestrate(SMS_REPLENISHMENT_TEST_ORGANIZATION_ID)"), "7 caller cannot choose organization");
  assert(handler.includes('request.method !== "POST"'), "GET handler rejects");
  assert(handler.includes('deps.env[SMS_REPLENISHMENT_TEST_GATE] !== "true"'), "2 gate required");
  assert(handler.includes('env.VERCEL_ENV === "production"'), "5 production runtime");

  console.log("sms replenishment test invocation selfcheck passed");
}

void main();
