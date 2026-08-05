"use server";

import { revalidatePath } from "next/cache";
import { setActiveChurchForUser } from "@/lib/organization/context";
import { ChurchAccessError } from "@/lib/organization/errors";
import type { ActionState } from "@/lib/organization/types";

export async function switchActiveChurch(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const organizationId = String(formData.get("organization_id") ?? "").trim();

  if (!organizationId) {
    return { error: "Select a church to continue." };
  }

  try {
    await setActiveChurchForUser(organizationId);
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
export async function syncActiveChurchCookie(organizationId: string): Promise<void> {
  const id = organizationId.trim();
  if (!id) return;
  await setActiveChurchForUser(id);
}
