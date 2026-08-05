import { requirePlatformAdminClient } from "@/lib/platform/queries";

async function readActiveLockRow(organizationId: string) {
  const admin = requirePlatformAdminClient();
  const { data, error } = await admin
    .from("demo_organization_restore_locks")
    .select(
      "id, organization_id, operation_id, status, locked_by_platform_account_id, locked_at, expires_at",
    )
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    if (/demo_organization_restore_locks|schema cache|does not exist/i.test(
      error.message,
    )) {
      return null;
    }
    throw error;
  }
  return data;
}

/**
 * If an active lock is past expires_at, mark it expired and clear org flags.
 * Returns the expired lock id when a change was made.
 */
export async function expireStaleRestoreLockIfNeeded(
  organizationId: string,
): Promise<{ expired: boolean; lockId?: string; expiresAt?: string }> {
  const lock = await readActiveLockRow(organizationId);
  if (!lock) {
    return { expired: false };
  }

  const expiresAt = String(lock.expires_at);
  if (new Date(expiresAt).getTime() > Date.now()) {
    return { expired: false, lockId: String(lock.id), expiresAt };
  }

  const admin = requirePlatformAdminClient();
  await admin
    .from("demo_organization_restore_locks")
    .update({ status: "expired" })
    .eq("id", lock.id)
    .eq("status", "active");

  await admin
    .from("organizations")
    .update({
      demo_restore_locked: false,
      demo_maintenance_mode: false,
    })
    .eq("id", organizationId);

  return {
    expired: true,
    lockId: String(lock.id),
    expiresAt,
  };
}

/** Scan all active locks and expire those past TTL. */
export async function expireAllStaleRestoreLocks(): Promise<
  Array<{ organizationId: string; lockId: string }>
> {
  const admin = requirePlatformAdminClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await admin
    .from("demo_organization_restore_locks")
    .select("id, organization_id, expires_at")
    .eq("status", "active")
    .lt("expires_at", nowIso);

  if (error) {
    if (/demo_organization_restore_locks|does not exist|schema cache/i.test(
      error.message,
    )) {
      return [];
    }
    throw error;
  }

  const expired: Array<{ organizationId: string; lockId: string }> = [];
  for (const row of data ?? []) {
    const organizationId = String(row.organization_id);
    const lockId = String(row.id);
    await admin
      .from("demo_organization_restore_locks")
      .update({ status: "expired" })
      .eq("id", lockId)
      .eq("status", "active");
    await admin
      .from("organizations")
      .update({
        demo_restore_locked: false,
        demo_maintenance_mode: false,
      })
      .eq("id", organizationId);
    expired.push({ organizationId, lockId });
  }
  return expired;
}

export async function emergencyClearRestoreLock(params: {
  organizationId: string;
}): Promise<void> {
  const admin = requirePlatformAdminClient();
  await admin
    .from("demo_organization_restore_locks")
    .update({ status: "emergency_cleared" })
    .eq("organization_id", params.organizationId)
    .eq("status", "active");

  await admin
    .from("organizations")
    .update({
      demo_restore_locked: false,
      demo_maintenance_mode: false,
    })
    .eq("id", params.organizationId);
}
