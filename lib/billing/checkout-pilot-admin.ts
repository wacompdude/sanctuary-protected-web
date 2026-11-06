/**
 * Platform-operated Checkout pilot approval mutations (service-role after auth).
 */

import { writePlatformAdminAction } from "@/lib/platform/audit";
import type { PlatformContext } from "@/lib/platform/types";
import { requirePlatformAdminClient } from "@/lib/platform/queries";
import {
  evaluateCheckoutApproval,
  mapCheckoutApprovalRow,
  type CheckoutApprovalRecord,
} from "@/lib/billing/stripe/checkout-allowlist";

function normalizeOrgId(organizationId: string): string {
  return organizationId.trim();
}

export async function getOrganizationCheckoutApproval(
  organizationId: string,
): Promise<CheckoutApprovalRecord | null> {
  const orgId = normalizeOrgId(organizationId);
  if (!orgId) return null;
  const admin = requirePlatformAdminClient();
  const { data, error } = await admin
    .from("organization_checkout_approvals")
    .select(
      "organization_id, status, approved_at, approved_by_platform_account_id, expires_at, notes, revoked_at, revoked_by_platform_account_id, updated_at",
    )
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return mapCheckoutApprovalRow(data as Record<string, unknown> | null);
}

export async function listCheckoutApprovalEvents(
  organizationId: string,
  limit = 20,
): Promise<
  Array<{
    id: string;
    eventType: string;
    reason: string | null;
    createdAt: string;
    actorPlatformAccountId: string | null;
  }>
> {
  const orgId = normalizeOrgId(organizationId);
  if (!orgId) return [];
  const admin = requirePlatformAdminClient();
  const { data, error } = await admin
    .from("organization_checkout_approval_events")
    .select("id, event_type, reason, created_at, actor_platform_account_id")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(Math.min(50, Math.max(1, limit)));
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    eventType: String(row.event_type),
    reason: typeof row.reason === "string" ? row.reason : null,
    createdAt: String(row.created_at),
    actorPlatformAccountId:
      typeof row.actor_platform_account_id === "string"
        ? row.actor_platform_account_id
        : null,
  }));
}

export async function approveOrganizationCheckoutPilot(params: {
  context: PlatformContext;
  organizationId: string;
  reason: string;
  expiresAt?: string | null;
  notes?: string | null;
}): Promise<{ approval: CheckoutApprovalRecord; message: string }> {
  const reason = params.reason.trim();
  if (reason.length < 8) {
    throw new Error("Approval reason must be at least 8 characters.");
  }
  const orgId = normalizeOrgId(params.organizationId);
  if (!orgId) throw new Error("Organization id is required.");

  let expiresAt: string | null = null;
  if (params.expiresAt != null && String(params.expiresAt).trim()) {
    const end = new Date(String(params.expiresAt).trim());
    if (Number.isNaN(end.getTime())) {
      throw new Error("Expiration must be a valid timestamp.");
    }
    if (end.getTime() <= Date.now()) {
      throw new Error("Expiration must be in the future.");
    }
    expiresAt = end.toISOString();
  }

  const notes =
    params.notes != null && String(params.notes).trim()
      ? String(params.notes).trim().slice(0, 2000)
      : null;

  const admin = requirePlatformAdminClient();
  const { data: church, error: churchError } = await admin
    .from("organizations")
    .select("id, name")
    .eq("id", orgId)
    .maybeSingle();
  if (churchError || !church) {
    throw new Error(churchError?.message || "Organization not found.");
  }

  const nowIso = new Date().toISOString();
  const platformAccountId = params.context.account.id;

  const { data, error } = await admin
    .from("organization_checkout_approvals")
    .upsert(
      {
        organization_id: orgId,
        status: "active",
        approved_at: nowIso,
        approved_by_platform_account_id: platformAccountId,
        expires_at: expiresAt,
        notes,
        revoked_at: null,
        revoked_by_platform_account_id: null,
        updated_at: nowIso,
      },
      { onConflict: "organization_id" },
    )
    .select(
      "organization_id, status, approved_at, approved_by_platform_account_id, expires_at, notes, revoked_at, revoked_by_platform_account_id, updated_at",
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Unable to approve Checkout pilot access.");
  }

  await admin.from("organization_checkout_approval_events").insert({
    organization_id: orgId,
    event_type: "approved",
    actor_platform_account_id: platformAccountId,
    reason,
    metadata: {
      expires_at: expiresAt,
      notes,
      organization_name: church.name,
    },
  });

  await writePlatformAdminAction({
    platformAccountId,
    actorUserId: params.context.user.id,
    action: "billing.checkout_pilot.approve",
    targetType: "organization",
    targetId: orgId,
    organizationId: orgId,
    reason,
    metadata: { expires_at: expiresAt },
  });

  const approval = mapCheckoutApprovalRow(data as Record<string, unknown>);
  if (!approval) throw new Error("Approval mapping failed.");
  return {
    approval,
    message: `Checkout pilot access approved for ${church.name}.`,
  };
}

export async function revokeOrganizationCheckoutPilot(params: {
  context: PlatformContext;
  organizationId: string;
  reason: string;
}): Promise<{ approval: CheckoutApprovalRecord; message: string }> {
  const reason = params.reason.trim();
  if (reason.length < 8) {
    throw new Error("Revocation reason must be at least 8 characters.");
  }
  const orgId = normalizeOrgId(params.organizationId);
  if (!orgId) throw new Error("Organization id is required.");

  const admin = requirePlatformAdminClient();
  const { data: church, error: churchError } = await admin
    .from("organizations")
    .select("id, name")
    .eq("id", orgId)
    .maybeSingle();
  if (churchError || !church) {
    throw new Error(churchError?.message || "Organization not found.");
  }

  const existing = await getOrganizationCheckoutApproval(orgId);
  if (!existing) {
    throw new Error("No Checkout pilot approval exists for this organization.");
  }
  const stillActive = evaluateCheckoutApproval(existing).ok;
  if (!stillActive && existing.status === "revoked") {
    return {
      approval: existing,
      message: "Checkout pilot access is already revoked.",
    };
  }

  const nowIso = new Date().toISOString();
  const platformAccountId = params.context.account.id;
  const { data, error } = await admin
    .from("organization_checkout_approvals")
    .update({
      status: "revoked",
      revoked_at: nowIso,
      revoked_by_platform_account_id: platformAccountId,
      updated_at: nowIso,
    })
    .eq("organization_id", orgId)
    .select(
      "organization_id, status, approved_at, approved_by_platform_account_id, expires_at, notes, revoked_at, revoked_by_platform_account_id, updated_at",
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Unable to revoke Checkout pilot access.");
  }

  await admin.from("organization_checkout_approval_events").insert({
    organization_id: orgId,
    event_type: "revoked",
    actor_platform_account_id: platformAccountId,
    reason,
    metadata: { organization_name: church.name },
  });

  await writePlatformAdminAction({
    platformAccountId,
    actorUserId: params.context.user.id,
    action: "billing.checkout_pilot.revoke",
    targetType: "organization",
    targetId: orgId,
    organizationId: orgId,
    reason,
  });

  const approval = mapCheckoutApprovalRow(data as Record<string, unknown>);
  if (!approval) throw new Error("Approval mapping failed.");
  return {
    approval,
    message: `Checkout pilot access revoked for ${church.name}.`,
  };
}
