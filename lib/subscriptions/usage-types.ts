import type { FeatureKey } from "@/lib/subscriptions/feature-keys";

export type SubscriptionUsageEventType =
  | "reserve"
  | "consume"
  | "release"
  | "adjust"
  | "reverse";

export type UsageWarningLevel =
  | "none"
  | "warning"
  | "critical"
  | "exceeded";

export type BillingPeriodBounds = {
  periodStart: string;
  periodEnd: string;
};

export type UsageMeter = {
  churchId: string;
  featureKey: FeatureKey | string;
  subscriptionId: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  quantityUsed: number;
  quantityReserved: number;
  /** used + reserved (committed against the period quota) */
  quantityCommitted: number;
  limit: number | null;
  unlimited: boolean;
  remaining: number | null;
  warningLevel: UsageWarningLevel;
  planKey: string | null;
  planDisplayName: string | null;
};

export type RecordUsageEventInput = {
  churchId: string;
  featureKey: FeatureKey | string;
  usageKey: string;
  quantity: number;
  eventType: SubscriptionUsageEventType;
  sourceType?: string | null;
  sourceId?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt?: string | Date;
};

export type RecordUsageEventResult = {
  recorded: boolean;
  duplicate: boolean;
  eventId: string | null;
  meter: UsageMeter;
};
