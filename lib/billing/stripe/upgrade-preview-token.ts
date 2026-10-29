/**
 * Server-signed upgrade preview authorization.
 * The browser may carry the opaque token but never the signing secret or
 * monetary amounts as authority for confirmation.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { BillingConfigurationError, BillingUpgradeError } from "@/lib/billing/errors";
import {
  readBillingUpgradePreviewSigningSecret,
} from "@/lib/billing/stripe/config";
import type { PlanKey } from "@/lib/subscriptions/plan-keys";

/** Short-lived preview authorization window (15 minutes). */
export const UPGRADE_PREVIEW_AUTHORIZATION_TTL_SECONDS = 15 * 60;

export const UPGRADE_PREVIEW_STALE_MESSAGE =
  "The subscription changed after the upgrade preview. Please review a new upgrade preview before continuing.";

export type UpgradePreviewAuthorizationClaims = {
  v: 1;
  organizationId: string;
  subscriptionId: string;
  baseItemId: string;
  fromPlan: PlanKey;
  toPlan: PlanKey;
  periodEndUnix: number;
  prorationDateUnix: number;
  automaticTax: boolean;
  targetPriceId: string;
  exp: number;
};

function base64UrlEncode(value: string | Buffer): string {
  const buf = typeof value === "string" ? Buffer.from(value, "utf8") : value;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecodeToString(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64").toString("utf8");
}

function requireSigningSecret(secret?: string | null): string {
  const key = (secret ?? readBillingUpgradePreviewSigningSecret()).trim();
  if (key.length < 32) {
    throw new BillingConfigurationError(
      "BILLING_UPGRADE_PREVIEW_SIGNING_SECRET is missing or too short.",
    );
  }
  return key;
}

function signBody(body: string, secret: string): string {
  return base64UrlEncode(createHmac("sha256", secret).update(body).digest());
}

function safeEqualUtf8(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function signUpgradePreviewAuthorization(
  claims: Omit<UpgradePreviewAuthorizationClaims, "v" | "exp"> & {
    nowUnix?: number;
    ttlSeconds?: number;
  },
  secret?: string | null,
): string {
  const signingSecret = requireSigningSecret(secret);
  const nowUnix = claims.nowUnix ?? Math.floor(Date.now() / 1000);
  const ttl = claims.ttlSeconds ?? UPGRADE_PREVIEW_AUTHORIZATION_TTL_SECONDS;
  const payload: UpgradePreviewAuthorizationClaims = {
    v: 1,
    organizationId: claims.organizationId,
    subscriptionId: claims.subscriptionId,
    baseItemId: claims.baseItemId,
    fromPlan: claims.fromPlan,
    toPlan: claims.toPlan,
    periodEndUnix: claims.periodEndUnix,
    prorationDateUnix: claims.prorationDateUnix,
    automaticTax: claims.automaticTax,
    targetPriceId: claims.targetPriceId,
    exp: nowUnix + ttl,
  };
  const body = base64UrlEncode(JSON.stringify(payload));
  const sig = signBody(body, signingSecret);
  return `${body}.${sig}`;
}

export function verifyUpgradePreviewAuthorization(
  token: string | null | undefined,
  expected: {
    organizationId: string;
    nowUnix?: number;
  },
  secret?: string | null,
): UpgradePreviewAuthorizationClaims {
  const raw = typeof token === "string" ? token.trim() : "";
  if (!raw || raw.length > 4096) {
    throw new BillingUpgradeError(UPGRADE_PREVIEW_STALE_MESSAGE);
  }
  const parts = raw.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new BillingUpgradeError(UPGRADE_PREVIEW_STALE_MESSAGE);
  }
  const [body, sig] = parts;
  const signingSecret = requireSigningSecret(secret);
  const expectedSig = signBody(body, signingSecret);
  if (!safeEqualUtf8(sig, expectedSig)) {
    throw new BillingUpgradeError(UPGRADE_PREVIEW_STALE_MESSAGE);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(base64UrlDecodeToString(body));
  } catch {
    throw new BillingUpgradeError(UPGRADE_PREVIEW_STALE_MESSAGE);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new BillingUpgradeError(UPGRADE_PREVIEW_STALE_MESSAGE);
  }
  const claims = parsed as Partial<UpgradePreviewAuthorizationClaims>;
  if (claims.v !== 1) {
    throw new BillingUpgradeError(UPGRADE_PREVIEW_STALE_MESSAGE);
  }
  if (claims.organizationId !== expected.organizationId) {
    throw new BillingUpgradeError(UPGRADE_PREVIEW_STALE_MESSAGE);
  }
  const nowUnix = expected.nowUnix ?? Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || !Number.isInteger(claims.exp) || claims.exp < nowUnix) {
    throw new BillingUpgradeError(UPGRADE_PREVIEW_STALE_MESSAGE);
  }
  if (
    typeof claims.subscriptionId !== "string" ||
    typeof claims.baseItemId !== "string" ||
    typeof claims.fromPlan !== "string" ||
    typeof claims.toPlan !== "string" ||
    typeof claims.targetPriceId !== "string" ||
    typeof claims.periodEndUnix !== "number" ||
    typeof claims.prorationDateUnix !== "number" ||
    typeof claims.automaticTax !== "boolean"
  ) {
    throw new BillingUpgradeError(UPGRADE_PREVIEW_STALE_MESSAGE);
  }
  return claims as UpgradePreviewAuthorizationClaims;
}
