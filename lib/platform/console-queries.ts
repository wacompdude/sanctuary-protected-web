import { requirePlatformPermission } from "@/lib/platform/auth";
import type { PlatformPermissionKey } from "@/lib/platform/permission-keys";
import { requirePlatformAdminClient } from "@/lib/platform/queries";
import { PLATFORM_ROLE_KEYS } from "@/lib/platform/role-keys";
import type { PlatformAccountStatus, PlatformAccountType } from "@/lib/platform/types";
import { CURRENT_SUBSCRIPTION_STATUSES } from "@/lib/subscriptions/status";

export type PlatformDashboardStats = {
  totalChurches: number;
  activeChurches: number;
  suspendedChurches: number;
  trialChurches: number;
  activeSubscriptions: number;
  trialingSubscriptions: number;
  pastDueSubscriptions: number;
  activeMemberships: number;
  activePlatformAccounts: number;
  recentPlatformActions: Array<{
    id: string;
    action: string;
    created_at: string;
    email_snapshot: string | null;
    success: boolean;
  }>;
};

export type PlatformChurchListItem = {
  id: string;
  name: string;
  status: string | null;
  slug: string | null;
  created_at: string | null;
  campusCount: number;
  memberCount: number;
  planKey: string | null;
  planDisplayName: string | null;
  subscriptionStatus: string | null;
};

export type PlatformChurchDetail = {
  id: string;
  name: string;
  status: string | null;
  slug: string | null;
  timezone: string | null;
  created_at: string | null;
  campusCount: number;
  memberCount: number;
  subscription: {
    id: string;
    status: string;
    planKey: string;
    planDisplayName: string;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
  campuses: Array<{ id: string; name: string; status: string | null }>;
  members: Array<{
    id: string;
    user_id: string;
    role: string;
    status: string;
    full_name: string | null;
  }>;
};

export type PlatformAccountListItem = {
  id: string;
  email_snapshot: string;
  display_name: string | null;
  status: PlatformAccountStatus;
  account_type: PlatformAccountType;
  mfa_required: boolean;
  mfa_verified_at: string | null;
  last_platform_login_at: string | null;
  created_at: string | null;
  roleKeys: string[];
};

const PAGE_SIZE_DEFAULT = 25;

function clampPage(page: number): number {
  if (!Number.isFinite(page) || page < 1) return 1;
  return Math.floor(page);
}

export async function getPlatformDashboardStats(): Promise<PlatformDashboardStats> {
  await requirePlatformPermission("platform.console.access");
  const admin = requirePlatformAdminClient();

  const [
    churchesRes,
    subsRes,
    membershipsRes,
    platformAccountsRes,
    actionsRes,
  ] = await Promise.all([
    admin.from("organizations").select("id, status"),
    admin
      .from("organization_subscriptions")
      .select("id, status")
      .in("status", [...CURRENT_SUBSCRIPTION_STATUSES]),
    admin
      .from("organization_memberships")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    admin
      .from("platform_accounts")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    admin
      .from("platform_admin_actions")
      .select(
        "id, action, created_at, success, platform_accounts ( email_snapshot )",
      )
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const churches = churchesRes.data ?? [];
  const subscriptions = subsRes.data ?? [];

  const recentPlatformActions = (actionsRes.data ?? []).map((row) => {
    const record = row as Record<string, unknown>;
    const join = record.platform_accounts as
      | { email_snapshot?: string | null }
      | { email_snapshot?: string | null }[]
      | null;
    const account = Array.isArray(join) ? join[0] : join;
    return {
      id: String(record.id),
      action: String(record.action ?? ""),
      created_at: String(record.created_at ?? ""),
      email_snapshot: account?.email_snapshot ?? null,
      success: record.success !== false,
    };
  });

  return {
    totalChurches: churches.length,
    activeChurches: churches.filter((c) => c.status === "active").length,
    suspendedChurches: churches.filter((c) => c.status === "suspended").length,
    trialChurches: churches.filter((c) => c.status === "trial").length,
    activeSubscriptions: subscriptions.filter((s) => s.status === "active")
      .length,
    trialingSubscriptions: subscriptions.filter((s) => s.status === "trialing")
      .length,
    pastDueSubscriptions: subscriptions.filter((s) => s.status === "past_due")
      .length,
    activeMemberships: membershipsRes.count ?? 0,
    activePlatformAccounts: platformAccountsRes.count ?? 0,
    recentPlatformActions,
  };
}

export async function listPlatformChurches(input: {
  q?: string;
  status?: string;
  planKey?: string;
  page?: number;
  pageSize?: number;
}): Promise<{
  items: PlatformChurchListItem[];
  total: number;
  page: number;
  pageSize: number;
}> {
  await requirePlatformPermission("churches.read_all");
  const admin = requirePlatformAdminClient();
  const page = clampPage(input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? PAGE_SIZE_DEFAULT));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let planFilteredOrganizationIds: string[] | null = null;
  if (input.planKey && input.planKey !== "all") {
    const { data: planRow } = await admin
      .from("subscription_plans")
      .select("id")
      .eq("plan_key", input.planKey)
      .maybeSingle();
    if (!planRow?.id) {
      return { items: [], total: 0, page, pageSize };
    }
    const { data: subRows } = await admin
      .from("organization_subscriptions")
      .select("organization_id")
      .eq("plan_id", planRow.id)
      .in("status", [...CURRENT_SUBSCRIPTION_STATUSES]);
    planFilteredOrganizationIds = [
      ...new Set((subRows ?? []).map((row) => String(row.organization_id))),
    ];
    if (planFilteredOrganizationIds.length === 0) {
      return { items: [], total: 0, page, pageSize };
    }
  }

  let query = admin
    .from("organizations")
    .select("id, name, status, slug, created_at", { count: "exact" })
    .order("name", { ascending: true })
    .range(from, to);

  const q = input.q?.trim();
  if (q) {
    query = query.ilike("name", `%${q}%`);
  }
  if (input.status && input.status !== "all") {
    query = query.eq("status", input.status);
  }
  if (planFilteredOrganizationIds) {
    query = query.in("id", planFilteredOrganizationIds);
  }

  const { data, error, count } = await query;
  if (error) {
    throw new Error(`Unable to list churches: ${error.message}`);
  }

  const churches = data ?? [];
  const organizationIds = churches.map((c) => String(c.id));

  const [campusesRes, membersRes, subsRes] = await Promise.all([
    organizationIds.length
      ? admin
          .from("campuses")
          .select("id, organization_id")
          .in("organization_id", organizationIds)
      : Promise.resolve({ data: [] as Array<{ id: string; organization_id: string }> }),
    organizationIds.length
      ? admin
          .from("organization_memberships")
          .select("id, organization_id")
          .in("organization_id", organizationIds)
          .eq("status", "active")
      : Promise.resolve({ data: [] as Array<{ id: string; organization_id: string }> }),
    organizationIds.length
      ? admin
          .from("organization_subscriptions")
          .select(
            "organization_id, status, subscription_plans ( plan_key, display_name )",
          )
          .in("organization_id", organizationIds)
          .in("status", [...CURRENT_SUBSCRIPTION_STATUSES])
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
  ]);

  const campusCount = new Map<string, number>();
  for (const row of campusesRes.data ?? []) {
    const id = String(row.organization_id);
    campusCount.set(id, (campusCount.get(id) ?? 0) + 1);
  }

  const memberCount = new Map<string, number>();
  for (const row of membersRes.data ?? []) {
    const id = String(row.organization_id);
    memberCount.set(id, (memberCount.get(id) ?? 0) + 1);
  }

  const subByChurch = new Map<
    string,
    { planKey: string | null; planDisplayName: string | null; status: string | null }
  >();
  for (const row of subsRes.data ?? []) {
    const record = row as Record<string, unknown>;
    const organizationId = String(record.organization_id);
    const planJoin = record.subscription_plans as
      | { plan_key?: string; display_name?: string }
      | { plan_key?: string; display_name?: string }[]
      | null;
    const plan = Array.isArray(planJoin) ? planJoin[0] : planJoin;
    subByChurch.set(organizationId, {
      planKey: plan?.plan_key ?? null,
      planDisplayName: plan?.display_name ?? null,
      status: (record.status as string | null) ?? null,
    });
  }

  const items: PlatformChurchListItem[] = churches.map((church) => {
    const id = String(church.id);
    const sub = subByChurch.get(id);
    return {
      id,
      name: String(church.name),
      status: (church.status as string | null) ?? null,
      slug: (church.slug as string | null) ?? null,
      created_at: (church.created_at as string | null) ?? null,
      campusCount: campusCount.get(id) ?? 0,
      memberCount: memberCount.get(id) ?? 0,
      planKey: sub?.planKey ?? null,
      planDisplayName: sub?.planDisplayName ?? null,
      subscriptionStatus: sub?.status ?? null,
    };
  });

  return {
    items,
    total: count ?? items.length,
    page,
    pageSize,
  };
}

export async function getPlatformChurchDetail(
  organizationId: string,
): Promise<PlatformChurchDetail | null> {
  const context = await requirePlatformPermission("platform.console.access");
  const { assertPlatformChurchReadable } = await import(
    "@/lib/platform/support-sessions"
  );
  await assertPlatformChurchReadable(context, organizationId);
  const admin = requirePlatformAdminClient();

  const { data: church, error } = await admin
    .from("organizations")
    .select("id, name, status, slug, timezone, created_at")
    .eq("id", organizationId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load church: ${error.message}`);
  }
  if (!church) return null;

  const [campusesRes, membersRes, subRes] = await Promise.all([
    admin
      .from("campuses")
      .select("id, name, status")
      .eq("organization_id", organizationId)
      .order("name", { ascending: true }),
    admin
      .from("organization_memberships")
      .select("id, user_id, role, status")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .order("role", { ascending: true })
      .limit(100),
    admin
      .from("organization_subscriptions")
      .select(
        "id, status, trial_end, current_period_end, cancel_at_period_end, subscription_plans ( plan_key, display_name )",
      )
      .eq("organization_id", organizationId)
      .in("status", [...CURRENT_SUBSCRIPTION_STATUSES])
      .maybeSingle(),
  ]);

  const memberUserIds = (membersRes.data ?? []).map((row) => String(row.user_id));
  const profilesRes = memberUserIds.length
    ? await admin.from("profiles").select("id, full_name").in("id", memberUserIds)
    : { data: [] as Array<{ id: string; full_name: string | null }> };

  const profileById = new Map(
    (profilesRes.data ?? []).map((row) => [
      String(row.id),
      (row.full_name as string | null) ?? null,
    ]),
  );

  const subRow = subRes.data as Record<string, unknown> | null;
  let subscription: PlatformChurchDetail["subscription"] = null;
  if (subRow) {
    const planJoin = subRow.subscription_plans as
      | { plan_key?: string; display_name?: string }
      | { plan_key?: string; display_name?: string }[]
      | null;
    const plan = Array.isArray(planJoin) ? planJoin[0] : planJoin;
    subscription = {
      id: String(subRow.id),
      status: String(subRow.status ?? ""),
      planKey: String(plan?.plan_key ?? ""),
      planDisplayName: String(plan?.display_name ?? plan?.plan_key ?? ""),
      trialEndsAt: (subRow.trial_end as string | null) ?? null,
      currentPeriodEnd: (subRow.current_period_end as string | null) ?? null,
      cancelAtPeriodEnd: Boolean(subRow.cancel_at_period_end),
    };
  }

  const members = (membersRes.data ?? []).map((row) => ({
    id: String(row.id),
    user_id: String(row.user_id),
    role: String(row.role),
    status: String(row.status),
    full_name: profileById.get(String(row.user_id)) ?? null,
  }));

  const campuses = (campusesRes.data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    status: (row.status as string | null) ?? null,
  }));

  return {
    id: String(church.id),
    name: String(church.name),
    status: (church.status as string | null) ?? null,
    slug: (church.slug as string | null) ?? null,
    timezone: (church.timezone as string | null) ?? null,
    created_at: (church.created_at as string | null) ?? null,
    campusCount: campuses.length,
    memberCount: members.length,
    subscription,
    campuses,
    members,
  };
}

export async function listPlatformAccounts(input: {
  q?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<{
  items: PlatformAccountListItem[];
  total: number;
  page: number;
  pageSize: number;
}> {
  await requirePlatformPermission("platform.accounts.read");
  const admin = requirePlatformAdminClient();
  const page = clampPage(input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? PAGE_SIZE_DEFAULT));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = admin
    .from("platform_accounts")
    .select(
      "id, email_snapshot, display_name, status, account_type, mfa_required, mfa_verified_at, last_platform_login_at, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  const q = input.q?.trim();
  if (q) {
    query = query.or(
      `email_snapshot.ilike.%${q}%,display_name.ilike.%${q}%`,
    );
  }
  if (input.status && input.status !== "all") {
    query = query.eq("status", input.status);
  }

  const { data, error, count } = await query;
  if (error) {
    throw new Error(`Unable to list platform accounts: ${error.message}`);
  }

  const accounts = data ?? [];
  const accountIds = accounts.map((row) => String(row.id));

  const rolesRes = accountIds.length
    ? await admin
        .from("platform_account_roles")
        .select(
          "platform_account_id, revoked_at, expires_at, platform_roles ( role_key, status )",
        )
        .in("platform_account_id", accountIds)
        .is("revoked_at", null)
    : { data: [] as Array<Record<string, unknown>> };

  const rolesByAccount = new Map<string, string[]>();
  const now = Date.now();
  for (const row of rolesRes.data ?? []) {
    const record = row as Record<string, unknown>;
    const expiresAt = record.expires_at as string | null;
    if (expiresAt && new Date(expiresAt).getTime() <= now) continue;
    const roleJoin = record.platform_roles as
      | { role_key?: string; status?: string }
      | { role_key?: string; status?: string }[]
      | null;
    const role = Array.isArray(roleJoin) ? roleJoin[0] : roleJoin;
    if (!role || role.status !== "active" || !role.role_key) continue;
    const accountId = String(record.platform_account_id);
    const list = rolesByAccount.get(accountId) ?? [];
    list.push(String(role.role_key));
    rolesByAccount.set(accountId, list);
  }

  const items: PlatformAccountListItem[] = accounts.map((row) => ({
    id: String(row.id),
    email_snapshot: String(row.email_snapshot),
    display_name: (row.display_name as string | null) ?? null,
    status: row.status as PlatformAccountStatus,
    account_type: row.account_type as PlatformAccountType,
    mfa_required: row.mfa_required !== false,
    mfa_verified_at: (row.mfa_verified_at as string | null) ?? null,
    last_platform_login_at: (row.last_platform_login_at as string | null) ?? null,
    created_at: (row.created_at as string | null) ?? null,
    roleKeys: rolesByAccount.get(String(row.id)) ?? [],
  }));

  return {
    items,
    total: count ?? items.length,
    page,
    pageSize,
  };
}

export async function getPlatformAccountDetail(accountId: string): Promise<{
  account: PlatformAccountListItem;
  permissions: string[];
} | null> {
  await requirePlatformPermission("platform.accounts.read");
  const admin = requirePlatformAdminClient();

  const { data: account, error } = await admin
    .from("platform_accounts")
    .select(
      "id, email_snapshot, display_name, status, account_type, mfa_required, mfa_verified_at, last_platform_login_at, created_at, must_change_password, disabled_reason",
    )
    .eq("id", accountId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load platform account: ${error.message}`);
  }
  if (!account) return null;

  const { data: roleRows } = await admin
    .from("platform_account_roles")
    .select(
      "id, revoked_at, expires_at, platform_role_id, platform_roles ( id, role_key, status )",
    )
    .eq("platform_account_id", accountId)
    .is("revoked_at", null);

  const now = Date.now();
  const roleIds: string[] = [];
  const roleKeys: string[] = [];
  for (const row of roleRows ?? []) {
    const record = row as Record<string, unknown>;
    const expiresAt = record.expires_at as string | null;
    if (expiresAt && new Date(expiresAt).getTime() <= now) continue;
    const roleJoin = record.platform_roles as
      | { id?: string; role_key?: string; status?: string }
      | { id?: string; role_key?: string; status?: string }[]
      | null;
    const role = Array.isArray(roleJoin) ? roleJoin[0] : roleJoin;
    if (!role || role.status !== "active") continue;
    if (role.id) roleIds.push(String(role.id));
    if (role.role_key) roleKeys.push(String(role.role_key));
  }

  const permissions = new Set<string>();
  if (roleIds.length) {
    const { data: permRows } = await admin
      .from("platform_role_permissions")
      .select("platform_permissions ( permission_key, status )")
      .in("role_id", roleIds);
    for (const row of permRows ?? []) {
      const record = row as Record<string, unknown>;
      const join = record.platform_permissions as
        | { permission_key?: string; status?: string }
        | { permission_key?: string; status?: string }[]
        | null;
      const perm = Array.isArray(join) ? join[0] : join;
      if (perm?.status === "active" && perm.permission_key) {
        permissions.add(String(perm.permission_key));
      }
    }
  }

  return {
    account: {
      id: String(account.id),
      email_snapshot: String(account.email_snapshot),
      display_name: (account.display_name as string | null) ?? null,
      status: account.status as PlatformAccountStatus,
      account_type: account.account_type as PlatformAccountType,
      mfa_required: account.mfa_required !== false,
      mfa_verified_at: (account.mfa_verified_at as string | null) ?? null,
      last_platform_login_at:
        (account.last_platform_login_at as string | null) ?? null,
      created_at: (account.created_at as string | null) ?? null,
      roleKeys,
    },
    permissions: [...permissions].sort(),
  };
}

export async function listCurrentSubscriptions(input: {
  page?: number;
  pageSize?: number;
}): Promise<{
  items: Array<{
    id: string;
    organizationId: string;
    churchName: string;
    status: string;
    planKey: string;
    planDisplayName: string;
  }>;
  total: number;
  page: number;
  pageSize: number;
}> {
  await requirePlatformPermission("subscriptions.read_all");
  const admin = requirePlatformAdminClient();
  const page = clampPage(input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? PAGE_SIZE_DEFAULT));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await admin
    .from("organization_subscriptions")
    .select(
      "id, organization_id, status, churches ( name ), subscription_plans ( plan_key, display_name )",
      { count: "exact" },
    )
    .in("status", [...CURRENT_SUBSCRIPTION_STATUSES])
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (error) {
    throw new Error(`Unable to list subscriptions: ${error.message}`);
  }

  const items = (data ?? []).map((row) => {
    const record = row as Record<string, unknown>;
    const churchJoin = record.churches as
      | { name?: string }
      | { name?: string }[]
      | null;
    const church = Array.isArray(churchJoin) ? churchJoin[0] : churchJoin;
    const planJoin = record.subscription_plans as
      | { plan_key?: string; display_name?: string }
      | { plan_key?: string; display_name?: string }[]
      | null;
    const plan = Array.isArray(planJoin) ? planJoin[0] : planJoin;
    return {
      id: String(record.id),
      organizationId: String(record.organization_id),
      churchName: String(church?.name ?? "Unknown church"),
      status: String(record.status ?? ""),
      planKey: String(plan?.plan_key ?? ""),
      planDisplayName: String(plan?.display_name ?? plan?.plan_key ?? ""),
    };
  });

  return {
    items,
    total: count ?? items.length,
    page,
    pageSize,
  };
}

export async function listSubscriptionPlansForPlatform(): Promise<
  Array<{
    id: string;
    plan_key: string;
    display_name: string;
    status: string;
    monthly_price_cents: number | null;
    is_default: boolean;
    churchCount: number;
  }>
> {
  await requirePlatformPermission("plans.read");
  const admin = requirePlatformAdminClient();

  const [{ data: plans, error }, { data: subs }] = await Promise.all([
    admin
      .from("subscription_plans")
      .select(
        "id, plan_key, display_name, status, monthly_price_cents, is_default, sort_order",
      )
      .order("sort_order", { ascending: true }),
    admin
      .from("organization_subscriptions")
      .select("plan_id")
      .in("status", [...CURRENT_SUBSCRIPTION_STATUSES]),
  ]);

  if (error) {
    throw new Error(`Unable to list plans: ${error.message}`);
  }

  const countByPlan = new Map<string, number>();
  for (const row of subs ?? []) {
    const planId = String(row.plan_id);
    countByPlan.set(planId, (countByPlan.get(planId) ?? 0) + 1);
  }

  return (plans ?? []).map((row) => ({
    id: String(row.id),
    plan_key: String(row.plan_key),
    display_name: String(row.display_name),
    status: String(row.status),
    monthly_price_cents:
      row.monthly_price_cents === null || row.monthly_price_cents === undefined
        ? null
        : Number(row.monthly_price_cents),
    is_default: Boolean(row.is_default),
    churchCount: countByPlan.get(String(row.id)) ?? 0,
  }));
}

export async function listFeaturesForPlatform(): Promise<
  Array<{
    id: string;
    feature_key: string;
    display_name: string;
    category: string | null;
    status: string;
  }>
> {
  await requirePlatformPermission("features.read");
  const admin = requirePlatformAdminClient();
  const { data, error } = await admin
    .from("features")
    .select("id, feature_key, display_name, category, status")
    .order("feature_key", { ascending: true });

  if (error) {
    throw new Error(`Unable to list features: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: String(row.id),
    feature_key: String(row.feature_key),
    display_name: String(row.display_name ?? row.feature_key),
    category: (row.category as string | null) ?? null,
    status: String(row.status ?? ""),
  }));
}

export async function listRecentPlatformAudit(limit = 50): Promise<
  Array<{
    id: string;
    action: string;
    created_at: string;
    success: boolean;
    reason: string | null;
    email_snapshot: string | null;
    target_type: string | null;
  }>
> {
  await requirePlatformPermission("audit.platform.read");
  const admin = requirePlatformAdminClient();
  const { data, error } = await admin
    .from("platform_admin_actions")
    .select(
      "id, action, created_at, success, reason, target_type, platform_accounts ( email_snapshot )",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Unable to load platform audit: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const record = row as Record<string, unknown>;
    const join = record.platform_accounts as
      | { email_snapshot?: string | null }
      | { email_snapshot?: string | null }[]
      | null;
    const account = Array.isArray(join) ? join[0] : join;
    return {
      id: String(record.id),
      action: String(record.action ?? ""),
      created_at: String(record.created_at ?? ""),
      success: record.success !== false,
      reason: (record.reason as string | null) ?? null,
      email_snapshot: account?.email_snapshot ?? null,
      target_type: (record.target_type as string | null) ?? null,
    };
  });
}

export async function getPlatformHealthStatus(): Promise<{
  environment: string;
  commit: string | null;
  serviceRoleConfigured: boolean;
  billingProvider: string;
  emailProvider: string;
  platformTablesReachable: boolean;
  superAdminRoleSeeded: boolean;
}> {
  await requirePlatformPermission("system.health.read");
  const { isServiceRoleConfigured } = await import("@/lib/supabase/admin");
  const admin = requirePlatformAdminClient();

  const { data: role, error } = await admin
    .from("platform_roles")
    .select("id")
    .eq("role_key", PLATFORM_ROLE_KEYS.SUPER_ADMIN)
    .maybeSingle();

  return {
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "local",
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    serviceRoleConfigured: isServiceRoleConfigured(),
    billingProvider: process.env.BILLING_PROVIDER?.trim() || "none",
    emailProvider: process.env.EMAIL_PROVIDER?.trim() || "unset",
    platformTablesReachable: !error,
    superAdminRoleSeeded: Boolean(role?.id),
  };
}

/** Assert permission then return admin client for page-level use. */
export async function requirePlatformDataAccess(
  permission: PlatformPermissionKey,
) {
  const context = await requirePlatformPermission(permission);
  const admin = requirePlatformAdminClient();
  return { context, admin };
}
