"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  validatePassword,
  validatePasswordConfirmation,
} from "@/lib/auth/validation";
import type {
  ChangePasswordActionState,
  ProfileActionState,
} from "@/lib/profile/types";

function optionalText(value: FormDataEntryValue | null, max = 100): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

export async function updateOwnProfile(
  _prev: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const firstName = optionalText(formData.get("first_name"));
  const lastName = optionalText(formData.get("last_name"));
  const phone = optionalText(formData.get("phone"), 40);

  const fieldErrors: ProfileActionState["fieldErrors"] = {};
  if (formData.get("first_name") && !firstName) {
    fieldErrors.first_name = "First name cannot be only spaces.";
  }
  if (formData.get("last_name") && !lastName) {
    fieldErrors.last_name = "Last name cannot be only spaces.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { error: "You must be signed in to update your profile." };
    }

    const fullName =
      [firstName, lastName].filter(Boolean).join(" ").trim() || null;

    // Only allowed identity fields — never id, church, or role.
    const { error } = await supabase
      .from("profiles")
      .update({
        first_name: firstName,
        last_name: lastName,
        phone,
        full_name: fullName,
      })
      .eq("id", user.id);

    if (error) {
      return { error: error.message };
    }

    revalidatePath("/profile");
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to update your profile.",
    };
  }
}

export async function changeOwnPassword(
  _prev: ChangePasswordActionState,
  formData: FormData,
): Promise<ChangePasswordActionState> {
  const currentPassword = String(formData.get("current_password") ?? "");
  const newPassword = String(formData.get("new_password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");

  const fieldErrors: NonNullable<ChangePasswordActionState["fieldErrors"]> =
    {};

  if (!currentPassword) {
    fieldErrors.current_password = "Current password is required.";
  }

  const newPasswordError = validatePassword(newPassword);
  if (newPasswordError) {
    fieldErrors.new_password = newPasswordError;
  }

  const confirmError = validatePasswordConfirmation(
    newPassword,
    confirmPassword,
  );
  if (confirmError) {
    fieldErrors.confirm_password = confirmError;
  }

  if (
    !fieldErrors.new_password &&
    currentPassword &&
    newPassword === currentPassword
  ) {
    fieldErrors.new_password =
      "Choose a new password that is different from your current one.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user?.email) {
      return { error: "You must be signed in to change your password." };
    }

    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (verifyError) {
      return {
        fieldErrors: {
          current_password: "Current password is incorrect.",
        },
      };
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      return { error: updateError.message || "Unable to update password." };
    }

    revalidatePath("/profile");
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to change your password.",
    };
  }
}
