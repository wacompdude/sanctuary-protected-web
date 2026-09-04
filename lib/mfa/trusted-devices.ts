import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog, getRequestIpAddress } from "@/lib/audit/log";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import {
  generateTrustedDeviceId,
  generateTrustedDeviceToken,
  hashTrustedDeviceToken,
  parseTrustedDeviceCookieValue,
  trustedDeviceHashesMatch,
} from "@/lib/mfa/trusted-device-crypto";
import {
  MAX_TRUSTED_DEVICES_PER_USER,
  getTrustedDeviceDurationMs,
} from "@/lib/mfa/trusted-device-policy";
import { parseUserAgent } from "@/lib/mfa/user-agent";
import type {
  CreateTrustedDeviceResult,
  TrustedDeviceListItem,
  TrustedDeviceRecord,
  TrustedDeviceValidationResult,
} from "@/lib/mfa/types";

const DEVICE_COLUMNS =
  "id, user_id, device_id, device_name, device_type, browser, operating_system, first_trusted_at, last_used_at, expires_at, revoked_at, created_at, updated_at";

type TrustedDeviceRow = {
  id: string;
  user_id: string;
  device_id: string;
  token_hash?: string;
  device_name: string | null;
  device_type: string | null;
  browser: string | null;
  operating_system: string | null;
  first_trusted_at: string;
  last_used_at: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

function mapDevice(row: TrustedDeviceRow): TrustedDeviceRecord {
  return {
    id: row.id,
    userId: row.user_id,
    deviceId: row.device_id,
    deviceName: row.device_name,
    deviceType: row.device_type,
    browser: row.browser,
    operatingSystem: row.operating_system,
    firstTrustedAt: row.first_trusted_at,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function auditTrustedDevice(input: {
  userId: string;
  action: (typeof AuditAction)[keyof typeof AuditAction];
  deviceId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const supabase = await createClient();
    await writeAuditLog(supabase, {
      userId: input.userId,
      action: input.action,
      entityType: AuditEntityType.TRUSTED_DEVICE,
      entityId: input.deviceId ?? input.userId,
      ipAddress: await getRequestIpAddress(),
      metadata: input.metadata ?? null,
    });
  } catch {
    // Audit must never block sign-in.
  }
}

async function syncTrustedDeviceEnabledFlag(userId: string): Promise<void> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("trusted_devices")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString());

  await admin
    .from("user_security_settings")
    .update({ trusted_device_enabled: (count ?? 0) > 0 })
    .eq("user_id", userId);
}

async function revokeOldestActiveDevices(userId: string): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("trusted_devices")
    .select("id")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("last_used_at", { ascending: true });

  const rows = (data ?? []) as Array<{ id: string }>;
  const overflow = rows.length - (MAX_TRUSTED_DEVICES_PER_USER - 1);
  if (overflow <= 0) return;

  const ids = rows.slice(0, overflow).map((row) => row.id);
  await admin
    .from("trusted_devices")
    .update({ revoked_at: new Date().toISOString() })
    .in("id", ids);
}

export async function createTrustedDevice(input: {
  userId: string;
  userAgent?: string | null;
}): Promise<CreateTrustedDeviceResult> {
  const parsed = parseUserAgent(input.userAgent);
  const deviceId = generateTrustedDeviceId();
  const token = generateTrustedDeviceToken();
  const tokenHash = hashTrustedDeviceToken(deviceId, token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + getTrustedDeviceDurationMs());

  try {
    await revokeOldestActiveDevices(input.userId);
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("trusted_devices")
      .insert({
        user_id: input.userId,
        device_id: deviceId,
        token_hash: tokenHash,
        device_name: parsed.deviceName,
        device_type: parsed.deviceType,
        browser: parsed.browser,
        operating_system: parsed.operatingSystem,
        first_trusted_at: now.toISOString(),
        last_used_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      })
      .select(DEVICE_COLUMNS)
      .single();

    if (error || !data) {
      const message = error?.message ?? "Unable to trust this device.";
      console.error("trusted_devices insert failed:", message);
      return { ok: false, error: message };
    }

    await admin
      .from("user_security_settings")
      .update({ trusted_device_enabled: true })
      .eq("user_id", input.userId);

    const device = mapDevice(data as TrustedDeviceRow);
    await auditTrustedDevice({
      userId: input.userId,
      action: AuditAction.TRUSTED_DEVICE_CREATED,
      deviceId: device.id,
      metadata: {
        browser: device.browser,
        operating_system: device.operatingSystem,
        device_type: device.deviceType,
      },
    });

    return { ok: true, device, token };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Unable to trust this device.",
    };
  }
}

export async function validateTrustedDevice(input: {
  userId: string;
  cookieValue: string | undefined;
}): Promise<TrustedDeviceValidationResult> {
  const parts = parseTrustedDeviceCookieValue(input.cookieValue);
  if (!input.cookieValue?.trim()) {
    return { ok: false, reason: "missing" };
  }
  if (!parts) {
    return { ok: false, reason: "malformed" };
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("trusted_devices")
      .select(`${DEVICE_COLUMNS}, token_hash`)
      .eq("device_id", parts.deviceId)
      .maybeSingle();

    if (error) {
      return { ok: false, reason: "error" };
    }
    if (!data) {
      return { ok: false, reason: "not_found" };
    }

    const row = data as TrustedDeviceRow;
    if (row.user_id !== input.userId) {
      return { ok: false, reason: "wrong_user" };
    }
    if (row.revoked_at) {
      return { ok: false, reason: "revoked" };
    }
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      return { ok: false, reason: "expired" };
    }

    const expected = hashTrustedDeviceToken(parts.deviceId, parts.token);
    if (!row.token_hash || !trustedDeviceHashesMatch(row.token_hash, expected)) {
      return { ok: false, reason: "hash_mismatch" };
    }

    return { ok: true, device: mapDevice(row) };
  } catch {
    return { ok: false, reason: "error" };
  }
}

export async function updateTrustedDeviceLastUsed(deviceRecordId: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("trusted_devices")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", deviceRecordId)
    .is("revoked_at", null);
}

export async function revokeTrustedDevice(input: {
  userId: string;
  deviceRecordId: string;
  reason?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("trusted_devices")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", input.deviceRecordId)
    .eq("user_id", input.userId)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data) {
    return { ok: false, error: "That trusted device was not found." };
  }

  await syncTrustedDeviceEnabledFlag(input.userId);
  await auditTrustedDevice({
    userId: input.userId,
    action: AuditAction.TRUSTED_DEVICE_REVOKED,
    deviceId: input.deviceRecordId,
    metadata: { reason: input.reason ?? "manual" },
  });
  return { ok: true };
}

export async function revokeAllTrustedDevices(
  userId: string,
  reason = "revoke_all",
): Promise<{ ok: boolean; revokedCount: number; error?: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("trusted_devices")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("revoked_at", null)
    .select("id");

  if (error) {
    return { ok: false, revokedCount: 0, error: error.message };
  }

  const revokedCount = (data ?? []).length;
  await admin
    .from("user_security_settings")
    .update({ trusted_device_enabled: false })
    .eq("user_id", userId);

  await auditTrustedDevice({
    userId,
    action: AuditAction.ALL_TRUSTED_DEVICES_REVOKED,
    metadata: { reason, revoked_count: revokedCount },
  });

  return { ok: true, revokedCount };
}

export async function getTrustedDevices(
  userId: string,
  currentDeviceId?: string | null,
): Promise<TrustedDeviceListItem[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("trusted_devices")
    .select(DEVICE_COLUMNS)
    .eq("user_id", userId)
    .is("revoked_at", null)
    .order("last_used_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const now = Date.now();
  return ((data ?? []) as TrustedDeviceRow[]).map((row) => {
    const device = mapDevice(row);
    return {
      ...device,
      isCurrent: Boolean(currentDeviceId && device.deviceId === currentDeviceId),
      isExpired: new Date(device.expiresAt).getTime() <= now,
    };
  });
}

export async function getCurrentTrustedDeviceId(
  cookieValue: string | undefined,
): Promise<string | null> {
  return parseTrustedDeviceCookieValue(cookieValue)?.deviceId ?? null;
}

export async function recordTrustedDeviceValidationFailure(input: {
  userId: string;
  reason: "malformed" | "not_found" | "wrong_user" | "hash_mismatch" | "revoked" | "expired" | "error";
}): Promise<void> {
  const action =
    input.reason === "expired"
      ? AuditAction.TRUSTED_DEVICE_EXPIRED
      : AuditAction.TRUSTED_DEVICE_VALIDATION_FAILED;
  await auditTrustedDevice({
    userId: input.userId,
    action,
    metadata: { result: input.reason },
  });
}

export async function recordDeviceVerificationRequired(userId: string): Promise<void> {
  await auditTrustedDevice({
    userId,
    action: AuditAction.DEVICE_VERIFICATION_REQUIRED,
  });
}

export async function recordDeviceVerificationSucceeded(
  userId: string,
  trusted: boolean,
): Promise<void> {
  await auditTrustedDevice({
    userId,
    action: AuditAction.DEVICE_VERIFICATION_SUCCEEDED,
    metadata: { trusted_device_registered: trusted },
  });
}

export async function recordTrustedDeviceUsed(input: {
  userId: string;
  deviceRecordId: string;
  browser?: string | null;
  operatingSystem?: string | null;
}): Promise<void> {
  await auditTrustedDevice({
    userId: input.userId,
    action: AuditAction.TRUSTED_DEVICE_USED,
    deviceId: input.deviceRecordId,
    metadata: {
      browser: input.browser,
      operating_system: input.operatingSystem,
    },
  });
}
