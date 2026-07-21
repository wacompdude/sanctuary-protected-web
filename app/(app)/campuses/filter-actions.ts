"use server";

import { revalidatePath } from "next/cache";
import { CAMPUS_FILTER_ALL } from "@/lib/campuses/constants";
import {
  clearActiveCampusCookie,
  writeActiveCampusCookie,
} from "@/lib/campuses/filter-cookie";
import { listAccessibleCampuses } from "@/lib/campuses/filter";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
} from "@/lib/church/auth";
import type { ActionState } from "@/lib/church/types";

export async function setActiveCampusFilterAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { church, user, membership } = await getAuthenticatedUserWithChurch();
    const raw = String(formData.get("campus_id") ?? "").trim();

    if (!raw || raw === CAMPUS_FILTER_ALL || raw === "all") {
      await writeActiveCampusCookie(CAMPUS_FILTER_ALL);
      revalidatePath("/", "layout");
      revalidatePath("/dashboard");
      return { success: true };
    }

    const { campuses } = await listAccessibleCampuses({
      churchId: church.id,
      userId: user.id,
      role: membership.role,
    });

    const allowed = campuses.some((campus) => campus.id === raw);
    if (!allowed) {
      return { error: "You do not have access to that campus." };
    }

    await writeActiveCampusCookie(raw);
    revalidatePath("/", "layout");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    if (error instanceof ChurchAccessError) {
      return { error: error.message };
    }
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to update campus filter.",
    };
  }
}

/** Reset campus filter to All Campuses (e.g. when switching churches). */
export async function resetCampusFilterAction(): Promise<void> {
  await clearActiveCampusCookie();
}
