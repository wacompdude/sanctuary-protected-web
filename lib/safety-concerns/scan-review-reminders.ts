import { createNotification } from "@/lib/notifications/create-notification";
import { FEATURE_KEYS } from "@/lib/subscriptions/feature-keys";
import { hasFeature } from "@/lib/subscriptions/resolver";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";

export type SafetyConcernReviewScanResult = {
  churchesScanned: number;
  profilesScanned: number;
  notificationsQueued: number;
  duplicatesSkipped: number;
  errors: string[];
};

/**
 * Daily scan for Safety Concern Profile review/expiration reminders.
 * Does not include display names or photos in notification content.
 */
export async function scanSafetyConcernReviewReminders(options?: {
  churchId?: string;
  now?: Date;
}): Promise<SafetyConcernReviewScanResult> {
  const result: SafetyConcernReviewScanResult = {
    churchesScanned: 0,
    profilesScanned: 0,
    notificationsQueued: 0,
    duplicatesSkipped: 0,
    errors: [],
  };

  if (!isServiceRoleConfigured()) {
    result.errors.push(
      "SUPABASE_SERVICE_ROLE_KEY is not configured; safety concern scan requires admin access.",
    );
    return result;
  }

  const admin = createAdminClient();
  const now = options?.now ?? new Date();
  const todayStr = now.toISOString().slice(0, 10);

  const churchQuery = admin
    .from("organizations")
    .select("id, name")
    .eq("is_active", true);
  if (options?.churchId) {
    churchQuery.eq("id", options.churchId);
  }

  const { data: churches, error: churchError } = await churchQuery;
  if (churchError || !churches?.length) {
    if (churchError) {
      result.errors.push(`Failed to load churches: ${churchError.message}`);
    }
    return result;
  }

  for (const church of churches) {
    result.churchesScanned++;

    const entitlement = await hasFeature({
      churchId: church.id,
      featureKey: FEATURE_KEYS.SAFETY_CONCERN_PROFILES,
    }).catch(() => ({ allowed: false as const }));

    if (!entitlement.allowed) continue;

    const { data: profiles, error: profileError } = await admin
      .from("safety_concern_profiles")
      .select("id, next_review_date, expires_at, profile_status")
      .eq("organization_id", church.id)
      .is("archived_at", null)
      .in("profile_status", ["active", "under_review", "expired"]);

    if (profileError) {
      if (
        profileError.code === "42P01" ||
        profileError.code === "PGRST205" ||
        profileError.message.includes("safety_concern_")
      ) {
        continue;
      }
      result.errors.push(
        `Church ${church.id}: failed to load profiles: ${profileError.message}`,
      );
      continue;
    }

    for (const profile of profiles ?? []) {
      result.profilesScanned++;

      const nextReview =
        typeof profile.next_review_date === "string"
          ? profile.next_review_date.slice(0, 10)
          : null;
      const expiresAt =
        typeof profile.expires_at === "string"
          ? profile.expires_at.slice(0, 10)
          : null;

      const notifications: Array<{
        type:
          | "safety_concern.review_due"
          | "safety_concern.review_overdue"
          | "safety_concern.expired";
        severity: "medium" | "high";
        title: string;
        body: string;
        dedupeDate: string;
      }> = [];

      if (nextReview && nextReview <= todayStr) {
        const overdue = nextReview < todayStr;
        notifications.push({
          type: overdue
            ? "safety_concern.review_overdue"
            : "safety_concern.review_due",
          severity: overdue ? "high" : "medium",
          title: overdue
            ? "Safety Concern Profile review overdue"
            : "Safety Concern Profile review due",
          body: overdue
            ? "A Safety Concern Profile is past its review date. Open Known Safety Concerns to complete the review. This message intentionally omits identifying details."
            : "A Safety Concern Profile is due for review today. Open Known Safety Concerns to complete the review. This message intentionally omits identifying details.",
          dedupeDate: nextReview,
        });
      }

      if (
        expiresAt &&
        expiresAt <= todayStr &&
        profile.profile_status !== "archived"
      ) {
        notifications.push({
          type: "safety_concern.expired",
          severity: "high",
          title: "Safety Concern Profile expired",
          body: "A Safety Concern Profile has reached its expiration date. Open Known Safety Concerns to review or archive it. This message intentionally omits identifying details.",
          dedupeDate: expiresAt,
        });
      }

      for (const item of notifications) {
        const notifyResult = await createNotification(
          {
            churchId: church.id,
            notificationType: item.type,
            severity: item.severity,
            entityType: "safety_concern_profile",
            entityId: profile.id,
            actionUrl: `/safety-concerns/${profile.id}`,
            deduplicationKey: `${item.type}:${profile.id}:${item.dedupeDate}`,
            title: item.title,
            body: item.body,
            summary: item.title,
          },
          { dispatchNow: false },
        );

        if (notifyResult.status === "duplicate") {
          result.duplicatesSkipped++;
        } else if (notifyResult.status === "queued") {
          result.notificationsQueued++;
        } else if (notifyResult.error) {
          result.errors.push(
            `Profile ${profile.id} (${church.id}): ${notifyResult.error}`,
          );
        }
      }
    }
  }

  return result;
}
