import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import {
  billingProviderStatusMessage,
  buildDowngradeImpactReport,
  getBillingProvider,
  type DowngradeImpactReport,
} from "@/lib/billing";
import { writePlatformAdminAction } from "@/lib/platform/audit";
import type { PlatformContext } from "@/lib/platform/types";
import { requirePlatformAdminClient } from "@/lib/platform/queries";
import { notifyChurchOwnersOfPlanChange } from "@/lib/platform/subscription-notify";
import {
  changeChurchSubscriptionPlan,
  scheduleChurchSubscriptionCancellation,
  updateChurchSubscriptionStatus,
} from "@/lib/subscriptions/mutations";

export type PlatformSubscriptionChangeResult = {
  impact: DowngradeImpactReport;
  message: string;
  notifiedOwners: number;
  billingProviderMessage: string;
};

export async function previewPlatformPlanChange(params: {
  churchId: string;
  targetPlanKey: string;
}): Promise<DowngradeImpactReport> {
  return buildDowngradeImpactReport({
    churchId: params.churchId,
    targetPlanKey: params.targetPlanKey,
  });
}

export async function applyPlatformPlanChange(params: {
  context: PlatformContext;
  churchId: string;
  targetPlanKey: string;
  reason: string;
  confirmDowngrade: boolean;
  typedConfirmation?: string;
}): Promise<PlatformSubscriptionChangeResult> {
  const reason = params.reason.trim();
  if (reason.length < 8) {
    throw new Error("Administrative reason must be at least 8 characters.");
  }

  const targetPlanKey = params.targetPlanKey.trim();
  if (!targetPlanKey) {
    throw new Error("Select a valid plan.");
  }

  const admin = requirePlatformAdminClient();
  const { data: church, error: churchError } = await admin
    .from("churches")
    .select("id, name")
    .eq("id", params.churchId)
    .maybeSingle();

  if (churchError || !church) {
    throw new Error(churchError?.message || "Church not found.");
  }

  const impact = await buildDowngradeImpactReport({
    churchId: params.churchId,
    targetPlanKey,
  });

  if (impact.isSamePlan) {
    return {
      impact,
      message: "Church is already on this plan.",
      notifiedOwners: 0,
      billingProviderMessage: billingProviderStatusMessage(),
    };
  }

  const unknownPlan = impact.items.some(
    (item) => item.kind === "info" && item.featureKey === "plan",
  );
  if (unknownPlan) {
    throw new Error(impact.summary);
  }

  if (impact.isDowngrade) {
    if (!params.confirmDowngrade) {
      throw new Error(
        "Confirm downgrade impact before applying this plan change.",
      );
    }
    const expected = String(church.name).trim().toLowerCase();
    const typed = String(params.typedConfirmation ?? "").trim().toLowerCase();
    if (!typed || typed !== expected) {
      throw new Error(
        "Type the church name exactly to confirm this downgrade.",
      );
    }
  }

  const provider = getBillingProvider();
  if (provider.isConfigured()) {
    // Provider-connected lifecycle changes should go through checkout/portal
    // once an adapter exists. Manual platform override remains available for
    // entitlement corrections with an audited reason.
    console.info(
      "[platform] billing provider configured; applying audited manual plan change until provider changePlan API exists",
      {
        churchId: params.churchId,
        planKey: targetPlanKey,
        provider: provider.id,
      },
    );
  }

  const result = await changeChurchSubscriptionPlan({
    churchId: params.churchId,
    planKey: targetPlanKey,
    userId: params.context.user.id,
    source: "platform_admin_console",
    reason,
    allowDowngrade: impact.isDowngrade,
  });

  const notify = await notifyChurchOwnersOfPlanChange({
    churchId: params.churchId,
    churchName: String(church.name),
    oldPlanDisplayName: impact.fromPlanDisplayName,
    newPlanDisplayName: impact.toPlanDisplayName,
    reason,
    changedByEmail: params.context.account.email_snapshot,
  });

  await writePlatformAdminAction(
    {
      platformAccountId: params.context.account.id,
      actorUserId: params.context.user.id,
      action: AuditAction.PLATFORM_SUBSCRIPTION_PLAN_CHANGED,
      targetType: AuditEntityType.CHURCH_SUBSCRIPTION,
      targetId: result.subscription.id,
      churchId: params.churchId,
      reason,
      metadata: {
        old_plan_key: impact.fromPlanKey,
        new_plan_key: impact.toPlanKey,
        is_downgrade: impact.isDowngrade,
        is_upgrade: impact.isUpgrade,
        over_limit: impact.blocking,
        billing_provider: provider.id,
        billing_provider_configured: provider.isConfigured(),
        owners_notified: notify.sent,
        notify_errors: notify.errors.slice(0, 3),
      },
    },
    { client: admin },
  );

  return {
    impact,
    message: `Plan updated to ${impact.toPlanDisplayName}.`,
    notifiedOwners: notify.sent,
    billingProviderMessage: billingProviderStatusMessage(),
  };
}

export async function cancelPlatformChurchSubscription(params: {
  context: PlatformContext;
  churchId: string;
  reason: string;
  confirm: boolean;
  typedConfirmation?: string;
}): Promise<{ message: string }> {
  const reason = params.reason.trim();
  if (reason.length < 8) {
    throw new Error("Administrative reason must be at least 8 characters.");
  }
  if (!params.confirm) {
    throw new Error("Confirm cancellation to continue.");
  }

  const admin = requirePlatformAdminClient();
  const { data: church } = await admin
    .from("churches")
    .select("id, name")
    .eq("id", params.churchId)
    .maybeSingle();
  if (!church) throw new Error("Church not found.");

  const expected = String(church.name).trim().toLowerCase();
  const typed = String(params.typedConfirmation ?? "").trim().toLowerCase();
  if (!typed || typed !== expected) {
    throw new Error("Type the church name exactly to confirm cancellation.");
  }

  const provider = getBillingProvider();
  if (provider.isConfigured() && provider.capabilities().cancelAtProvider) {
    throw new Error(
      "A billing provider owns cancellation. Use the provider portal or wait for provider-integrated cancel.",
    );
  }

  const result = await scheduleChurchSubscriptionCancellation({
    churchId: params.churchId,
    userId: params.context.user.id,
    source: "platform_admin_console",
    reason,
  });

  await writePlatformAdminAction(
    {
      platformAccountId: params.context.account.id,
      actorUserId: params.context.user.id,
      action: AuditAction.PLATFORM_SUBSCRIPTION_CANCELLED,
      targetType: AuditEntityType.CHURCH_SUBSCRIPTION,
      targetId: result.subscription.id,
      churchId: params.churchId,
      reason,
      metadata: {
        cancel_at_period_end: true,
        plan_key: result.subscription.plan_key,
      },
    },
    { client: admin },
  );

  return {
    message: "Subscription scheduled to cancel at period end.",
  };
}

export async function restorePlatformChurchSubscription(params: {
  context: PlatformContext;
  churchId: string;
  reason: string;
}): Promise<{ message: string }> {
  const reason = params.reason.trim();
  if (reason.length < 8) {
    throw new Error("Administrative reason must be at least 8 characters.");
  }

  const result = await updateChurchSubscriptionStatus({
    churchId: params.churchId,
    status: "active",
    userId: params.context.user.id,
    source: "platform_admin_console",
    reason,
  });

  const admin = requirePlatformAdminClient();
  await writePlatformAdminAction(
    {
      platformAccountId: params.context.account.id,
      actorUserId: params.context.user.id,
      action: AuditAction.PLATFORM_SUBSCRIPTION_RESTORED,
      targetType: AuditEntityType.CHURCH_SUBSCRIPTION,
      targetId: result.subscription.id,
      churchId: params.churchId,
      reason,
      metadata: {
        plan_key: result.subscription.plan_key,
        status: result.subscription.status,
      },
    },
    { client: admin },
  );

  return { message: "Subscription restored to active." };
}

export async function listPlatformSubscriptionHistory(
  churchId: string,
  limit = 40,
): Promise<
  Array<{
    id: string;
    change_type: string;
    reason: string | null;
    old_status: string | null;
    new_status: string | null;
    created_at: string;
    old_plan_key: string | null;
    new_plan_key: string | null;
  }>
> {
  const admin = requirePlatformAdminClient();
  const { data, error } = await admin
    .from("subscription_change_history")
    .select(
      "id, change_type, reason, old_status, new_status, created_at, old_plan_id, new_plan_id",
    )
    .eq("church_id", churchId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  const planIds = [
    ...new Set(
      (data ?? [])
        .flatMap((row) => [row.old_plan_id, row.new_plan_id])
        .filter(Boolean)
        .map(String),
    ),
  ];
  const planKeyById = new Map<string, string>();
  if (planIds.length) {
    const { data: plans } = await admin
      .from("subscription_plans")
      .select("id, plan_key")
      .in("id", planIds);
    for (const plan of plans ?? []) {
      planKeyById.set(String(plan.id), String(plan.plan_key));
    }
  }

  return (data ?? []).map((row) => ({
    id: String(row.id),
    change_type: String(row.change_type ?? ""),
    reason: (row.reason as string | null) ?? null,
    old_status: (row.old_status as string | null) ?? null,
    new_status: (row.new_status as string | null) ?? null,
    created_at: String(row.created_at),
    old_plan_key: row.old_plan_id
      ? (planKeyById.get(String(row.old_plan_id)) ?? null)
      : null,
    new_plan_key: row.new_plan_id
      ? (planKeyById.get(String(row.new_plan_id)) ?? null)
      : null,
  }));
}

export async function listActivePlansForPlatformAdmin(): Promise<
  Array<{
    plan_key: string;
    display_name: string;
    monthly_price_cents: number | null;
    status: string;
  }>
> {
  const admin = requirePlatformAdminClient();
  const { data, error } = await admin
    .from("subscription_plans")
    .select("plan_key, display_name, monthly_price_cents, status, sort_order")
    .in("status", ["active", "inactive"])
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    plan_key: String(row.plan_key),
    display_name: String(row.display_name),
    monthly_price_cents:
      row.monthly_price_cents === null || row.monthly_price_cents === undefined
        ? null
        : Number(row.monthly_price_cents),
    status: String(row.status),
  }));
}
