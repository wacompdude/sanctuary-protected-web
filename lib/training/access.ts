import { FEATURE_KEYS } from "@/lib/subscriptions/feature-keys";
import { hasFeature } from "@/lib/subscriptions/resolver";
import { TRAINING_UPGRADE_MESSAGE } from "@/lib/training/constants";
import type { TrainingAccessResult } from "@/lib/training/types";

export async function getTrainingAccess(
  churchId: string,
): Promise<TrainingAccessResult> {
  const featureAccess = await hasFeature({
    churchId,
    featureKey: FEATURE_KEYS.TRAINING_MANAGEMENT,
  });

  if (featureAccess.allowed) {
    return { allowed: true, upgradeMessage: TRAINING_UPGRADE_MESSAGE };
  }

  return {
    allowed: false,
    upgradeMessage: TRAINING_UPGRADE_MESSAGE,
  };
}
