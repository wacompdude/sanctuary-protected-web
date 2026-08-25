import { FEATURE_KEYS } from "@/lib/subscriptions/feature-keys";
import { hasFeature } from "@/lib/subscriptions/resolver";
import { TRAINING_UPGRADE_MESSAGE } from "@/lib/training/constants";
import type { TrainingAccessResult } from "@/lib/training/types";

export async function getTrainingAccess(
  organizationId: string,
): Promise<TrainingAccessResult> {
  const featureAccess = await hasFeature({
    organizationId,
    featureKey: FEATURE_KEYS.TRAINING_MANAGEMENT,
  });

  return {
    allowed: featureAccess.allowed,
    upgradeMessage:
      featureAccess.upgradeMessage ??
      featureAccess.reason ??
      TRAINING_UPGRADE_MESSAGE,
  };
}
