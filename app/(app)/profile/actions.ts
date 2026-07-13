"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ProfileActionState } from "@/lib/profile/types";

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
