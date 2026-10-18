/**
 * TEMPORARY CONTROLLED BILLING TEST ROUTE
 *
 * Remove immediately after Phase 5C-3C-2E-2.
 * This decides whether one POST may call the existing orchestrator.
 * It does not claim, calculate tax, charge, grant credits, or send SMS.
 */

import { timingSafeEqual } from "node:crypto";

export const SMS_REPLENISHMENT_TEST_ORGANIZATION_ID =
  "a5246f30-84dc-4f8e-b27f-03390e8cadbe";

export const SMS_REPLENISHMENT_TEST_GATE = "SMS_REPLENISHMENT_TEST_ENABLED";
export const SMS_REPLENISHMENT_TEST_SECRET_ENV = "SMS_REPLENISHMENT_TEST_SECRET";

const OUTCOME = /^[a-z0-9_]{1,64}$/;
const ATTEMPT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SmsReplenishmentTestOrchestratorResult = {
  outcome: string;
  attemptId: string | null;
  grantsCredits: false;
};

export type SmsReplenishmentTestDeps = {
  env: NodeJS.ProcessEnv;
  countAttempts: () => Promise<number>;
  orchestrate: (
    organizationId: string,
  ) => Promise<SmsReplenishmentTestOrchestratorResult>;
};

function json(status: number, body: Record<string, string | null>): Response {
  return Response.json(body, { status });
}

function disabled(): Response {
  return json(404, { status: "disabled", attemptId: null, outcome: null });
}

function bearerToken(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return "";
  return header.slice(prefix.length).trim();
}

function secretMatches(presented: string, expected: string): boolean {
  const left = Buffer.from(presented);
  const right = Buffer.from(expected);
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function productionRuntime(env: NodeJS.ProcessEnv): boolean {
  return env.VERCEL_ENV === "production";
}

async function bodySelectsParameters(request: Request): Promise<boolean> {
  const text = await request.text();
  if (!text.trim()) return false;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return true;
    return Object.keys(parsed).length > 0;
  } catch {
    return true;
  }
}

function safeAttemptId(value: string | null): string | null {
  return value && ATTEMPT_ID.test(value) ? value : null;
}

function safeOutcome(value: string): string {
  return OUTCOME.test(value) ? value : "unavailable";
}

export async function handleSmsAutoReplenishmentTestRequest(
  request: Request,
  deps: SmsReplenishmentTestDeps,
): Promise<Response> {
  if (request.method !== "POST") {
    return json(405, { status: "method_not_allowed", attemptId: null, outcome: null });
  }

  if (deps.env[SMS_REPLENISHMENT_TEST_GATE] !== "true") {
    return disabled();
  }

  const expectedSecret = deps.env[SMS_REPLENISHMENT_TEST_SECRET_ENV]?.trim() ?? "";
  if (!secretMatches(bearerToken(request), expectedSecret)) {
    return json(401, { status: "unauthorized", attemptId: null, outcome: null });
  }

  if (!productionRuntime(deps.env)) {
    return json(403, { status: "forbidden", attemptId: null, outcome: null });
  }

  if (await bodySelectsParameters(request)) {
    return json(400, { status: "rejected", attemptId: null, outcome: null });
  }

  let existingAttempts = 0;
  try {
    existingAttempts = await deps.countAttempts();
  } catch {
    return json(503, { status: "unavailable", attemptId: null, outcome: null });
  }
  if (!Number.isInteger(existingAttempts) || existingAttempts < 0) {
    return json(503, { status: "unavailable", attemptId: null, outcome: null });
  }
  if (existingAttempts > 0) {
    return json(409, { status: "already_invoked", attemptId: null, outcome: null });
  }

  try {
    const result = await deps.orchestrate(SMS_REPLENISHMENT_TEST_ORGANIZATION_ID);
    return json(200, {
      status: "accepted",
      attemptId: safeAttemptId(result.attemptId),
      outcome: safeOutcome(result.outcome),
    });
  } catch {
    return json(503, { status: "unavailable", attemptId: null, outcome: null });
  }
}
