"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  validatePassword,
  validatePasswordConfirmation,
} from "@/lib/auth/validation";
import {
  AVATAR_ALLOWED_MIME,
  AVATAR_MAX_BYTES,
  PROFILE_AVATAR_BUCKET,
  isProfileAvatarStoragePath,
  profileAvatarObjectPath,
  validateAvatarFile,
} from "@/lib/profile/avatar-storage";
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

export async function uploadProfileAvatar(
  _prev: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const file = formData.get("avatar");
  const targetUserId = String(formData.get("user_id") ?? "").trim();

  if (!(file instanceof File) || file.size === 0) {
    return { fieldErrors: { avatar: "Choose a photo to upload." } };
  }

  const fileError = validateAvatarFile(file);
  if (fileError) {
    return { fieldErrors: { avatar: fileError } };
  }

  if (!AVATAR_ALLOWED_MIME.has(file.type) || file.size > AVATAR_MAX_BYTES) {
    return { fieldErrors: { avatar: "Invalid photo file." } };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { error: "You must be signed in to update a profile photo." };
    }

    const userId = targetUserId || user.id;
    const objectPath = profileAvatarObjectPath(userId, file.type);
    if (!objectPath) {
      return { fieldErrors: { avatar: "Unsupported image type." } };
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from(PROFILE_AVATAR_BUCKET)
      .upload(objectPath, bytes, {
        upsert: true,
        contentType: file.type,
        cacheControl: "3600",
      });

    if (uploadError) {
      return {
        error:
          uploadError.message.includes("Bucket not found") ||
          uploadError.message.includes("not found")
            ? "Run supabase/migrations/032_profile_avatars.sql in the Supabase SQL Editor, then try again."
            : uploadError.message || "Unable to upload photo.",
      };
    }

    const { error: updateError } = await supabase.rpc("set_profile_avatar_url", {
      p_user_id: userId,
      p_avatar_url: objectPath,
    });

    if (updateError) {
      return {
        error:
          updateError.message.includes("set_profile_avatar_url") ||
          updateError.message.includes("does not exist")
            ? "Run supabase/migrations/032_profile_avatars.sql in the Supabase SQL Editor, then try again."
            : updateError.message || "Unable to save profile photo.",
      };
    }

    revalidatePath("/profile");
    revalidatePath("/team");
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to upload profile photo.",
    };
  }
}

export async function removeProfileAvatar(
  _prev: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const targetUserId = String(formData.get("user_id") ?? "").trim();

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { error: "You must be signed in to remove a profile photo." };
    }

    const userId = targetUserId || user.id;

    const { data: profile } = await supabase
      .from("profiles")
      .select("avatar_url")
      .eq("id", userId)
      .maybeSingle();

    const currentPath =
      typeof profile?.avatar_url === "string" ? profile.avatar_url : null;

    const { error: updateError } = await supabase.rpc("set_profile_avatar_url", {
      p_user_id: userId,
      p_avatar_url: "",
    });

    if (updateError) {
      return {
        error:
          updateError.message.includes("set_profile_avatar_url") ||
          updateError.message.includes("does not exist")
            ? "Run supabase/migrations/032_profile_avatars.sql in the Supabase SQL Editor, then try again."
            : updateError.message || "Unable to remove profile photo.",
      };
    }

    if (currentPath && isProfileAvatarStoragePath(currentPath, userId)) {
      await supabase.storage.from(PROFILE_AVATAR_BUCKET).remove([currentPath]);
    }

    revalidatePath("/profile");
    revalidatePath("/team");
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to remove profile photo.",
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
