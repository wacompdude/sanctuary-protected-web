"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { writeActiveChurchCookie } from "@/lib/church/cookie";
import { setActiveChurchForUser } from "@/lib/church/context";
import type { ActionState } from "@/lib/church/types";
import { validateChurchOnboarding } from "@/lib/church/onboarding";

export async function createChurchOnboarding(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const validation = validateChurchOnboarding(formData);
  if (validation.fieldErrors || !validation.data) {
    return { fieldErrors: validation.fieldErrors };
  }

  const input = validation.data;
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "You must be signed in to create a church." };
  }

  const { data, error } = await supabase.rpc("create_church_with_owner", {
    p_name: input.name,
    p_primary_email: input.primary_email,
    p_phone: input.phone,
    p_address_line_1: input.address_line_1,
    p_address_line_2: input.address_line_2 ?? null,
    p_city: input.city,
    p_state: input.state,
    p_postal_code: input.postal_code,
    p_timezone: input.timezone,
    p_campus_name: input.campus_name,
  });

  if (error) {
    const message = error.message || "Unable to create your church.";
    if (message.includes("UNAUTHENTICATED")) {
      return { error: "You must be signed in to create a church." };
    }
    if (message.includes("VALIDATION:")) {
      return { error: message.replace(/^.*VALIDATION:\s*/i, "") };
    }
    if (
      message.toLowerCase().includes("duplicate") &&
      message.toLowerCase().includes("slug")
    ) {
      return {
        error:
          "That church name produces a slug that is already taken. Try a different name.",
      };
    }
    if (message.includes("FORBIDDEN: cannot create your own membership")) {
      return {
        error:
          "Unable to create owner membership for the new church. Ensure membership bootstrap rules are applied (migration 013/014).",
      };
    }
    return { error: message };
  }

  if (!data) {
    return { error: "Church creation did not return a result." };
  }

  const payload =
    typeof data === "object" && data !== null
      ? (data as { church_id?: string })
      : null;

  if (payload?.church_id) {
    try {
      await setActiveChurchForUser(payload.church_id);
    } catch {
      await writeActiveChurchCookie(payload.church_id);
    }
  }

  revalidatePath("/", "layout");
  revalidatePath("/select-church");
  revalidatePath("/dashboard");
  redirect("/dashboard");
}
