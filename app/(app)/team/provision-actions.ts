"use server";

import { revalidatePath } from "next/cache";
import { getOperationalChurchContext } from "@/lib/organization/auth";
import { canInviteMembers, isAllowedInviteRole } from "@/lib/organization/invitations";
import {
  validateProvisionMemberForm,
  type ProvisionMemberActionState,
} from "@/lib/organization/provision-member";
import { resolveProvisionCreateUserResult } from "@/lib/organization/provision-existing-user";
import {
  createAdminClient,
  isServiceRoleConfigured,
} from "@/lib/supabase/admin";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { getRequestIpAddress, writeAuditLog } from "@/lib/audit/log";
import {
  entitlementErrorMessage,
  requireActiveSeatCapacity,
} from "@/lib/subscriptions/enforcement";

export async function provisionChurchMember(
  _prev: ProvisionMemberActionState,
  formData: FormData,
): Promise<ProvisionMemberActionState> {
  if (!isServiceRoleConfigured()) {
    return {
      error:
        "Server is missing SUPABASE_SERVICE_ROLE_KEY. Add it to provision members with login credentials.",
    };
  }

  try {
    const { supabase, user, church, membership } =
      await getOperationalChurchContext();

    if (!canInviteMembers(membership.role)) {
      return {
        error: "You do not have permission to add members.",
      };
    }

    const validation = validateProvisionMemberForm(formData, membership.role);
    if (validation.fieldErrors || !validation.data) {
      return { fieldErrors: validation.fieldErrors };
    }

    const input = validation.data;

    if (!isAllowedInviteRole(membership.role, input.role)) {
      return {
        error: "You are not allowed to assign that role.",
        fieldErrors: { role: "That role is not available for your account." },
      };
    }

    await requireActiveSeatCapacity({ organizationId: church.id });

    const { data: emailTaken, error: emailCheckError } = await supabase.rpc(
      "organization_has_active_member_email",
      {
        p_organization_id: church.id,
        p_email: input.email,
      },
    );

    if (!emailCheckError && emailTaken === true) {
      return {
        error: "That email already has an active membership at this church.",
        fieldErrors: { email: "This person is already an active member." },
      };
    }

    const admin = createAdminClient();
    let targetUserId: string | null = null;
    let accountCreated = false;
    const provisionalPassword: string | null = input.password;

    const fullName = `${input.firstName} ${input.lastName}`.trim();
    const userMetadata = {
      first_name: input.firstName,
      last_name: input.lastName,
      full_name: fullName,
    };

    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email: input.email,
        password: input.password,
        email_confirm: true,
        user_metadata: userMetadata,
      });

    const forgedFlag =
      String(formData.get("reset_existing_password") ?? "") === "on" ||
      String(formData.get("reset_existing_password") ?? "") === "true";
    const createResolution = resolveProvisionCreateUserResult({
      createdUserId: created?.user?.id ?? null,
      createErrorMessage: createError?.message ?? null,
      resetExistingPassword: forgedFlag,
    });

    if (createResolution.kind === "create_failed") {
      return { error: createResolution.error };
    }

    if (createResolution.kind === "existing_user_refused") {
      // EML-05: never reset passwords, overwrite Auth metadata, attach
      // membership, or return credentials for an existing global identity.
      return {
        error: createResolution.decision.error,
        fieldErrors: { email: createResolution.decision.fieldError },
      };
    }

    targetUserId = createResolution.userId;
    accountCreated = true;

    await admin
      .from("profiles")
      .upsert(
        {
          id: targetUserId,
          first_name: input.firstName,
          last_name: input.lastName,
          full_name: fullName,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );

    const { data: attachResult, error: attachError } = await supabase.rpc(
      "attach_organization_membership",
      {
        p_organization_id: church.id,
        p_user_id: targetUserId,
        p_role: input.role,
      },
    );

    if (attachError || !attachResult) {
      if (accountCreated && targetUserId) {
        await admin.auth.admin.deleteUser(targetUserId);
      }

      const message = attachError?.message || "Unable to attach church access.";
      if (message.includes("020_provision") || message.includes("Could not find the function")) {
        return {
          error:
            "Run supabase/migrations/020_provision_church_member.sql in the Supabase SQL Editor, then try again.",
        };
      }
      if (message.includes("CONFLICT:")) {
        return {
          error: "That user already has an active membership at this church.",
          fieldErrors: { email: "This person is already an active member." },
        };
      }
      if (message.includes("FORBIDDEN:")) {
        return { error: "You are not allowed to assign that role." };
      }
      return { error: message };
    }

    const membershipId =
      typeof attachResult === "object" &&
      attachResult !== null &&
      "membership_id" in attachResult
        ? String((attachResult as { membership_id: string }).membership_id)
        : undefined;

    await writeAuditLog(supabase, {
      organizationId: church.id,
      userId: user.id,
      action: AuditAction.MEMBER_PROVISIONED,
      entityType: AuditEntityType.CHURCH_MEMBERSHIP,
      entityId: membershipId,
      metadata: {
        email: input.email,
        role: input.role,
        provisional_user_id: targetUserId,
        account_created: accountCreated,
        password_reset: false,
        provisioned_by: user.id,
      },
      ipAddress: await getRequestIpAddress(),
    });

    revalidatePath("/team");
    revalidatePath("/team/add");

    const state: ProvisionMemberActionState = {
      success: true,
      membershipId,
    };

    if (provisionalPassword) {
      state.credentials = {
        email: input.email,
        password: provisionalPassword,
        accountCreated,
        passwordReset: false,
      };
    }

    return state;
  } catch (error) {
    const entitlementMessage = entitlementErrorMessage(error);
    if (entitlementMessage) {
      return { error: entitlementMessage };
    }
    const message =
      error instanceof Error ? error.message : "Unable to add member.";
    if (message.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      return {
        error:
          "Server is missing SUPABASE_SERVICE_ROLE_KEY. Add it to provision members with login credentials.",
      };
    }
    return { error: message };
  }
}
