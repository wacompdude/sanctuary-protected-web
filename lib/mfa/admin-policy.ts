import {
  describeEffectiveMfaPolicy,
  describeMfaPolicyReason,
  evaluateMfaPolicy,
  type EffectiveMfaPolicy,
} from "@/lib/mfa/effective-policy";
import {
  clampMfaPolicyPage,
  clampMfaPolicyPageSize,
  organizationSearchOrFilter,
  pageWindow,
  type MfaPolicyPageSize,
} from "@/lib/mfa/admin-directory";
import { authorizeMfaPolicyManagement } from "@/lib/mfa/authorize-policy";
import { isMfaEmergencyOverrideActive } from "@/lib/mfa/policy";
import {
  getOrganizationSecuritySettings,
  getPlatformSecuritySettings,
  listOrganizationSecuritySettings,
} from "@/lib/mfa/policy-settings";
import { requirePlatformAdminClient } from "@/lib/platform/queries";

export type OrganizationMfaPolicyRow = {
  organizationId: string;
  name: string;
  status: string | null;
  slug: string | null;
  organizationMfaEnabled: boolean;
  policy: EffectiveMfaPolicy;
  effectiveLabel: string;
  reasonLabel: string;
};

export async function getAdminPlatformMfaPolicy() {
  await authorizeMfaPolicyManagement({ scope: "platform" });
  const platform = await getPlatformSecuritySettings();
  return {
    platform,
    envLoginEnabled: !isMfaEmergencyOverrideActive(),
    emergencyOverrideActive: isMfaEmergencyOverrideActive(),
  };
}

export function evaluateOrganizationAdminPolicy(input: {
  envLoginEnabled: boolean;
  platformMfaEnabled: boolean;
  organizationMfaEnabled: boolean;
  organizationId: string;
}): EffectiveMfaPolicy {
  return evaluateMfaPolicy({
    envLoginEnabled: input.envLoginEnabled,
    platformMfaEnabled: input.platformMfaEnabled,
    organizationMfaEnabled: input.organizationMfaEnabled,
    organizationId: input.organizationId,
    audience: "organization",
  });
}

export async function listOrganizationMfaPoliciesForAdmin(input: {
  q?: string;
  page?: number | string;
  pageSize?: number | string;
}): Promise<{
  platformMfaEnabled: boolean;
  envLoginEnabled: boolean;
  emergencyOverrideActive: boolean;
  rows: OrganizationMfaPolicyRow[];
  page: number;
  pageSize: MfaPolicyPageSize;
  total: number;
  totalPages: number;
  from: number;
  to: number;
  q: string;
}> {
  await authorizeMfaPolicyManagement({ scope: "platform" });
  const admin = requirePlatformAdminClient();
  const pageSize = clampMfaPolicyPageSize(input.pageSize);
  const requestedPage = clampMfaPolicyPage(input.page);
  const q = (input.q ?? "").trim();
  const orFilter = organizationSearchOrFilter(q);

  let countQuery = admin
    .from("organizations")
    .select("id", { count: "exact", head: true });
  if (orFilter) countQuery = countQuery.or(orFilter);
  const { count, error: countError } = await countQuery;
  if (countError) throw new Error(countError.message);

  const total = count ?? 0;
  const window = pageWindow({ page: requestedPage, pageSize, total });
  const from = total === 0 ? 0 : (window.page - 1) * pageSize;
  const to = total === 0 ? 0 : from + pageSize - 1;

  let dataQuery = admin
    .from("organizations")
    .select("id, name, status, slug")
    .order("name", { ascending: true });
  if (orFilter) dataQuery = dataQuery.or(orFilter);
  if (total > 0) dataQuery = dataQuery.range(from, to);

  const [{ data, error }, platform] = await Promise.all([
    total === 0
      ? Promise.resolve({ data: [] as Array<{
          id: string;
          name: string;
          status: string | null;
          slug: string | null;
        }>, error: null })
      : dataQuery,
    getPlatformSecuritySettings(),
  ]);
  if (error) throw new Error(error.message);

  const envLoginEnabled = !isMfaEmergencyOverrideActive();
  const ids = (data ?? []).map((row) => String(row.id));
  const settings = await listOrganizationSecuritySettings(ids);

  const rows = (data ?? []).map((row) => {
    const organizationId = String(row.id);
    const organizationMfaEnabled = settings.get(organizationId) !== false;
    const policy = evaluateOrganizationAdminPolicy({
      envLoginEnabled,
      platformMfaEnabled: platform.mfaEnabled,
      organizationMfaEnabled,
      organizationId,
    });
    return {
      organizationId,
      name: row.name,
      status: row.status,
      slug: row.slug,
      organizationMfaEnabled,
      policy,
      effectiveLabel: describeEffectiveMfaPolicy(policy),
      reasonLabel: describeMfaPolicyReason(policy),
    };
  });

  return {
    platformMfaEnabled: platform.mfaEnabled,
    envLoginEnabled,
    emergencyOverrideActive: !envLoginEnabled,
    rows,
    page: window.page,
    pageSize,
    total: window.total,
    totalPages: window.totalPages,
    from: window.from,
    to: window.to,
    q,
  };
}

export async function getOrganizationMfaPolicyForAdmin(organizationId: string) {
  await authorizeMfaPolicyManagement({
    scope: "organization",
    organizationId,
  });
  const [platform, organization] = await Promise.all([
    getPlatformSecuritySettings(),
    getOrganizationSecuritySettings(organizationId),
  ]);
  const envLoginEnabled = !isMfaEmergencyOverrideActive();
  const policy = evaluateOrganizationAdminPolicy({
    envLoginEnabled,
    platformMfaEnabled: platform.mfaEnabled,
    organizationMfaEnabled: organization.mfaEnabled,
    organizationId,
  });
  return {
    platform,
    organization,
    envLoginEnabled,
    emergencyOverrideActive: !envLoginEnabled,
    policy,
    effectiveLabel: describeEffectiveMfaPolicy(policy),
    reasonLabel: describeMfaPolicyReason(policy),
  };
}
