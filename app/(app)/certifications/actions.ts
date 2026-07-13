"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import type { ActionState } from "@/lib/church/types";
import {
  parseCreateCertificationInput,
  validateCreateCertificationInput,
} from "@/lib/certifications/validation";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { getRequestIpAddress, writeAuditLog } from "@/lib/audit/log";

export async function createCertification(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const validation = validateCreateCertificationInput(formData);
  if (validation.error || validation.fieldErrors) {
    return validation;
  }

  try {
    const { supabase, user, profile, canManageCertifications } =
      await getAuthenticatedUserWithChurch();

    if (!canManageCertifications) {
      return {
        error:
          "Only administrators and security leaders can add certifications.",
      };
    }

    const input = parseCreateCertificationInput(formData);

    const { data: member, error: memberError } = await supabase
      .from("team_members")
      .select("id")
      .eq("id", input.team_member_id)
      .eq("church_id", profile.church_id)
      .maybeSingle();

    if (memberError || !member) {
      return { error: "Selected team member was not found for your church." };
    }

    const { data: certification, error: insertError } = await supabase
      .from("certifications")
      .insert({
        church_id: profile.church_id,
        team_member_id: input.team_member_id,
        certification_type: input.certification_type,
        issuer: input.issuer,
        issue_date: input.issue_date,
        expiration_date: input.expiration_date,
        certificate_number: input.certificate_number,
        created_by: user.id,
        user_id: user.id,
      })
      .select("id")
      .single();

    if (insertError) {
      return { error: insertError.message };
    }

    await writeAuditLog(supabase, {
      churchId: profile.church_id,
      userId: user.id,
      action: AuditAction.CERTIFICATION_CREATED,
      entityType: AuditEntityType.CERTIFICATION,
      entityId: certification?.id ?? null,
      metadata: {
        team_member_id: input.team_member_id,
        certification_type: input.certification_type,
        issuer: input.issuer,
        expiration_date: input.expiration_date,
      },
      ipAddress: await getRequestIpAddress(),
    });
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to create certification.",
    };
  }

  revalidatePath("/certifications");
  revalidatePath("/dashboard");
  redirect("/certifications?created=1");
}
