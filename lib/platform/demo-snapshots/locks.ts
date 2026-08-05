import { requirePlatformAdminClient } from "@/lib/platform/queries";

const DEFAULT_LOCK_TTL_MINUTES = 60;

export async function getActiveRestoreLock(organizationId: string) {
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
    if (/demo_organization_restore_locks|schema cache|does not exist/i.test(error.message)) {
      return null;
    }
    throw error;
  }
  return data;
}

export async function acquireRestoreLock(params: {
  organizationId: string;
  platformAccountId: string;
  operationId?: string | null;
  ttlMinutes?: number;
}): Promise<{ id: string }> {
  const admin = requirePlatformAdminClient();
  const ttl = params.ttlMinutes ?? DEFAULT_LOCK_TTL_MINUTES;
  const expiresAt = new Date(Date.now() + ttl * 60_000).toISOString();

  const existing = await getActiveRestoreLock(params.organizationId);
  if (existing) {
    throw new Error("A restore lock is already active for this demo church.");
  }

  const { data, error } = await admin
    .from("demo_organization_restore_locks")
    .insert({
      organization_id: params.organizationId,
      operation_id: params.operationId ?? null,
      status: "active",
      locked_by_platform_account_id: params.platformAccountId,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Unable to acquire restore lock.");
  }

  await admin
    .from("organizations")
    .update({
      demo_restore_locked: true,
      demo_maintenance_mode: true,
    })
    .eq("id", params.organizationId);

  return { id: String(data.id) };
}

export async function releaseRestoreLock(params: {
  organizationId: string;
  status?: "released" | "expired" | "emergency_cleared";
}): Promise<void> {
  const admin = requirePlatformAdminClient();
  const status = params.status ?? "released";

  await admin
    .from("demo_organization_restore_locks")
    .update({ status })
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
