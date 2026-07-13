"use server";

import { revalidatePath } from "next/cache";
import { setActiveChurchForUser } from "@/lib/church/context";
import { ChurchAccessError } from "@/lib/church/errors";
import type { ActionState } from "@/lib/church/types";

export async function switchActiveChurch(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const churchId = String(formData.get("church_id") ?? "").trim();

  if (!churchId) {
    return { error: "Select a church to continue." };
  }

  try {
    await setActiveChurchForUser(churchId);
  } catch (error) {
    if (error instanceof ChurchAccessError) {
      return { error: error.message };
    }
    return { error: "Unable to switch churches." };
  }

  revalidatePath("/", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/select-church");
  return { success: true };
}

/** Persist a server-validated church id into the httpOnly cookie. */
export async function syncActiveChurchCookie(churchId: string): Promise<void> {
  const id = churchId.trim();
  if (!id) return;
  await setActiveChurchForUser(id);
}
