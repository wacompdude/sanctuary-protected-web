"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import type { ActionState } from "@/lib/church/types";
import {
  parseCreateTeamMemberInput,
  validateCreateTeamMemberInput,
} from "@/lib/certifications/validation";

export async function createTeamMember(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const validation = validateCreateTeamMemberInput(formData);
  if (validation.error || validation.fieldErrors) {
    return validation;
  }

  try {
    const { supabase, user, profile, canManageCertifications } =
      await getAuthenticatedUserWithChurch();

    if (!canManageCertifications) {
      return {
        error:
          "Only administrators and security leaders can add team members.",
      };
    }

    const input = parseCreateTeamMemberInput(formData);

    const { error } = await supabase.from("team_members").insert({
      church_id: profile.church_id,
      full_name: input.full_name,
      email: input.email,
      title: input.title,
      created_by: user.id,
    });

    if (error) {
      return { error: error.message };
    }
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to create team member.",
    };
  }

  revalidatePath("/team");
  revalidatePath("/certifications");
  redirect("/team?created=1");
}
