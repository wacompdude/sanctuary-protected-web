import {
  countActiveCampuses,
  countActiveChurchMembers,
} from "@/lib/subscriptions/enforcement";
import {
  FEATURE_DISPLAY_NAMES,
  FEATURE_KEYS,
  type FeatureKey,
} from "@/lib/subscriptions/feature-keys";
import {
  readBooleanEntitlement,
  readIntegerEntitlement,
} from "@/lib/subscriptions/entitlement-values";
import { isPlanKey } from "@/lib/subscriptions/plan-keys";
import {
  getChurchEntitlements,
  getPlanEntitlements,
} from "@/lib/subscriptions/resolver";
import {
  isPlanDowngrade,
  isPlanUpgrade,
  planRank,
} from "@/lib/subscriptions/status";
import { getSmsSegmentUsageMeter } from "@/lib/subscriptions/usage";
import type {
  DowngradeImpactItem,
  DowngradeImpactReport,
} from "@/lib/billing/types";

const COMPARE_BOOLEAN_KEYS: FeatureKey[] = [
  FEATURE_KEYS.INCIDENT_PHOTOS,
  FEATURE_KEYS.SMS,
  FEATURE_KEYS.MEDICAL_INVENTORY,
  FEATURE_KEYS.MEDICAL_INCIDENT_USAGE,
  FEATURE_KEYS.HARDWARE_INVENTORY,
  FEATURE_KEYS.HARDWARE_PHOTOS,
  FEATURE_KEYS.POLICIES,
  FEATURE_KEYS.ADVANCED_ANALYTICS,
  FEATURE_KEYS.MULTI_CAMPUS,
  FEATURE_KEYS.CAMERAS,
  FEATURE_KEYS.SENSORS,
  FEATURE_KEYS.SENSOR_ALARMS,
  FEATURE_KEYS.TEAM_SCHEDULING,
];

function labelFor(featureKey: string): string {
  if (featureKey in FEATURE_DISPLAY_NAMES) {
    return FEATURE_DISPLAY_NAMES[featureKey as FeatureKey];
  }
  return featureKey;
}

/**
 * Compare current church usage + entitlements against a target plan.
 * Downgrade never deletes data — items describe write blocks / feature loss.
 */
export async function buildDowngradeImpactReport(params: {
  churchId: string;
  targetPlanKey: string;
}): Promise<DowngradeImpactReport> {
  const churchId = params.churchId.trim();
  const targetPlanKey = params.targetPlanKey.trim();

  const current = await getChurchEntitlements(churchId);
  const fromPlanKey = current.plan
    ? String(current.plan.plan_key)
    : "servant_standard";
  const fromPlanDisplayName =
    current.plan?.display_name ?? fromPlanKey;

  const target = await getPlanEntitlements({ planKey: targetPlanKey });
  if (!target.plan) {
    return {
      fromPlanKey,
      toPlanKey: targetPlanKey,
      fromPlanDisplayName,
      toPlanDisplayName: targetPlanKey,
      isDowngrade: false,
      isUpgrade: false,
      isSamePlan: false,
      blocking: true,
      items: [
        {
          kind: "info",
          featureKey: "plan",
          label: "Plan",
          detail: `Target plan "${targetPlanKey}" was not found.`,
        },
      ],
      summary: "Unable to review plan change — target plan is unknown.",
    };
  }

  const toPlanKey = String(target.plan.plan_key);
  const toPlanDisplayName = target.plan.display_name;
  const same =
    fromPlanKey === toPlanKey ||
    (isPlanKey(fromPlanKey) &&
      isPlanKey(toPlanKey) &&
      planRank(fromPlanKey) === planRank(toPlanKey) &&
      fromPlanKey === toPlanKey);
  const downgrade = isPlanDowngrade(fromPlanKey, toPlanKey);
  const upgrade = isPlanUpgrade(fromPlanKey, toPlanKey);

  const items: DowngradeImpactItem[] = [];

  for (const featureKey of COMPARE_BOOLEAN_KEYS) {
    const currentlyOn = readBooleanEntitlement(current.values, featureKey);
    const targetOn = readBooleanEntitlement(target.values, featureKey);
    if (currentlyOn && !targetOn) {
      items.push({
        kind: "feature_loss",
        featureKey,
        label: labelFor(featureKey),
        detail: `${labelFor(featureKey)} will no longer be available for new writes. Existing records are kept.`,
      });
    }
  }

  const [activeSeats, activeCampuses, smsMeter] = await Promise.all([
    countActiveChurchMembers(churchId),
    countActiveCampuses(churchId),
    getSmsSegmentUsageMeter(churchId),
  ]);

  const seatLimit = readIntegerEntitlement(
    target.values,
    FEATURE_KEYS.USERS_ACTIVE_LIMIT,
  );
  if (!seatLimit.unlimited && seatLimit.limit !== null) {
    if (activeSeats > seatLimit.limit) {
      items.push({
        kind: "limit_exceeded",
        featureKey: FEATURE_KEYS.USERS_ACTIVE_LIMIT,
        label: labelFor(FEATURE_KEYS.USERS_ACTIVE_LIMIT),
        detail: `You have ${activeSeats} active members; ${toPlanDisplayName} allows ${seatLimit.limit}. New invites/reactivations will be blocked until under the limit. Members are not removed.`,
      });
    }
  }

  const campusLimit = readIntegerEntitlement(
    target.values,
    FEATURE_KEYS.CAMPUS_LIMIT,
  );
  const multiCampus = readBooleanEntitlement(
    target.values,
    FEATURE_KEYS.MULTI_CAMPUS,
  );
  if (activeCampuses > 1 && !multiCampus) {
    items.push({
      kind: "limit_exceeded",
      featureKey: FEATURE_KEYS.MULTI_CAMPUS,
      label: labelFor(FEATURE_KEYS.MULTI_CAMPUS),
      detail: `You have ${activeCampuses} active campuses; the target plan does not include multi-campus. Existing campuses are kept; creating additional campuses will be blocked.`,
    });
  } else if (
    !campusLimit.unlimited &&
    campusLimit.limit !== null &&
    activeCampuses > campusLimit.limit
  ) {
    items.push({
      kind: "limit_exceeded",
      featureKey: FEATURE_KEYS.CAMPUS_LIMIT,
      label: labelFor(FEATURE_KEYS.CAMPUS_LIMIT),
      detail: `You have ${activeCampuses} active campuses; ${toPlanDisplayName} allows ${campusLimit.limit}. Existing campuses are kept; activating more will be blocked.`,
    });
  }

  const smsLimit = readIntegerEntitlement(
    target.values,
    FEATURE_KEYS.SMS_MONTHLY_SEGMENT_LIMIT,
  );
  if (!smsLimit.unlimited && smsLimit.limit !== null) {
    if (smsMeter.quantityCommitted > smsLimit.limit) {
      items.push({
        kind: "limit_exceeded",
        featureKey: FEATURE_KEYS.SMS_MONTHLY_SEGMENT_LIMIT,
        label: labelFor(FEATURE_KEYS.SMS_MONTHLY_SEGMENT_LIMIT),
        detail: `This period has ${smsMeter.quantityCommitted} SMS segments committed; ${toPlanDisplayName} allows ${smsLimit.limit}. Further SMS sends will be blocked until the next period or an upgrade.`,
      });
    }
  }

  const photoCount = readIntegerEntitlement(
    target.values,
    FEATURE_KEYS.INCIDENT_PHOTO_COUNT_LIMIT,
  );
  const photosEnabled = readBooleanEntitlement(
    target.values,
    FEATURE_KEYS.INCIDENT_PHOTOS,
  );
  if (!photosEnabled || (photoCount.limit !== null && photoCount.limit === 0)) {
    const currentlyPhotos = readBooleanEntitlement(
      current.values,
      FEATURE_KEYS.INCIDENT_PHOTOS,
    );
    if (currentlyPhotos) {
      // already covered by boolean compare; keep single message
    }
  }

  const blocking = items.some((item) => item.kind === "limit_exceeded");
  let summary: string;
  if (same) {
    summary = "This is your current plan.";
  } else if (upgrade) {
    summary =
      items.length === 0
        ? `Upgrade to ${toPlanDisplayName} unlocks additional features.`
        : `Upgrade to ${toPlanDisplayName}. Review notes below.`;
  } else if (downgrade) {
    summary =
      items.length === 0
        ? `Downgrade to ${toPlanDisplayName} keeps existing data. No over-limit issues detected.`
        : `Downgrade to ${toPlanDisplayName} preserves data but may block some writes. Review impacts below.`;
  } else {
    summary = `Plan change to ${toPlanDisplayName}.`;
  }

  return {
    fromPlanKey,
    toPlanKey,
    fromPlanDisplayName,
    toPlanDisplayName,
    isDowngrade: downgrade,
    isUpgrade: upgrade,
    isSamePlan: same,
    blocking,
    items,
    summary,
  };
}
