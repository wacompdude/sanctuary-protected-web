/**
 * TEMPORARY CONTROLLED BILLING TEST ROUTE
 *
 * Remove immediately after the authorized Phase 5C-3C-2E-3L retest.
 * Mocks only. No Stripe, database mutation, orchestrator execution, or SMS.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  handleSmsAutoReplenishmentTestRequest,
  SMS_REPLENISHMENT_TEST_BASELINE,
  SMS_REPLENISHMENT_TEST_ORGANIZATION_ID,
  type SmsReplenishmentTestDeps,
} from "@/lib/billing/stripe/sms-replenishment-test-invocation";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const SECRET = "controlled-test-secret-not-a-credential";
const ATTEMPT_1 = "1c0eb748-c9ea-4802-bece-c5ef694a11e5";
const ATTEMPT_2 = "d858aada-e893-45e7-9114-f70b87b30415";
const ATTEMPT_3 = "6ef1b538-8ac0-454d-b7b3-cc1735e9ee9e";
const baseline = () => [
  { id: ATTEMPT_1, status: "canceled" },
  { id: ATTEMPT_2, status: "canceled" },
  { id: ATTEMPT_3, status: "canceled" },
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

async function post(
  target: ReturnType<typeof deps>,
  body?: string,
  authorization = `Bearer ${SECRET}`,
) {
  return handleSmsAutoReplenishmentTestRequest(
    request("POST", body, authorization),
    target.deps,
  );
}

async function main() {
  const get = deps();
  assert(
    (await handleSmsAutoReplenishmentTestRequest(
      request("GET", undefined, `Bearer ${SECRET}`),
      get.deps,
    )).status === 405,
    "1 GET",
  );
  assert(get.calls.length === 0, "1 GET calls");

  const absent = deps({
    env: {
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      SMS_REPLENISHMENT_TEST_SECRET: SECRET,
    },
  });
  assert(
    (await post(absent).then((response) => response.json())).status === "disabled",
    "2 gate absent",
  );
  assert(absent.calls.length === 0, "2 calls");

  const off = deps({
    env: {
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      SMS_REPLENISHMENT_TEST_ENABLED: "false",
      SMS_REPLENISHMENT_TEST_SECRET: SECRET,
    },
  });
  assert(
    (await post(off).then((response) => response.json())).status === "disabled",
    "3 gate false",
  );

  const missing = deps();
  assert(
    (await handleSmsAutoReplenishmentTestRequest(request("POST"), missing.deps)).status === 401,
    "4 missing secret",
  );
  assert(missing.calls.length === 0, "4 calls");
  const wrong = deps();
  assert((await post(wrong, undefined, "Bearer wrong-secret")).status === 401, "5 wrong secret");

  const preview = deps({
    env: {
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      SMS_REPLENISHMENT_TEST_ENABLED: "true",
      SMS_REPLENISHMENT_TEST_SECRET: SECRET,
    } as NodeJS.ProcessEnv,
  });
  assert((await post(preview)).status === 403, "6 preview");
  assert(preview.calls.length === 0, "6 calls");

  const body = deps();
  assert(
    (
      await post(
        body,
        JSON.stringify({
          organizationId: "other",
          amount: 500,
          paymentMethod: "pm_other",
          attemptCount: 3,
        }),
      )
    ).status === 400,
    "8 body",
  );
  assert(body.calls.length === 0, "8 calls");

  const accepted = deps();
  const acceptedResponse = await post(accepted);
  const acceptedBody = await acceptedResponse.json();
  assert(acceptedResponse.status === 200 && acceptedBody.status === "accepted", "accepted");
  assert(
    accepted.calls.length === 1 && accepted.calls[0] === SMS_REPLENISHMENT_TEST_ORGANIZATION_ID,
    "7 hard-coded organization",
  );
  assert(!JSON.stringify(acceptedBody).includes(SECRET), "secret not returned");

  const reversed = deps({ loadAttempts: async () => baseline().reverse() });
  assert((await post(reversed)).status === 200, "baseline order independent");
  assert(reversed.calls.length === 1, "reversed calls");

  const missingAttempt = deps({
    loadAttempts: async () => [
      { id: ATTEMPT_1, status: "canceled" },
      { id: ATTEMPT_2, status: "canceled" },
    ],
  });
  assert(
    (await post(missingAttempt).then((response) => response.json())).status ===
      "baseline_rejected",
    "9 three attempts",
  );
  assert(missingAttempt.calls.length === 0, "9 calls");

  const wrongFirst = deps({
    loadAttempts: async () => [
      { id: "22222222-2222-4222-8222-222222222222", status: "canceled" },
      { id: ATTEMPT_2, status: "canceled" },
      { id: ATTEMPT_3, status: "canceled" },
    ],
  });
  assert(
    (await post(wrongFirst).then((response) => response.json())).status === "baseline_rejected",
    "10 attempt 1 id",
  );

  const openFirst = deps({
    loadAttempts: async () => [
      { id: ATTEMPT_1, status: "claimed" },
      { id: ATTEMPT_2, status: "canceled" },
      { id: ATTEMPT_3, status: "canceled" },
    ],
  });
  assert(
    (await post(openFirst).then((response) => response.json())).status === "baseline_rejected",
    "11 attempt 1 canceled",
  );

  const wrongSecond = deps({
    loadAttempts: async () => [
      { id: ATTEMPT_1, status: "canceled" },
      { id: "33333333-3333-4333-8333-333333333333", status: "canceled" },
      { id: ATTEMPT_3, status: "canceled" },
    ],
  });
  assert(
    (await post(wrongSecond).then((response) => response.json())).status === "baseline_rejected",
    "12 attempt 2 id",
  );

  const openSecond = deps({
    loadAttempts: async () => [
      { id: ATTEMPT_1, status: "canceled" },
      { id: ATTEMPT_2, status: "claimed" },
      { id: ATTEMPT_3, status: "canceled" },
    ],
  });
  assert(
    (await post(openSecond).then((response) => response.json())).status === "baseline_rejected",
    "13 attempt 2 canceled",
  );

  const wrongThird = deps({
    loadAttempts: async () => [
      { id: ATTEMPT_1, status: "canceled" },
      { id: ATTEMPT_2, status: "canceled" },
      { id: "55555555-5555-4555-8555-555555555555", status: "canceled" },
    ],
  });
  assert(
    (await post(wrongThird).then((response) => response.json())).status === "baseline_rejected",
    "14 attempt 3 id",
  );

  const openThird = deps({
    loadAttempts: async () => [
      { id: ATTEMPT_1, status: "canceled" },
      { id: ATTEMPT_2, status: "canceled" },
      { id: ATTEMPT_3, status: "claimed" },
    ],
  });
  assert(
    (await post(openThird).then((response) => response.json())).status === "baseline_rejected",
    "15 attempt 3 canceled",
  );
  assert(openThird.calls.length === 0, "15 calls");

  const fourth = deps({
    loadAttempts: async () => [
      ...baseline(),
      { id: "44444444-4444-4444-8444-444444444444", status: "claimed" },
    ],
  });
  assert(
    (await post(fourth).then((response) => response.json())).status === "already_invoked",
    "16 fourth attempt",
  );
  assert(fourth.calls.length === 0, "16 calls");

  const route = readFileSync(
    join(process.cwd(), "app/api/internal/testing/sms-auto-replenishment/route.ts"),
    "utf8",
  );
  const handler = readFileSync(
    join(process.cwd(), "lib/billing/stripe/sms-replenishment-test-invocation.ts"),
    "utf8",
  );
  const live = readFileSync(
    join(process.cwd(), "lib/billing/stripe/sms-replenishment-orchestrator-live.ts"),
    "utf8",
  );
  const paymentKey = readFileSync(
    join(process.cwd(), "lib/billing/sms-auto-replenishment.ts"),
    "utf8",
  );
  assert(!route.includes("export async function GET"), "1 no GET export");
  assert(handler.includes("timingSafeEqual"), "4 timing-safe");
  assert(handler.includes('deps.env[SMS_REPLENISHMENT_TEST_GATE] !== "true"'), "2 gate");
  assert(handler.includes('env.VERCEL_ENV === "production"'), "5 production");
  assert(
    handler.includes(ATTEMPT_1) &&
      handler.includes(ATTEMPT_2) &&
      handler.includes(ATTEMPT_3),
    "10 12 14 hard-coded ids",
  );
  assert(SMS_REPLENISHMENT_TEST_BASELINE[0].id === ATTEMPT_1, "10 exported");
  assert(SMS_REPLENISHMENT_TEST_BASELINE[1].id === ATTEMPT_2, "12 exported");
  assert(SMS_REPLENISHMENT_TEST_BASELINE[2].id === ATTEMPT_3, "14 exported");
  assert(SMS_REPLENISHMENT_TEST_BASELINE[2].status === "canceled", "15 exported status");
  assert(handler.includes("attempts.length >= 4"), "16 lockout");
  assert(
    route.includes("orchestrateAutomaticSmsReplenishment(SMS_REPLENISHMENT_TEST_ORGANIZATION_ID)"),
    "17 live orchestrator",
  );
  assert(!route.includes("stripe.") && !handler.includes("stripe."), "18 no Stripe");
  assert(!route.includes("record_automatic_application_sms_replenishment"), "19 no grant");
  assert(
    !handler.toLowerCase().includes("sendsms") && !route.toLowerCase().includes("sendsms"),
    "20 no SMS",
  );
  assert(handler.includes("deps.orchestrate(SMS_REPLENISHMENT_TEST_ORGANIZATION_ID)"), "7 fixed organization");
  assert(live.includes("`sms_auto_tax_${attemptId}`"), "tax idempotency uses attempt id");
  assert(
    paymentKey.includes("`sms_auto_pi_${attemptId}`"),
    "payment idempotency uses attempt id",
  );

  console.log("sms replenishment test invocation selfcheck passed");
}

void main();
