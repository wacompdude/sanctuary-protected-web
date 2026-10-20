/**
 * Trusted server wrapper for administrative purchased Application SMS credit adjustments.
 * Does not send SMS, call Stripe, or invoke automatic replenishment.
 * Call only from service-role / Platform admin paths — the RPC itself is service_role-only.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";

export type AdjustApplicationSmsPurchasedCreditsInput = {
  organizationId: string;
  /** Signed purchased-credit change: positive credits, negative debits. */
  deltaSegments: number;
  idempotencyKey: string;
  note?: string | null;
  actorUserId?: string | null;
  actorPlatformAccountId?: string | null;
  metadata?: Record<string, unknown>;
};

export type AdjustApplicationSmsPurchasedCreditsResult = {
  ok: boolean;
  outcome: string;
  duplicate: boolean;
  balance: number;
  reserved: number;
  available: number;
  adjustedSegments: number;
  ledgerId: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function parseAdjustApplicationSmsPurchasedCreditsResult(
  value: unknown,
): AdjustApplicationSmsPurchasedCreditsResult {
  const row = asRecord(value);
  return {
    ok: row.ok === true,
    outcome: String(row.outcome ?? "unavailable"),
    duplicate: row.duplicate === true,
    balance: Number(row.balance ?? 0),
    reserved: Number(row.reserved ?? 0),
    available: Number(row.available ?? 0),
    adjustedSegments: Number(row.adjusted_segments ?? 0),
    ledgerId: typeof row.ledger_id === "string" ? row.ledger_id : null,
  };
}

/**
 * Applies one auditable purchased-credit adjustment through the database RPC.
 * Requires the service-role Supabase client boundary.
 */
export async function adjustApplicationSmsPurchasedCredits(
  input: AdjustApplicationSmsPurchasedCreditsInput,
  options?: { supabase?: SupabaseClient },
): Promise<AdjustApplicationSmsPurchasedCreditsResult> {
  if (!isServiceRoleConfigured() && !options?.supabase) {
    return {
      ok: false,
      outcome: "unavailable",
      duplicate: false,
      balance: 0,
      reserved: 0,
      available: 0,
      adjustedSegments: 0,
      ledgerId: null,
    };
  }

  const admin = options?.supabase ?? createAdminClient();
  const { data, error } = await admin.rpc("adjust_application_sms_purchased_credits", {
    p_organization_id: input.organizationId,
    p_delta_segments: input.deltaSegments,
    p_idempotency_key: input.idempotencyKey,
    p_note: input.note ?? null,
    p_actor_user_id: input.actorUserId ?? null,
    p_actor_platform_account_id: input.actorPlatformAccountId ?? null,
    p_metadata: input.metadata ?? {},
  });

  if (error) {
    throw new Error(error.message);
  }
  return parseAdjustApplicationSmsPurchasedCreditsResult(data);
}
