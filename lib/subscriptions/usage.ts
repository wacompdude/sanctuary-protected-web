import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { EntitlementError } from "@/lib/subscriptions/errors";
import {
  countActiveChurchMembers,
} from "@/lib/subscriptions/enforcement";
import { FEATURE_KEYS, type FeatureKey } from "@/lib/subscriptions/feature-keys";
import { getChurchSubscription } from "@/lib/subscriptions/queries";
import {
  getFeatureLimit,
  requireFeatureCapacity,
} from "@/lib/subscriptions/resolver";
import { buildPeriodWindow } from "@/lib/subscriptions/status";
import type {
  BillingPeriodBounds,
  RecordUsageEventInput,
  RecordUsageEventResult,
  SubscriptionUsageEventType,
  UsageMeter,
  UsageWarningLevel,
} from "@/lib/subscriptions/usage-types";

const WARNING_RATIO = 0.8;
const CRITICAL_RATIO = 0.95;

function requireAdmin(): SupabaseClient {
  if (!isServiceRoleConfigured()) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required for subscription usage writes.",
    );
  }
  return createAdminClient();
}

export function usageWarningLevel(
  committed: number,
  limit: number | null,
  unlimited: boolean,
): UsageWarningLevel {
  if (unlimited || limit === null) return "none";
  if (limit <= 0) {
    return committed > 0 ? "exceeded" : "none";
  }
  const ratio = committed / limit;
  if (ratio >= 1) return "exceeded";
  if (ratio >= CRITICAL_RATIO) return "critical";
  if (ratio >= WARNING_RATIO) return "warning";
  return "none";
}

export function resolveBillingPeriod(params: {
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  startedAt?: string | null;
  now?: Date;
}): BillingPeriodBounds {
  const now = params.now ?? new Date();
  if (params.currentPeriodStart && params.currentPeriodEnd) {
    return {
      periodStart: params.currentPeriodStart,
      periodEnd: params.currentPeriodEnd,
    };
  }

  const startBase = params.startedAt
    ? new Date(params.startedAt)
    : now;
  const anchor = Number.isNaN(startBase.getTime()) ? now : startBase;

  // Roll forward 30-day windows from started_at until "now" is inside one.
  let window = buildPeriodWindow(30, anchor);
  let guard = 0;
  while (now.getTime() > window.end.getTime() && guard < 120) {
    window = buildPeriodWindow(30, new Date(window.end.getTime() + 1));
    guard += 1;
  }
  if (now.getTime() < window.start.getTime()) {
    window = buildPeriodWindow(30, now);
  }

  return {
    periodStart: window.start.toISOString(),
    periodEnd: window.end.toISOString(),
  };
}

async function resolveFeatureId(
  admin: SupabaseClient,
  featureKey: string,
): Promise<string> {
  const { data, error } = await admin
    .from("features")
    .select("id")
    .eq("feature_key", featureKey)
    .maybeSingle();

  if (error || !data) {
    throw new Error(
      `Feature "${featureKey}" is not registered for usage metering.`,
    );
  }
  return String(data.id);
}

function buildMeter(params: {
  organizationId: string;
  featureKey: string;
  subscriptionId: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  quantityUsed: number;
  quantityReserved: number;
  limit: number | null;
  unlimited: boolean;
  planKey: string | null;
  planDisplayName: string | null;
}): UsageMeter {
  const quantityCommitted = params.quantityUsed + params.quantityReserved;
  const remaining =
    params.unlimited || params.limit === null
      ? null
      : Math.max(0, params.limit - quantityCommitted);

  return {
    organizationId: params.organizationId,
    featureKey: params.featureKey,
    subscriptionId: params.subscriptionId,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
    quantityUsed: params.quantityUsed,
    quantityReserved: params.quantityReserved,
    quantityCommitted,
    limit: params.limit,
    unlimited: params.unlimited,
    remaining,
    warningLevel: usageWarningLevel(
      quantityCommitted,
      params.limit,
      params.unlimited,
    ),
    planKey: params.planKey,
    planDisplayName: params.planDisplayName,
  };
}

/**
 * Read period usage for a metered feature (authenticated SELECT or admin).
 */
export async function getUsageMeter(params: {
  organizationId: string;
  featureKey: FeatureKey | string;
  client?: SupabaseClient;
}): Promise<UsageMeter> {
  const organizationId = params.organizationId.trim();
  const featureKey = String(params.featureKey);
  const supabase = params.client ?? (await createClient());

  const [subscription, limitResult] = await Promise.all([
    getChurchSubscription(organizationId, supabase),
    getFeatureLimit({ organizationId, featureKey }),
  ]);

  if (!subscription) {
    return buildMeter({
      organizationId,
      featureKey,
      subscriptionId: null,
      periodStart: null,
      periodEnd: null,
      quantityUsed: 0,
      quantityReserved: 0,
      limit: limitResult.limit,
      unlimited: limitResult.unlimited,
      planKey: limitResult.planKey,
      planDisplayName: limitResult.planDisplayName,
    });
  }

  const period = resolveBillingPeriod({
    currentPeriodStart: subscription.current_period_start,
    currentPeriodEnd: subscription.current_period_end,
    startedAt: subscription.started_at,
  });

  const { data: feature } = await supabase
    .from("features")
    .select("id")
    .eq("feature_key", featureKey)
    .maybeSingle();

  if (!feature) {
    return buildMeter({
      organizationId,
      featureKey,
      subscriptionId: subscription.id,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      quantityUsed: 0,
      quantityReserved: 0,
      limit: limitResult.limit,
      unlimited: limitResult.unlimited,
      planKey: limitResult.planKey,
      planDisplayName: limitResult.planDisplayName,
    });
  }

  const { data: usage } = await supabase
    .from("subscription_usage")
    .select("quantity_used, quantity_reserved")
    .eq("subscription_id", subscription.id)
    .eq("feature_id", feature.id)
    .eq("period_start", period.periodStart)
    .eq("period_end", period.periodEnd)
    .maybeSingle();

  return buildMeter({
    organizationId,
    featureKey,
    subscriptionId: subscription.id,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    quantityUsed: Number(usage?.quantity_used ?? 0),
    quantityReserved: Number(usage?.quantity_reserved ?? 0),
    limit: limitResult.limit,
    unlimited: limitResult.unlimited,
    planKey: limitResult.planKey,
    planDisplayName: limitResult.planDisplayName,
  });
}

async function applyAggregateDelta(
  admin: SupabaseClient,
  params: {
    organizationId: string;
    subscriptionId: string;
    featureId: string;
    periodStart: string;
    periodEnd: string;
    usedDelta: number;
    reservedDelta: number;
  },
) {
  const { data: existing } = await admin
    .from("subscription_usage")
    .select("id, quantity_used, quantity_reserved")
    .eq("subscription_id", params.subscriptionId)
    .eq("feature_id", params.featureId)
    .eq("period_start", params.periodStart)
    .eq("period_end", params.periodEnd)
    .maybeSingle();

  if (!existing) {
    const used = Math.max(0, params.usedDelta);
    const reserved = Math.max(0, params.reservedDelta);
    const { error } = await admin.from("subscription_usage").insert({
      organization_id: params.organizationId,
      subscription_id: params.subscriptionId,
      feature_id: params.featureId,
      period_start: params.periodStart,
      period_end: params.periodEnd,
      quantity_used: used,
      quantity_reserved: reserved,
      last_calculated_at: new Date().toISOString(),
    });
    if (error) {
      throw new Error(`Unable to create usage aggregate: ${error.message}`);
    }
    return;
  }

  const nextUsed = Math.max(
    0,
    Number(existing.quantity_used) + params.usedDelta,
  );
  const nextReserved = Math.max(
    0,
    Number(existing.quantity_reserved) + params.reservedDelta,
  );

  const { error } = await admin
    .from("subscription_usage")
    .update({
      quantity_used: nextUsed,
      quantity_reserved: nextReserved,
      last_calculated_at: new Date().toISOString(),
    })
    .eq("id", existing.id);

  if (error) {
    throw new Error(`Unable to update usage aggregate: ${error.message}`);
  }
}

function deltasForEvent(
  eventType: SubscriptionUsageEventType,
  quantity: number,
): { usedDelta: number; reservedDelta: number } {
  const abs = Math.abs(quantity);
  switch (eventType) {
    case "reserve":
      return { usedDelta: 0, reservedDelta: abs };
    case "release":
      return { usedDelta: 0, reservedDelta: -abs };
    case "consume":
      return { usedDelta: abs, reservedDelta: 0 };
    case "reverse":
      return { usedDelta: -abs, reservedDelta: 0 };
    case "adjust":
      return {
        usedDelta: quantity,
        reservedDelta: 0,
      };
    default:
      return { usedDelta: 0, reservedDelta: 0 };
  }
}

/**
 * Idempotent ledger write + aggregate update (service_role).
 * Duplicate usage_key returns the existing meter without double-counting.
 */
export async function recordUsageEvent(
  input: RecordUsageEventInput,
): Promise<RecordUsageEventResult> {
  const admin = requireAdmin();
  const organizationId = input.organizationId.trim();
  const featureKey = String(input.featureKey);
  const usageKey = input.usageKey.trim();
  const quantity = Number(input.quantity);

  if (!organizationId || !usageKey) {
    throw new Error("organizationId and usageKey are required.");
  }
  if (!Number.isFinite(quantity) || quantity === 0) {
    throw new Error("Usage quantity must be a non-zero number.");
  }

  const subscription = await getChurchSubscription(organizationId, admin);
  if (!subscription) {
    throw new EntitlementError(
      "No active church subscription is available for usage metering.",
      { code: "subscription_unavailable", featureKey: featureKey as FeatureKey },
    );
  }

  const period = resolveBillingPeriod({
    currentPeriodStart: subscription.current_period_start,
    currentPeriodEnd: subscription.current_period_end,
    startedAt: subscription.started_at,
  });
  const featureId = await resolveFeatureId(admin, featureKey);

  const { data: existingEvent } = await admin
    .from("subscription_usage_events")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("usage_key", usageKey)
    .maybeSingle();

  if (existingEvent) {
    const meter = await getUsageMeter({
      organizationId,
      featureKey,
      client: admin,
    });
    return {
      recorded: false,
      duplicate: true,
      eventId: String(existingEvent.id),
      meter,
    };
  }

  const occurredAt =
    input.occurredAt instanceof Date
      ? input.occurredAt.toISOString()
      : input.occurredAt ?? new Date().toISOString();

  const { data: inserted, error: insertError } = await admin
    .from("subscription_usage_events")
    .insert({
      organization_id: organizationId,
      subscription_id: subscription.id,
      feature_id: featureId,
      usage_key: usageKey,
      quantity,
      event_type: input.eventType,
      source_type: input.sourceType ?? null,
      source_id: input.sourceId ?? null,
      billing_period_start: period.periodStart,
      billing_period_end: period.periodEnd,
      occurred_at: occurredAt,
      metadata: input.metadata ?? {},
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      const meter = await getUsageMeter({
        organizationId,
        featureKey,
        client: admin,
      });
      return {
        recorded: false,
        duplicate: true,
        eventId: null,
        meter,
      };
    }
    throw new Error(`Unable to record usage event: ${insertError.message}`);
  }

  const { usedDelta, reservedDelta } = deltasForEvent(
    input.eventType,
    quantity,
  );
  await applyAggregateDelta(admin, {
    organizationId,
    subscriptionId: subscription.id,
    featureId,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    usedDelta,
    reservedDelta,
  });

  const meter = await getUsageMeter({
    organizationId,
    featureKey,
    client: admin,
  });

  return {
    recorded: true,
    duplicate: false,
    eventId: inserted ? String(inserted.id) : null,
    meter,
  };
}

export async function reserveUsage(params: {
  organizationId: string;
  featureKey: FeatureKey | string;
  usageKey: string;
  quantity: number;
  sourceType?: string | null;
  sourceId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<RecordUsageEventResult> {
  return recordUsageEvent({
    ...params,
    quantity: Math.abs(params.quantity),
    eventType: "reserve",
  });
}

export async function consumeUsage(params: {
  organizationId: string;
  featureKey: FeatureKey | string;
  usageKey: string;
  quantity: number;
  sourceType?: string | null;
  sourceId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<RecordUsageEventResult> {
  return recordUsageEvent({
    ...params,
    quantity: Math.abs(params.quantity),
    eventType: "consume",
  });
}

export async function releaseUsage(params: {
  organizationId: string;
  featureKey: FeatureKey | string;
  usageKey: string;
  quantity: number;
  sourceType?: string | null;
  sourceId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<RecordUsageEventResult> {
  return recordUsageEvent({
    ...params,
    quantity: Math.abs(params.quantity),
    eventType: "release",
  });
}

/**
 * Recompute period aggregates from the ledger for one feature.
 * Safe to re-run; overwrites quantity_used / quantity_reserved.
 */
export async function reconcileUsageFromEvents(params: {
  organizationId: string;
  featureKey: FeatureKey | string;
}): Promise<UsageMeter> {
  const admin = requireAdmin();
  const organizationId = params.organizationId.trim();
  const featureKey = String(params.featureKey);

  const subscription = await getChurchSubscription(organizationId, admin);
  if (!subscription) {
    throw new EntitlementError(
      "No active church subscription is available for usage reconciliation.",
      { code: "subscription_unavailable", featureKey: featureKey as FeatureKey },
    );
  }

  const period = resolveBillingPeriod({
    currentPeriodStart: subscription.current_period_start,
    currentPeriodEnd: subscription.current_period_end,
    startedAt: subscription.started_at,
  });
  const featureId = await resolveFeatureId(admin, featureKey);

  const { data: events, error } = await admin
    .from("subscription_usage_events")
    .select("quantity, event_type")
    .eq("organization_id", organizationId)
    .eq("subscription_id", subscription.id)
    .eq("feature_id", featureId)
    .eq("billing_period_start", period.periodStart)
    .eq("billing_period_end", period.periodEnd);

  if (error) {
    throw new Error(`Unable to load usage events: ${error.message}`);
  }

  let used = 0;
  let reserved = 0;
  for (const row of events ?? []) {
    const quantity = Number(row.quantity);
    const type = row.event_type as SubscriptionUsageEventType;
    const deltas = deltasForEvent(type, quantity);
    used += deltas.usedDelta;
    reserved += deltas.reservedDelta;
  }
  used = Math.max(0, used);
  reserved = Math.max(0, reserved);

  const { data: existing } = await admin
    .from("subscription_usage")
    .select("id")
    .eq("subscription_id", subscription.id)
    .eq("feature_id", featureId)
    .eq("period_start", period.periodStart)
    .eq("period_end", period.periodEnd)
    .maybeSingle();

  if (existing) {
    const { error: updateError } = await admin
      .from("subscription_usage")
      .update({
        quantity_used: used,
        quantity_reserved: reserved,
        last_calculated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (updateError) {
      throw new Error(`Unable to reconcile usage: ${updateError.message}`);
    }
  } else if (used > 0 || reserved > 0) {
    const { error: insertError } = await admin.from("subscription_usage").insert({
      organization_id: organizationId,
      subscription_id: subscription.id,
      feature_id: featureId,
      period_start: period.periodStart,
      period_end: period.periodEnd,
      quantity_used: used,
      quantity_reserved: reserved,
      last_calculated_at: new Date().toISOString(),
    });
    if (insertError) {
      throw new Error(`Unable to reconcile usage: ${insertError.message}`);
    }
  }

  return getUsageMeter({ organizationId, featureKey, client: admin });
}

/** Active seats are derived (not ledger-metered). */
export async function getSeatUsageMeter(organizationId: string): Promise<UsageMeter> {
  const [activeSeats, limitResult, subscription] = await Promise.all([
    countActiveChurchMembers(organizationId),
    getFeatureLimit({
      organizationId,
      featureKey: FEATURE_KEYS.USERS_ACTIVE_LIMIT,
    }),
    getChurchSubscription(organizationId),
  ]);

  const period = subscription
    ? resolveBillingPeriod({
        currentPeriodStart: subscription.current_period_start,
        currentPeriodEnd: subscription.current_period_end,
        startedAt: subscription.started_at,
      })
    : { periodStart: null, periodEnd: null };

  return buildMeter({
    organizationId,
    featureKey: FEATURE_KEYS.USERS_ACTIVE_LIMIT,
    subscriptionId: subscription?.id ?? null,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    quantityUsed: activeSeats,
    quantityReserved: 0,
    limit: limitResult.limit,
    unlimited: limitResult.unlimited,
    planKey: limitResult.planKey,
    planDisplayName: limitResult.planDisplayName,
  });
}

export async function getSmsSegmentUsageMeter(
  organizationId: string,
): Promise<UsageMeter> {
  return getUsageMeter({
    organizationId,
    featureKey: FEATURE_KEYS.SMS_MONTHLY_SEGMENT_LIMIT,
  });
}

/**
 * Enforce SMS segment capacity for an estimated send size.
 * Does not record usage — call reserve/consume when delivery is scheduled/sent.
 */
export async function requireSmsSegmentCapacity(params: {
  organizationId: string;
  estimatedSegments: number;
}): Promise<UsageMeter> {
  const meter = await getSmsSegmentUsageMeter(params.organizationId);
  await requireFeatureCapacity({
    organizationId: params.organizationId,
    featureKey: FEATURE_KEYS.SMS_MONTHLY_SEGMENT_LIMIT,
    currentUsage: meter.quantityCommitted,
    requestedIncrease: Math.max(0, params.estimatedSegments),
  });
  return meter;
}

/**
 * Record consumed SMS segments for a successful delivery (idempotent by delivery id).
 */
export async function recordSmsSegmentsConsumed(params: {
  organizationId: string;
  deliveryId: string;
  segments: number;
  notificationId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<RecordUsageEventResult> {
  return consumeUsage({
    organizationId: params.organizationId,
    featureKey: FEATURE_KEYS.SMS_MONTHLY_SEGMENT_LIMIT,
    usageKey: `sms:consume:delivery:${params.deliveryId}`,
    quantity: Math.max(1, Math.floor(params.segments)),
    sourceType: "notification_delivery",
    sourceId: params.deliveryId,
    metadata: {
      notification_id: params.notificationId ?? null,
      ...(params.metadata ?? {}),
    },
  });
}

export async function reserveSmsSegments(params: {
  organizationId: string;
  reservationKey: string;
  segments: number;
  sourceType?: string | null;
  sourceId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<RecordUsageEventResult> {
  return reserveUsage({
    organizationId: params.organizationId,
    featureKey: FEATURE_KEYS.SMS_MONTHLY_SEGMENT_LIMIT,
    usageKey: `sms:reserve:${params.reservationKey}`,
    quantity: Math.max(1, Math.floor(params.segments)),
    sourceType: params.sourceType ?? "notification",
    sourceId: params.sourceId ?? null,
    metadata: params.metadata,
  });
}

export async function releaseSmsSegmentReservation(params: {
  organizationId: string;
  reservationKey: string;
  segments: number;
  sourceType?: string | null;
  sourceId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<RecordUsageEventResult> {
  return releaseUsage({
    organizationId: params.organizationId,
    featureKey: FEATURE_KEYS.SMS_MONTHLY_SEGMENT_LIMIT,
    usageKey: `sms:release:${params.reservationKey}`,
    quantity: Math.max(1, Math.floor(params.segments)),
    sourceType: params.sourceType ?? "notification",
    sourceId: params.sourceId ?? null,
    metadata: params.metadata,
  });
}
