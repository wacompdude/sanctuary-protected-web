import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import {
  changeChurchSubscriptionPlan,
  ensureChurchSubscription,
} from "@/lib/subscriptions/mutations";
import { recommendPlanForChurch } from "@/lib/subscriptions/recommend-plan";
import { isPlanUpgrade } from "@/lib/subscriptions/status";
import type { PlanKey } from "@/lib/subscriptions/plan-keys";

export type ChurchSubscriptionMigrationRow = {
  churchId: string;
  created: boolean;
  planChanged: boolean;
  planKey: string;
  recommendedPlanKey?: PlanKey;
  skipped?: boolean;
  error?: string;
};

export type MigrateChurchSubscriptionsResult = {
  processed: number;
  created: number;
  upgraded: number;
  unchanged: number;
  failed: number;
  rows: ChurchSubscriptionMigrationRow[];
};

/**
 * Safe backfill for existing churches.
 * - Assigns a subscription when missing (recommended from usage).
 * - May upgrade an existing plan to the recommended tier.
 * - Never auto-downgrades.
 */
export async function migrateAllChurchSubscriptions(options?: {
  churchIds?: string[];
  status?: "trialing" | "active";
  periodDays?: number;
  /** When true (default), upgrade existing lower plans to the recommended plan. */
  upgradeIfRecommended?: boolean;
  userId?: string | null;
  dryRun?: boolean;
}): Promise<MigrateChurchSubscriptionsResult> {
  if (!isServiceRoleConfigured()) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required to migrate church subscriptions.",
    );
  }

  const admin = createAdminClient();
  const upgradeIfRecommended = options?.upgradeIfRecommended ?? true;
  const status = options?.status ?? "active";
  const periodDays = options?.periodDays ?? 30;
  const source = "migrate_all_church_subscriptions";

  let churchQuery = admin
    .from("churches")
    .select("id")
    .order("created_at", { ascending: true });

  if (options?.churchIds?.length) {
    churchQuery = churchQuery.in("id", options.churchIds);
  }

  const { data: churches, error } = await churchQuery;
  if (error) {
    throw new Error(`Unable to list churches: ${error.message}`);
  }

  const result: MigrateChurchSubscriptionsResult = {
    processed: 0,
    created: 0,
    upgraded: 0,
    unchanged: 0,
    failed: 0,
    rows: [],
  };

  for (const church of churches ?? []) {
    const churchId = String((church as { id: string }).id);
    result.processed += 1;

    try {
      if (options?.dryRun) {
        const recommendation = await recommendPlanForChurch(admin, churchId);
        result.rows.push({
          churchId,
          created: false,
          planChanged: false,
          planKey: recommendation.planKey,
          recommendedPlanKey: recommendation.planKey,
          skipped: true,
        });
        result.unchanged += 1;
        continue;
      }

      const ensured = await ensureChurchSubscription({
        churchId,
        status,
        periodDays,
        userId: options?.userId,
        source,
        recommendFromUsage: true,
        reason: "Safe backfill of church subscription",
      });

      if (ensured.created) {
        result.created += 1;
        result.rows.push({
          churchId,
          created: true,
          planChanged: false,
          planKey: String(ensured.subscription.plan_key),
          recommendedPlanKey: ensured.recommendedPlanKey,
        });
        continue;
      }

      if (upgradeIfRecommended) {
        const recommendation = await recommendPlanForChurch(admin, churchId);
        if (
          isPlanUpgrade(
            String(ensured.subscription.plan_key),
            recommendation.planKey,
          )
        ) {
          const changed = await changeChurchSubscriptionPlan({
            churchId,
            planKey: recommendation.planKey,
            userId: options?.userId,
            source,
            reason: "Upgrade to recommended plan during subscription backfill",
            allowDowngrade: false,
          });
          if (changed.planChanged) {
            result.upgraded += 1;
            result.rows.push({
              churchId,
              created: false,
              planChanged: true,
              planKey: String(changed.subscription.plan_key),
              recommendedPlanKey: recommendation.planKey,
            });
            continue;
          }
        }
      }

      result.unchanged += 1;
      result.rows.push({
        churchId,
        created: false,
        planChanged: false,
        planKey: String(ensured.subscription.plan_key),
      });
    } catch (err) {
      result.failed += 1;
      result.rows.push({
        churchId,
        created: false,
        planChanged: false,
        planKey: "",
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return result;
}
