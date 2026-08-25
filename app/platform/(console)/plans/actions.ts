"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformPermission } from "@/lib/platform/auth";
import { updatePlanFeatureAssignment } from "@/lib/platform/plan-catalog-admin";

export async function updatePlanFeatureAction(formData: FormData): Promise<{
  error?: string;
}> {
  try {
    const context = await requirePlatformPermission("plans.manage");
    const planKey = String(formData.get("plan_key") ?? "").trim();
    const featureId = String(formData.get("feature_id") ?? "").trim();
    const valueType = String(formData.get("value_type") ?? "boolean");
    if (!planKey || !featureId) {
      return { error: "Plan and feature are required." };
    }

    if (valueType === "integer") {
      const unlimited = String(formData.get("unlimited") ?? "") === "1";
      const raw = String(formData.get("integer_value") ?? "").trim();
      const integerValue = unlimited ? null : Number(raw);
      if (!unlimited && !Number.isFinite(integerValue)) {
        return { error: "Enter a valid limit or mark the feature unlimited." };
      }
      await updatePlanFeatureAssignment({
        planKey,
        featureId,
        unlimited,
        integerValue,
        actorUserId: context.user.id,
        platformAccountId: context.account.id,
      });
    } else {
      await updatePlanFeatureAssignment({
        planKey,
        featureId,
        enabled: String(formData.get("enabled") ?? "") === "1",
        actorUserId: context.user.id,
        platformAccountId: context.account.id,
      });
    }

    revalidatePath("/platform/plans");
    revalidatePath(`/platform/plans/${planKey}`);
    revalidatePath("/platform/features");
    revalidatePath("/settings/plans");
    return {};
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to update feature.",
    };
  }
}
