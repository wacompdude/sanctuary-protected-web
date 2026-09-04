import { createAdminClient } from "@/lib/supabase/admin";

export type PlatformSecuritySettings = {
  mfaEnabled: boolean;
  mfaReauthAfter: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type OrganizationSecuritySettings = {
  organizationId: string;
  mfaEnabled: boolean;
  mfaReauthAfter: string | null;
  updatedAt: string;
};

const PLATFORM_SELECT =
  "mfa_enabled, mfa_reauth_after, updated_at, updated_by";
const ORGANIZATION_SELECT =
  "organization_id, mfa_enabled, mfa_reauth_after, updated_at";

function mapPlatform(row: {
  mfa_enabled?: boolean | null;
  mfa_reauth_after?: string | null;
  updated_at?: string | null;
  updated_by?: string | null;
}): PlatformSecuritySettings {
  return {
    mfaEnabled: row.mfa_enabled !== false,
    mfaReauthAfter: row.mfa_reauth_after ?? null,
    updatedAt: row.updated_at ?? null,
    updatedBy: row.updated_by ?? null,
  };
}

function mapOrganization(
  organizationId: string,
  row: {
    organization_id?: string;
    mfa_enabled?: boolean | null;
    mfa_reauth_after?: string | null;
    updated_at?: string;
  },
): OrganizationSecuritySettings {
  return {
    organizationId: row.organization_id ?? organizationId,
    mfaEnabled: row.mfa_enabled !== false,
    mfaReauthAfter: row.mfa_reauth_after ?? null,
    updatedAt: row.updated_at ?? new Date().toISOString(),
  };
}

const missingPlatform: PlatformSecuritySettings = {
  mfaEnabled: true,
  mfaReauthAfter: null,
  updatedAt: null,
  updatedBy: null,
};

function missingOrganization(organizationId: string): OrganizationSecuritySettings {
  return {
    organizationId,
    mfaEnabled: true,
    mfaReauthAfter: null,
    updatedAt: new Date().toISOString(),
  };
}

export async function getPlatformSecuritySettings(): Promise<PlatformSecuritySettings> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("platform_security_settings")
    .select(PLATFORM_SELECT)
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    if (isMissingPolicyTable(error.message) || isMissingReauthColumn(error.message)) {
      return missingPlatform;
    }
    throw new Error(error.message);
  }

  if (!data) {
    const { data: created, error: insertError } = await admin
      .from("platform_security_settings")
      .insert({ id: 1, mfa_enabled: true })
      .select(PLATFORM_SELECT)
      .single();
    if (insertError || !created) return missingPlatform;
    return mapPlatform(created);
  }

  return mapPlatform(data);
}

export async function setPlatformMfaEnabled(input: {
  enabled: boolean;
  actorUserId: string;
}): Promise<PlatformSecuritySettings> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("platform_security_settings")
    .upsert(
      {
        id: 1,
        mfa_enabled: input.enabled,
        updated_by: input.actorUserId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    )
    .select(PLATFORM_SELECT)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to update platform MFA policy.");
  }

  return mapPlatform(data);
}

export async function setPlatformMfaReauthAfter(input: {
  actorUserId: string;
  at?: Date;
}): Promise<PlatformSecuritySettings> {
  const admin = createAdminClient();
  const at = (input.at ?? new Date()).toISOString();
  const { data, error } = await admin
    .from("platform_security_settings")
    .update({
      mfa_reauth_after: at,
      updated_by: input.actorUserId,
      updated_at: at,
    })
    .eq("id", 1)
    .select(PLATFORM_SELECT)
    .single();

  if (error || !data) {
    throw new Error(
      error?.message ?? "Unable to require MFA immediately. Apply migration 092.",
    );
  }

  return mapPlatform(data);
}

export async function getOrganizationSecuritySettings(
  organizationId: string,
): Promise<OrganizationSecuritySettings> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("organization_security_settings")
    .select(ORGANIZATION_SELECT)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    if (isMissingPolicyTable(error.message) || isMissingReauthColumn(error.message)) {
      return missingOrganization(organizationId);
    }
    throw new Error(error.message);
  }

  if (!data) {
    const { data: created, error: insertError } = await admin
      .from("organization_security_settings")
      .insert({ organization_id: organizationId, mfa_enabled: true })
      .select(ORGANIZATION_SELECT)
      .single();
    if (insertError || !created) return missingOrganization(organizationId);
    return mapOrganization(organizationId, created);
  }

  return mapOrganization(organizationId, data);
}

export async function listOrganizationSecuritySettings(
  organizationIds: string[],
): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  if (organizationIds.length === 0) return result;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("organization_security_settings")
    .select("organization_id, mfa_enabled")
    .in("organization_id", organizationIds);

  if (error) {
    if (isMissingPolicyTable(error.message)) {
      for (const id of organizationIds) result.set(id, true);
      return result;
    }
    throw new Error(error.message);
  }

  for (const id of organizationIds) result.set(id, true);
  for (const row of data ?? []) {
    result.set(String(row.organization_id), row.mfa_enabled !== false);
  }
  return result;
}

export async function setOrganizationMfaEnabled(input: {
  organizationId: string;
  enabled: boolean;
}): Promise<OrganizationSecuritySettings> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("organization_security_settings")
    .upsert(
      {
        organization_id: input.organizationId,
        mfa_enabled: input.enabled,
      },
      { onConflict: "organization_id" },
    )
    .select(ORGANIZATION_SELECT)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to update organization MFA policy.");
  }

  return mapOrganization(input.organizationId, data);
}

export async function setOrganizationMfaReauthAfter(input: {
  organizationId: string;
  at?: Date;
}): Promise<OrganizationSecuritySettings> {
  const admin = createAdminClient();
  const at = (input.at ?? new Date()).toISOString();
  await getOrganizationSecuritySettings(input.organizationId);
  const { data, error } = await admin
    .from("organization_security_settings")
    .update({ mfa_reauth_after: at })
    .eq("organization_id", input.organizationId)
    .select(ORGANIZATION_SELECT)
    .single();

  if (error || !data) {
    throw new Error(
      error?.message ?? "Unable to require MFA immediately. Apply migration 092.",
    );
  }

  return mapOrganization(input.organizationId, data);
}

export function isMissingPolicyTable(message: string): boolean {
  return /platform_security_settings|organization_security_settings|PGRST205|42P01|does not exist|schema cache/i.test(
    message,
  );
}

export function isMissingReauthColumn(message: string): boolean {
  return /mfa_reauth_after/i.test(message);
}

export function timestampToMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}
