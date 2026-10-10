import type { SupabaseClient } from "@supabase/supabase-js";
import type { SmsCapacityResult } from "@/lib/sms/sms-capacity";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

export function parseSmsCapacityResult(value: unknown): SmsCapacityResult {
  const row = asRecord(value);
  const outcome = String(row.outcome ?? "conflict") as SmsCapacityResult["outcome"];
  return {
    ok: row.ok === true,
    outcome,
    requestedSegments: Number(row.requested_segments ?? 0),
    includedSegments: Number(row.included_segments ?? 0),
    purchasedSegments: Number(row.purchased_segments ?? 0),
    duplicate: row.duplicate === true,
    sendAllowed:
      typeof row.send_allowed === "boolean" ? row.send_allowed : undefined,
  };
}

async function callSmsCapacityRpc(
  admin: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<SmsCapacityResult> {
  const { data, error } = await admin.rpc(fn, args);
  if (error) {
    throw new Error(error.message);
  }
  return parseSmsCapacityResult(data);
}

export function reserveApplicationSmsSegments(
  admin: SupabaseClient,
  params: { organizationId: string; deliveryId: string; segments: number },
): Promise<SmsCapacityResult> {
  return callSmsCapacityRpc(admin, "reserve_application_sms_segments", {
    p_organization_id: params.organizationId,
    p_delivery_id: params.deliveryId,
    p_segments: params.segments,
  });
}

export function commitApplicationSmsSegments(
  admin: SupabaseClient,
  params: { organizationId: string; deliveryId: string },
): Promise<SmsCapacityResult> {
  return callSmsCapacityRpc(admin, "commit_application_sms_segments", {
    p_organization_id: params.organizationId,
    p_delivery_id: params.deliveryId,
  });
}

export function releaseApplicationSmsSegments(
  admin: SupabaseClient,
  params: { organizationId: string; deliveryId: string },
): Promise<SmsCapacityResult> {
  return callSmsCapacityRpc(admin, "release_application_sms_segments", {
    p_organization_id: params.organizationId,
    p_delivery_id: params.deliveryId,
  });
}

export function markApplicationSmsSendStarted(
  admin: SupabaseClient,
  params: { organizationId: string; deliveryId: string },
): Promise<SmsCapacityResult> {
  return callSmsCapacityRpc(admin, "mark_application_sms_send_started", {
    p_organization_id: params.organizationId,
    p_delivery_id: params.deliveryId,
  });
}
