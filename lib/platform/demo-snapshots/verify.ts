import type { SupabaseClient } from "@supabase/supabase-js";
import type { SnapshotManifest } from "@/lib/platform/demo-snapshots/types";

export type RestoreVerificationResult = {
  ok: boolean;
  checks: Array<{ name: string; passed: boolean; detail?: string }>;
};

export async function verifyDemoRestore(
  admin: SupabaseClient,
  params: {
    organizationId: string;
    manifest: SnapshotManifest;
  },
): Promise<RestoreVerificationResult> {
  const checks: RestoreVerificationResult["checks"] = [];

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .select(
      "id, is_demo_organization, demo_maintenance_mode, demo_restore_locked, name",
    )
    .eq("id", params.organizationId)
    .maybeSingle();

  checks.push({
    name: "organization_exists",
    passed: Boolean(org) && !orgError,
    detail: orgError?.message,
  });
  checks.push({
    name: "remains_demo",
    passed: org?.is_demo_organization === true,
  });

  const { count: campusCount } = await admin
    .from("campuses")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", params.organizationId)
    .eq("is_primary", true);

  checks.push({
    name: "primary_campus",
    passed: (campusCount ?? 0) >= 1,
    detail: `primary campuses=${campusCount ?? 0}`,
  });

  const { data: owners } = await admin
    .from("organization_memberships")
    .select("id, user_id, role, status")
    .eq("organization_id", params.organizationId)
    .eq("status", "active")
    .eq("role", "owner");

  checks.push({
    name: "active_owner",
    passed: (owners?.length ?? 0) >= 1,
    detail: `owners=${owners?.length ?? 0}`,
  });

  const protectedIds = params.manifest.protected_account_ids ?? [];
  if (protectedIds.length > 0) {
    const { data: protectedMemberships } = await admin
      .from("organization_memberships")
      .select("user_id, status")
      .eq("organization_id", params.organizationId)
      .in("user_id", protectedIds);

    const active = new Set(
      (protectedMemberships ?? [])
        .filter((m) => m.status === "active")
        .map((m) => String(m.user_id)),
    );
    const missing = protectedIds.filter((id) => !active.has(id));
    checks.push({
      name: "protected_accounts",
      passed: missing.length === 0,
      detail:
        missing.length === 0
          ? `${protectedIds.length} active`
          : `missing ${missing.length}`,
    });
  } else {
    checks.push({
      name: "protected_accounts",
      passed: true,
      detail: "none listed in manifest",
    });
  }

  const expectedPlan = params.manifest.subscription_plan_key;
  if (expectedPlan) {
    const { data: sub } = await admin
      .from("organization_subscriptions")
      .select("id, billing_provider, subscription_plans(plan_key)")
      .eq("organization_id", params.organizationId)
      .in("status", [
        "trialing",
        "active",
        "past_due",
        "grace_period",
        "incomplete",
      ])
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const planJoin = sub?.subscription_plans as
      | { plan_key?: string }
      | { plan_key?: string }[]
      | null;
    const planKey = Array.isArray(planJoin)
      ? planJoin[0]?.plan_key
      : planJoin?.plan_key;

    checks.push({
      name: "subscription_plan",
      passed: planKey === expectedPlan,
      detail: `expected=${expectedPlan} actual=${planKey ?? "none"}`,
    });
    checks.push({
      name: "demo_billing_provider",
      passed:
        !sub ||
        sub.billing_provider === "internal_demo" ||
        sub.billing_provider == null,
      detail: String(sub?.billing_provider ?? "none"),
    });
  } else {
    checks.push({
      name: "subscription_plan",
      passed: true,
      detail: "no plan in snapshot",
    });
  }

  // Spot-check a few high-signal replace tables for count match when present in manifest.
  for (const table of ["campuses", "incidents", "notification_groups"] as const) {
    const expected = params.manifest.record_counts?.[table];
    if (typeof expected !== "number") continue;
    const { count } = await admin
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("organization_id", params.organizationId);
    checks.push({
      name: `count_${table}`,
      passed: (count ?? 0) === expected,
      detail: `expected=${expected} actual=${count ?? 0}`,
    });
  }

  const ok = checks.every((c) => c.passed);
  return { ok, checks };
}
