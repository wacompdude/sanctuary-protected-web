"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformPermission } from "@/lib/platform/auth";
import { requirePlatformAdminClient } from "@/lib/platform/queries";
import { SMS_REGION_MANAGE_PERMISSION } from "@/lib/sms/dialing-regions";

export type SmsRegionActionState = {
  error?: string;
  success?: boolean;
};

function checked(formData: FormData, name: string): boolean {
  const value = formData.get(name);
  return value === "on" || value === "true" || value === "1";
}

export async function updateSmsDialingRegionAction(
  _prev: SmsRegionActionState,
  formData: FormData,
): Promise<SmsRegionActionState> {
  try {
    await requirePlatformPermission(SMS_REGION_MANAGE_PERMISSION);
    const admin = requirePlatformAdminClient();
    const regionCode = String(formData.get("region_code") ?? "").trim();
    if (!/^[A-Z0-9_]{2,16}$/.test(regionCode)) {
      return { error: "Choose a platform SMS region." };
    }

    const { error } = await admin
      .from("sms_dialing_regions")
      .update({
        enabled: checked(formData, "enabled"),
        provider_ready: checked(formData, "provider_ready"),
      })
      .eq("region_code", regionCode);

    if (error) {
      return { error: "SMS region settings are not available yet." };
    }

    revalidatePath("/platform/sms");
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to update SMS regions.",
    };
  }
}
