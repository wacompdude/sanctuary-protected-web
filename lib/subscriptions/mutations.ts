import type { SupabaseClient } from "@supabase/supabase-js";
import {
  auditSubscriptionCreated,
  auditSubscriptionPlanChanged,
  auditSubscriptionStatusChanged,
} from "@/lib/audit/subscription-events";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import {
  PLAN_DISPLAY_NAMES,
  PLAN_KEYS,
  isPlanKey,
  type PlanKey,
} from "@/lib/subscriptions/plan-keys";
import { recommendPlanForChurch } from "@/lib/subscriptions/recommend-plan";
import {
  CURRENT_SUBSCRIPTION_STATUSES,
  buildPeriodWindow,
  isPlanDowngrade,
} from "@/lib/subscriptions/status";
import type {
  ChurchSubscriptionRecord,
  ChurchSubscriptionStatus,
  SubscriptionPlanRecord,
} from "@/lib/subscriptions/types";

export type SubscriptionMutationResult = {
  subscription: ChurchSubscriptionRecord;
  created: boolean;
  planChanged: boolean;
  statusChanged: boolean;
  recommendedPlanKey?: PlanKey;
};

function requireAdmin(): SupabaseClient {
  if (!isServiceRoleConfigured()) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required for subscription mutations.",
    );
  }
  return createAdminClient();
}

async function loadPlanByKey(
  admin: SupabaseClient,
  planKey: string,
): Promise<SubscriptionPlanRecord> {
  const { data, error } = await admin
    .from("subscription_plans")
    .select(
      "id, plan_key, display_name, description, status, billing_interval, monthly_price_cents, currency, sort_order, is_public, is_default, is_custom",
    )
    .eq("plan_key", planKey)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load plan ${planKey}: ${error.message}`);
  }
  if (!data) {
    throw new Error(`Subscription plan "${planKey}" was not found.`);
  }

  const row = data as Record<string, unknown>;
  const key = String(row.plan_key);
  return {
    id: String(row.id),
    plan_key: isPlanKey(key) ? key : key,
    display_name: String(row.display_name ?? key),
    description: (row.description as string | null) ?? null,
    status: (row.status as SubscriptionPlanRecord["status"]) ?? "inactive",
    billing_interval:
      (row.billing_interval as SubscriptionPlanRecord["billing_interval"]) ??
      "month",
    monthly_price_cents:
      row.monthly_price_cents === null || row.monthly_price_cents === undefined
        ? null
        : Number(row.monthly_price_cents),
    currency: String(row.currency ?? "USD"),
    sort_order: Number(row.sort_order) || 0,
    is_public: Boolean(row.is_public),
    is_default: Boolean(row.is_default),
    is_custom: Boolean(row.is_custom),
  };
}

async function loadDefaultPlan(
  admin: SupabaseClient,
): Promise<SubscriptionPlanRecord> {
  const { data, error } = await admin
    .from("subscription_plans")
    .select(
      "id, plan_key, display_name, description, status, billing_interval, monthly_price_cents, currency, sort_order, is_public, is_default, is_custom",
    )
    .eq("is_default", true)
    .eq("status", "active")
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load default plan: ${error.message}`);
  }
  if (data) {
    const row = data as Record<string, unknown>;
    const key = String(row.plan_key);
    return {
      id: String(row.id),
      plan_key: isPlanKey(key) ? key : key,
      display_name: String(row.display_name ?? key),
      description: (row.description as string | null) ?? null,
      status: (row.status as SubscriptionPlanRecord["status"]) ?? "inactive",
      billing_interval:
        (row.billing_interval as SubscriptionPlanRecord["billing_interval"]) ??
        "month",
      monthly_price_cents:
        row.monthly_price_cents === null ||
        row.monthly_price_cents === undefined
          ? null
          : Number(row.monthly_price_cents),
      currency: String(row.currency ?? "USD"),
      sort_order: Number(row.sort_order) || 0,
      is_public: Boolean(row.is_public),
      is_default: Boolean(row.is_default),
      is_custom: Boolean(row.is_custom),
    };
  }

  return loadPlanByKey(admin, PLAN_KEYS.SERVANT_STANDARD);
}

function mapSubscriptionRow(
  row: Record<string, unknown>,
  plan: { plan_key: string; display_name: string },
): ChurchSubscriptionRecord {
  const planKey = plan.plan_key;
  return {
    id: String(row.id),
    church_id: String(row.church_id),
    plan_id: String(row.plan_id),
    status: row.status as ChurchSubscriptionRecord["status"],
    billing_interval:
      row.billing_interval as ChurchSubscriptionRecord["billing_interval"],
    billing_provider: (row.billing_provider as string | null) ?? null,
    current_period_start: (row.current_period_start as string | null) ?? null,
    current_period_end: (row.current_period_end as string | null) ?? null,
    cancel_at_period_end: Boolean(row.cancel_at_period_end),
    cancelled_at: (row.cancelled_at as string | null) ?? null,
    trial_start: (row.trial_start as string | null) ?? null,
    trial_end: (row.trial_end as string | null) ?? null,
    grace_period_end: (row.grace_period_end as string | null) ?? null,
    started_at: String(row.started_at),
    plan_key: isPlanKey(planKey) ? planKey : planKey,
    plan_display_name: plan.display_name,
  };
}

async function getCurrentSubscription(
  admin: SupabaseClient,
  churchId: string,
): Promise<ChurchSubscriptionRecord | null> {
  const { data, error } = await admin
    .from("church_subscriptions")
    .select(
      `
      id,
      church_id,
      plan_id,
      status,
      billing_interval,
      billing_provider,
      current_period_start,
      current_period_end,
      cancel_at_period_end,
      cancelled_at,
      trial_start,
      trial_end,
      grace_period_end,
      started_at,
      subscription_plans!inner (
        plan_key,
        display_name
      )
    `,
    )
    .eq("church_id", churchId)
    .in("status", [...CURRENT_SUBSCRIPTION_STATUSES])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load church subscription: ${error.message}`);
  }
  if (!data) return null;

  const row = data as Record<string, unknown>;
  const plan = row.subscription_plans as Record<string, unknown> | null;
  return mapSubscriptionRow(row, {
    plan_key: String(plan?.plan_key ?? ""),
    display_name: String(plan?.display_name ?? plan?.plan_key ?? ""),
  });
}

async function writeChangeHistory(
  admin: SupabaseClient,
  params: {
    churchId: string;
    subscriptionId: string;
    oldPlanId?: string | null;
    newPlanId?: string | null;
    oldStatus?: ChurchSubscriptionStatus | null;
    newStatus?: ChurchSubscriptionStatus | null;
    changeType: string;
    reason?: string | null;
    metadata?: Record<string, unknown>;
    changedBy?: string | null;
  },
) {
  const { error } = await admin.from("subscription_change_history").insert({
    church_id: params.churchId,
    subscription_id: params.subscriptionId,
    old_plan_id: params.oldPlanId ?? null,
    new_plan_id: params.newPlanId ?? null,
    old_status: params.oldStatus ?? null,
    new_status: params.newStatus ?? null,
    change_type: params.changeType,
    reason: params.reason ?? null,
    metadata: params.metadata ?? {},
    changed_by: params.changedBy ?? null,
  });

  if (error) {
    throw new Error(
      `Unable to write subscription change history: ${error.message}`,
    );
  }
}

async function syncChurchDisplayFields(
  admin: SupabaseClient,
  params: {
    churchId: string;
    planKey: string;
    planDisplayName: string;
    trialEnd: string | null;
    status: ChurchSubscriptionStatus;
  },
) {
  const planName =
    (isPlanKey(params.planKey)
      ? PLAN_DISPLAY_NAMES[params.planKey]
      : null) ?? params.planDisplayName;

  const { error } = await admin
    .from("churches")
    .update({
      plan_name: planName,
      trial_ends_at:
        params.status === "trialing" ? params.trialEnd : null,
    })
    .eq("id", params.churchId);

  if (error) {
    console.error("Failed to sync churches.plan_name / trial_ends_at:", error.message);
  }
}

async function createSubscriptionRow(
  admin: SupabaseClient,
  params: {
    churchId: string;
    plan: SubscriptionPlanRecord;
    status: ChurchSubscriptionStatus;
    periodDays: number;
    userId?: string | null;
    source: string;
    reason?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<ChurchSubscriptionRecord> {
  const { start, end } = buildPeriodWindow(params.periodDays);
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const trialing = params.status === "trialing";

  const { data, error } = await admin
    .from("church_subscriptions")
    .insert({
      church_id: params.churchId,
      plan_id: params.plan.id,
      status: params.status,
      billing_interval: params.plan.billing_interval,
      current_period_start: startIso,
      current_period_end: endIso,
      trial_start: trialing ? startIso : null,
      trial_end: trialing ? endIso : null,
      started_at: startIso,
    })
    .select(
      `
      id,
      church_id,
      plan_id,
      status,
      billing_interval,
      billing_provider,
      current_period_start,
      current_period_end,
      cancel_at_period_end,
      cancelled_at,
      trial_start,
      trial_end,
      grace_period_end,
      started_at
    `,
    )
    .single();

  if (error || !data) {
    throw new Error(
      `Unable to create church subscription: ${error?.message ?? "unknown error"}`,
    );
  }

  const subscription = mapSubscriptionRow(data as Record<string, unknown>, {
    plan_key: String(params.plan.plan_key),
    display_name: params.plan.display_name,
  });

  await writeChangeHistory(admin, {
    churchId: params.churchId,
    subscriptionId: subscription.id,
    newPlanId: params.plan.id,
    newStatus: params.status,
    changeType: "subscription_created",
    reason: params.reason ?? "Subscription assignment",
    metadata: {
      source: params.source,
      plan_key: params.plan.plan_key,
      ...(params.metadata ?? {}),
    },
    changedBy: params.userId ?? null,
  });

  await auditSubscriptionCreated(admin, {
    churchId: params.churchId,
    userId: params.userId,
    subscriptionId: subscription.id,
    planKey: String(params.plan.plan_key),
    status: params.status,
    source: params.source,
  });

  await syncChurchDisplayFields(admin, {
    churchId: params.churchId,
    planKey: String(params.plan.plan_key),
    planDisplayName: params.plan.display_name,
    trialEnd: subscription.trial_end,
    status: params.status,
  });

  return subscription;
}

/**
 * Ensure the church has a current subscription.
 * Creates one when missing. Never auto-downgrades an existing plan.
 */
export async function ensureChurchSubscription(params: {
  churchId: string;
  planKey?: PlanKey | string;
  status?: ChurchSubscriptionStatus;
  periodDays?: number;
  userId?: string | null;
  source?: string;
  reason?: string | null;
  /** When planKey omitted, inspect usage and recommend (default false → default plan). */
  recommendFromUsage?: boolean;
}): Promise<SubscriptionMutationResult> {
  const admin = requireAdmin();
  const churchId = params.churchId.trim();
  if (!churchId) throw new Error("churchId is required.");

  const existing = await getCurrentSubscription(admin, churchId);
  if (existing) {
    await syncChurchDisplayFields(admin, {
      churchId,
      planKey: String(existing.plan_key),
      planDisplayName: existing.plan_display_name,
      trialEnd: existing.trial_end,
      status: existing.status,
    });
    return {
      subscription: existing,
      created: false,
      planChanged: false,
      statusChanged: false,
    };
  }

  let targetPlanKey: string;
  let recommendedPlanKey: PlanKey | undefined;
  let recommendMeta: Record<string, unknown> | undefined;

  if (params.planKey) {
    targetPlanKey = params.planKey;
  } else if (params.recommendFromUsage) {
    const recommendation = await recommendPlanForChurch(admin, churchId);
    targetPlanKey = recommendation.planKey;
    recommendedPlanKey = recommendation.planKey;
    recommendMeta = { usage_signals: recommendation.signals };
  } else {
    const defaultPlan = await loadDefaultPlan(admin);
    targetPlanKey = String(defaultPlan.plan_key);
  }

  const plan = await loadPlanByKey(admin, targetPlanKey);
  const status = params.status ?? "trialing";
  const subscription = await createSubscriptionRow(admin, {
    churchId,
    plan,
    status,
    periodDays: params.periodDays ?? 30,
    userId: params.userId,
    source: params.source ?? "ensure_church_subscription",
    reason: params.reason ?? "Default / recommended subscription assignment",
    metadata: recommendMeta,
  });

  return {
    subscription,
    created: true,
    planChanged: false,
    statusChanged: false,
    recommendedPlanKey,
  };
}

/**
 * Change the plan on the church's current subscription.
 * Creates a subscription when none exists. Never auto-downgrades unless
 * `allowDowngrade` is explicitly true.
 */
export async function changeChurchSubscriptionPlan(params: {
  churchId: string;
  planKey: PlanKey | string;
  status?: ChurchSubscriptionStatus;
  userId?: string | null;
  source?: string;
  reason?: string | null;
  allowDowngrade?: boolean;
  periodDays?: number;
}): Promise<SubscriptionMutationResult> {
  const admin = requireAdmin();
  const churchId = params.churchId.trim();
  if (!churchId) throw new Error("churchId is required.");

  const newPlan = await loadPlanByKey(admin, params.planKey);
  const existing = await getCurrentSubscription(admin, churchId);

  if (!existing) {
    const created = await createSubscriptionRow(admin, {
      churchId,
      plan: newPlan,
      status: params.status ?? "active",
      periodDays: params.periodDays ?? 30,
      userId: params.userId,
      source: params.source ?? "change_church_subscription_plan",
      reason: params.reason ?? "Plan assignment",
    });
    return {
      subscription: created,
      created: true,
      planChanged: true,
      statusChanged: false,
    };
  }

  if (
    !params.allowDowngrade &&
    isPlanDowngrade(String(existing.plan_key), String(newPlan.plan_key))
  ) {
    throw new Error(
      `Refusing to auto-downgrade from ${existing.plan_key} to ${newPlan.plan_key}. Pass allowDowngrade to override.`,
    );
  }

  if (existing.plan_id === newPlan.id && !params.status) {
    return {
      subscription: existing,
      created: false,
      planChanged: false,
      statusChanged: false,
    };
  }

  const nextStatus = params.status ?? existing.status;
  const { data, error } = await admin
    .from("church_subscriptions")
    .update({
      plan_id: newPlan.id,
      status: nextStatus,
      billing_interval: newPlan.billing_interval,
      cancelled_at: nextStatus === "cancelled" ? new Date().toISOString() : null,
    })
    .eq("id", existing.id)
    .select(
      `
      id,
      church_id,
      plan_id,
      status,
      billing_interval,
      billing_provider,
      current_period_start,
      current_period_end,
      cancel_at_period_end,
      cancelled_at,
      trial_start,
      trial_end,
      grace_period_end,
      started_at
    `,
    )
    .single();

  if (error || !data) {
    throw new Error(
      `Unable to change subscription plan: ${error?.message ?? "unknown error"}`,
    );
  }

  const subscription = mapSubscriptionRow(data as Record<string, unknown>, {
    plan_key: String(newPlan.plan_key),
    display_name: newPlan.display_name,
  });

  const planChanged = existing.plan_id !== newPlan.id;
  const statusChanged = existing.status !== nextStatus;

  if (planChanged || statusChanged) {
    await writeChangeHistory(admin, {
      churchId,
      subscriptionId: subscription.id,
      oldPlanId: existing.plan_id,
      newPlanId: newPlan.id,
      oldStatus: existing.status,
      newStatus: nextStatus,
      changeType: planChanged ? "plan_changed" : "status_changed",
      reason: params.reason ?? "Plan change",
      metadata: {
        source: params.source ?? "change_church_subscription_plan",
        old_plan_key: existing.plan_key,
        new_plan_key: newPlan.plan_key,
      },
      changedBy: params.userId ?? null,
    });
  }

  if (planChanged) {
    await auditSubscriptionPlanChanged(admin, {
      churchId,
      userId: params.userId,
      subscriptionId: subscription.id,
      oldPlanKey: String(existing.plan_key),
      newPlanKey: String(newPlan.plan_key),
      oldStatus: existing.status,
      newStatus: nextStatus,
      source: params.source ?? "change_church_subscription_plan",
    });
  }

  if (statusChanged) {
    await auditSubscriptionStatusChanged(admin, {
      churchId,
      userId: params.userId,
      subscriptionId: subscription.id,
      oldStatus: existing.status,
      newStatus: nextStatus,
      planKey: String(newPlan.plan_key),
      source: params.source ?? "change_church_subscription_plan",
    });
  }

  await syncChurchDisplayFields(admin, {
    churchId,
    planKey: String(newPlan.plan_key),
    planDisplayName: newPlan.display_name,
    trialEnd: subscription.trial_end,
    status: nextStatus,
  });

  return {
    subscription,
    created: false,
    planChanged,
    statusChanged,
  };
}

/**
 * Mark the current subscription to end after the billing period.
 * Does not delete data or immediately revoke the current period.
 */
export async function scheduleChurchSubscriptionCancellation(params: {
  churchId: string;
  userId?: string | null;
  source?: string;
  reason?: string | null;
}): Promise<SubscriptionMutationResult> {
  const admin = requireAdmin();
  const churchId = params.churchId.trim();
  if (!churchId) throw new Error("churchId is required.");

  const existing = await getCurrentSubscription(admin, churchId);
  if (!existing) {
    throw new Error("Church has no current subscription to cancel.");
  }

  if (existing.cancel_at_period_end) {
    return {
      subscription: existing,
      created: false,
      planChanged: false,
      statusChanged: false,
    };
  }

  const { data, error } = await admin
    .from("church_subscriptions")
    .update({
      cancel_at_period_end: true,
    })
    .eq("id", existing.id)
    .select(
      `
      id,
      church_id,
      plan_id,
      status,
      billing_interval,
      billing_provider,
      current_period_start,
      current_period_end,
      cancel_at_period_end,
      cancelled_at,
      trial_start,
      trial_end,
      grace_period_end,
      started_at
    `,
    )
    .single();

  if (error || !data) {
    throw new Error(
      `Unable to schedule cancellation: ${error?.message ?? "unknown error"}`,
    );
  }

  const subscription = mapSubscriptionRow(data as Record<string, unknown>, {
    plan_key: String(existing.plan_key),
    display_name: existing.plan_display_name,
  });

  await writeChangeHistory(admin, {
    churchId,
    subscriptionId: subscription.id,
    oldPlanId: existing.plan_id,
    newPlanId: existing.plan_id,
    oldStatus: existing.status,
    newStatus: existing.status,
    changeType: "cancellation_scheduled",
    reason: params.reason ?? "Cancel at period end",
    metadata: {
      source: params.source ?? "schedule_church_subscription_cancellation",
      cancel_at_period_end: true,
      current_period_end: existing.current_period_end,
    },
    changedBy: params.userId ?? null,
  });

  await auditSubscriptionStatusChanged(admin, {
    churchId,
    userId: params.userId,
    subscriptionId: subscription.id,
    oldStatus: existing.status,
    newStatus: existing.status,
    planKey: String(existing.plan_key),
    source: params.source ?? "schedule_church_subscription_cancellation",
  });

  return {
    subscription,
    created: false,
    planChanged: false,
    statusChanged: false,
  };
}

export async function updateChurchSubscriptionStatus(params: {
  churchId: string;
  status: ChurchSubscriptionStatus;
  userId?: string | null;
  source?: string;
  reason?: string | null;
}): Promise<SubscriptionMutationResult> {
  const admin = requireAdmin();
  const churchId = params.churchId.trim();
  if (!churchId) throw new Error("churchId is required.");

  const existing = await getCurrentSubscription(admin, churchId);
  if (!existing) {
    throw new Error("Church has no current subscription to update.");
  }

  if (existing.status === params.status) {
    return {
      subscription: existing,
      created: false,
      planChanged: false,
      statusChanged: false,
    };
  }

  const patch: Record<string, unknown> = {
    status: params.status,
  };
  if (params.status === "cancelled") {
    patch.cancelled_at = new Date().toISOString();
    patch.cancel_at_period_end = false;
  } else if (
    existing.status === "cancelled" ||
    existing.status === "expired" ||
    existing.status === "suspended"
  ) {
    patch.cancelled_at = null;
  }

  const { data, error } = await admin
    .from("church_subscriptions")
    .update(patch)
    .eq("id", existing.id)
    .select(
      `
      id,
      church_id,
      plan_id,
      status,
      billing_interval,
      billing_provider,
      current_period_start,
      current_period_end,
      cancel_at_period_end,
      cancelled_at,
      trial_start,
      trial_end,
      grace_period_end,
      started_at
    `,
    )
    .single();

  if (error || !data) {
    throw new Error(
      `Unable to update subscription status: ${error?.message ?? "unknown error"}`,
    );
  }

  const subscription = mapSubscriptionRow(data as Record<string, unknown>, {
    plan_key: String(existing.plan_key),
    display_name: existing.plan_display_name,
  });

  await writeChangeHistory(admin, {
    churchId,
    subscriptionId: subscription.id,
    oldPlanId: existing.plan_id,
    newPlanId: existing.plan_id,
    oldStatus: existing.status,
    newStatus: params.status,
    changeType: "status_changed",
    reason: params.reason ?? "Status change",
    metadata: {
      source: params.source ?? "update_church_subscription_status",
    },
    changedBy: params.userId ?? null,
  });

  await auditSubscriptionStatusChanged(admin, {
    churchId,
    userId: params.userId,
    subscriptionId: subscription.id,
    oldStatus: existing.status,
    newStatus: params.status,
    planKey: String(existing.plan_key),
    source: params.source ?? "update_church_subscription_status",
  });

  await syncChurchDisplayFields(admin, {
    churchId,
    planKey: String(existing.plan_key),
    planDisplayName: existing.plan_display_name,
    trialEnd: subscription.trial_end,
    status: params.status,
  });

  return {
    subscription,
    created: false,
    planChanged: false,
    statusChanged: true,
  };
}
