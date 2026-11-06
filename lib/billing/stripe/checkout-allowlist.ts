/**
 * Stage 3D Live Checkout organization allowlist.
 * Live subscription Checkout requires the global Live gate AND an active,
 * unexpired platform approval. Missing approval = DENY.
 * Test-mode Checkout is not gated by this allowlist (sandbox only).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { BillingAuthorizationError } from "@/lib/billing/errors";
import { assertStripeCheckoutModeAllowed } from "@/lib/billing/stripe/catalog";
import {
  classifyStripeSecretMode,
  isStripeLiveCheckoutEnabled,
} from "@/lib/billing/stripe/config";

export const CHECKOUT_PILOT_UNAVAILABLE_MESSAGE =
  "Online subscription enrollment is currently available to selected pilot organizations. Please contact Sanctuary Protected for assistance.";

export const CHECKOUT_PILOT_GATE_DISABLED_MESSAGE =
  "Checkout is not available yet for this environment.";

export type CheckoutApprovalStatus = "active" | "inactive" | "revoked";

export type CheckoutApprovalRecord = {
  organizationId: string;
  status: CheckoutApprovalStatus;
  approvedAt: string | null;
  approvedByPlatformAccountId: string | null;
  expiresAt: string | null;
  notes: string | null;
  revokedAt: string | null;
  revokedByPlatformAccountId: string | null;
  updatedAt: string | null;
};

export type CheckoutApprovalDecision =
  | { ok: true; reason: "active_unexpired" }
  | {
      ok: false;
      reason:
        | "missing"
        | "inactive"
        | "revoked"
        | "expired"
        | "invalid_organization"
        | "invalid_record";
    };

export type LiveCheckoutAuthorizationDecision =
  | { ok: true; mode: "test" | "live"; approvalReason?: "active_unexpired" }
  | {
      ok: false;
      mode: "test" | "live" | "unknown" | null;
      reason:
        | "live_gate_disabled"
        | "unknown_secret"
        | "missing_approval"
        | "inactive_approval"
        | "revoked_approval"
        | "expired_approval"
        | "invalid_organization"
        | "invalid_approval_record";
      message: string;
    };

function normalizeOrgId(organizationId: string | null | undefined): string {
  return String(organizationId ?? "").trim();
}

function parseExpiry(
  expiresAt: string | Date | null | undefined,
): Date | null {
  if (expiresAt == null || expiresAt === "") return null;
  const end =
    expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (Number.isNaN(end.getTime())) return null;
  return end;
}

/**
 * Pure approval evaluation. Missing/invalid records fail closed.
 */
export function evaluateCheckoutApproval(
  record: CheckoutApprovalRecord | null | undefined,
  now: Date = new Date(),
): CheckoutApprovalDecision {
  if (!record) return { ok: false, reason: "missing" };
  const orgId = normalizeOrgId(record.organizationId);
  if (!orgId) return { ok: false, reason: "invalid_organization" };

  if (record.status === "revoked") return { ok: false, reason: "revoked" };
  if (record.status === "inactive") return { ok: false, reason: "inactive" };
  if (record.status !== "active") return { ok: false, reason: "invalid_record" };
  if (!record.approvedAt) return { ok: false, reason: "invalid_record" };

  if (record.expiresAt != null && record.expiresAt !== "") {
    const end = parseExpiry(record.expiresAt);
    if (!end) return { ok: false, reason: "invalid_record" };
    if (now.getTime() > end.getTime()) return { ok: false, reason: "expired" };
  }

  return { ok: true, reason: "active_unexpired" };
}

export function mapCheckoutApprovalRow(
  row: Record<string, unknown> | null | undefined,
): CheckoutApprovalRecord | null {
  if (!row) return null;
  const organizationId = normalizeOrgId(
    typeof row.organization_id === "string" ? row.organization_id : null,
  );
  if (!organizationId) return null;
  const status = String(row.status ?? "").trim();
  if (status !== "active" && status !== "inactive" && status !== "revoked") {
    return null;
  }
  return {
    organizationId,
    status,
    approvedAt:
      typeof row.approved_at === "string" ? row.approved_at : null,
    approvedByPlatformAccountId:
      typeof row.approved_by_platform_account_id === "string"
        ? row.approved_by_platform_account_id
        : null,
    expiresAt: typeof row.expires_at === "string" ? row.expires_at : null,
    notes: typeof row.notes === "string" ? row.notes : null,
    revokedAt: typeof row.revoked_at === "string" ? row.revoked_at : null,
    revokedByPlatformAccountId:
      typeof row.revoked_by_platform_account_id === "string"
        ? row.revoked_by_platform_account_id
        : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

export async function loadOrganizationCheckoutApproval(
  organizationId: string,
): Promise<CheckoutApprovalRecord | null> {
  const orgId = normalizeOrgId(organizationId);
  if (!orgId) return null;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("organization_checkout_approvals")
    .select(
      "organization_id, status, approved_at, approved_by_platform_account_id, expires_at, notes, revoked_at, revoked_by_platform_account_id, updated_at",
    )
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) {
    // Fail closed: treat load errors as missing approval.
    console.error("loadOrganizationCheckoutApproval failed:", error.message);
    return null;
  }
  return mapCheckoutApprovalRow(data as Record<string, unknown> | null);
}

/**
 * Combine global Live Checkout gate + organization allowlist.
 * Call immediately before Stripe Checkout Session creation for subscriptions.
 * Does not apply to Test-mode secrets.
 */
export function evaluateLiveSubscriptionCheckoutAuthorization(input: {
  organizationId: string;
  secretKey: string | null | undefined;
  approval: CheckoutApprovalRecord | null | undefined;
  now?: Date;
  /** Client-supplied flags must never grant access. */
  clientClaimsApproved?: unknown;
}): LiveCheckoutAuthorizationDecision {
  // Explicitly ignore forged client approval claims.
  void input.clientClaimsApproved;

  const orgId = normalizeOrgId(input.organizationId);
  if (!orgId) {
    return {
      ok: false,
      mode: null,
      reason: "invalid_organization",
      message: CHECKOUT_PILOT_UNAVAILABLE_MESSAGE,
    };
  }

  const mode = classifyStripeSecretMode(input.secretKey);
  if (mode === "unknown") {
    return {
      ok: false,
      mode: "unknown",
      reason: "unknown_secret",
      message: CHECKOUT_PILOT_GATE_DISABLED_MESSAGE,
    };
  }

  if (mode === "test") {
    return { ok: true, mode: "test" };
  }

  // Live path: global gate AND allowlist.
  if (!isStripeLiveCheckoutEnabled()) {
    return {
      ok: false,
      mode: "live",
      reason: "live_gate_disabled",
      message: CHECKOUT_PILOT_GATE_DISABLED_MESSAGE,
    };
  }

  const decision = evaluateCheckoutApproval(input.approval, input.now ?? new Date());
  if (decision.ok) {
    return { ok: true, mode: "live", approvalReason: "active_unexpired" };
  }

  const reasonMap = {
    missing: "missing_approval",
    inactive: "inactive_approval",
    revoked: "revoked_approval",
    expired: "expired_approval",
    invalid_organization: "invalid_organization",
    invalid_record: "invalid_approval_record",
  } as const;

  return {
    ok: false,
    mode: "live",
    reason: reasonMap[decision.reason],
    message: CHECKOUT_PILOT_UNAVAILABLE_MESSAGE,
  };
}

export type LoadCheckoutApprovalFn = (
  organizationId: string,
) => Promise<CheckoutApprovalRecord | null>;

/**
 * Authoritative Live subscription Checkout guard used at Session creation.
 * Re-loads approval from the database (revocation races are honored).
 */
export async function assertLiveSubscriptionCheckoutAllowed(input: {
  organizationId: string;
  secretKey: string | null | undefined;
  now?: Date;
  /** Injectable for self-checks. Production omits this and loads from DB. */
  loadApproval?: LoadCheckoutApprovalFn;
  context?: string;
}): Promise<"test" | "live"> {
  // Keep existing mode-gate throw semantics for unknown/live-disabled.
  const mode = assertStripeCheckoutModeAllowed(
    input.secretKey,
    input.context ?? "Live subscription Checkout",
  );

  if (mode === "test") return "test";

  const loader = input.loadApproval ?? loadOrganizationCheckoutApproval;
  const approval = await loader(input.organizationId);
  const decision = evaluateLiveSubscriptionCheckoutAuthorization({
    organizationId: input.organizationId,
    secretKey: input.secretKey,
    approval,
    now: input.now,
  });

  if (!decision.ok) {
    throw new BillingAuthorizationError(decision.message);
  }
  return "live";
}

/** UI helper: whether the org may show a working Live Checkout CTA. */
export function isLiveCheckoutUiAvailable(input: {
  stripeConfigured: boolean;
  liveCheckoutGateEnabled: boolean;
  organizationApproved: boolean;
  secretIsTest: boolean;
}): boolean {
  if (!input.stripeConfigured) return false;
  if (input.secretIsTest) return true;
  return input.liveCheckoutGateEnabled && input.organizationApproved;
}
