"use server";

import { revalidatePath } from "next/cache";
import {
  removeVerifiedPhone,
  startPhoneEnrollment,
  verifyPhoneEnrollment,
} from "@/lib/mfa/enroll-phone";
import type { MfaActionState } from "@/lib/mfa/types";

export async function startBackupPhoneAction(
  _prev: MfaActionState,
  formData: FormData,
): Promise<MfaActionState> {
  const phone = String(formData.get("phone") ?? "");
  const currentPassword = String(formData.get("current_password") ?? "");
  try {
    return await startPhoneEnrollment(phone, currentPassword);
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to send the verification Text/SMS.",
    };
  }
}

export async function verifyBackupPhoneAction(
  _prev: MfaActionState,
  formData: FormData,
): Promise<MfaActionState> {
  const code = String(formData.get("code") ?? "");
  try {
    const result = await verifyPhoneEnrollment(code);
    if (result.verified) {
      revalidatePath("/profile");
    }
    return result;
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to verify that phone number.",
    };
  }
}

export async function removeBackupPhoneAction(
  _prev: MfaActionState,
  formData: FormData,
): Promise<MfaActionState> {
  const currentPassword = String(formData.get("current_password") ?? "");
  try {
    const result = await removeVerifiedPhone(currentPassword);
    revalidatePath("/profile");
    return result;
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to remove the backup phone number.",
    };
  }
}
