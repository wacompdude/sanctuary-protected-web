"use server";

import { revalidatePath } from "next/cache";
import { getOperationalChurchContext } from "@/lib/church/auth";
import { canInviteMembers, isAllowedInviteRole } from "@/lib/church/invitations";
import {
  validateProvisionMemberForm,
  type ProvisionMemberActionState,
} from "@/lib/church/provision-member";
import {
  createAdminClient,
  isServiceRoleConfigured,
} from "@/lib/supabase/admin";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { getRequestIpAddress, writeAuditLog } from "@/lib/audit/log";

function isAlreadyRegisteredError(message: string | undefined): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes("already been registered") ||
    lower.includes("already registered") ||
    lower.includes("user already exists") ||
    lower.includes("email_exists")
  );
}

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

    const { data: emailTaken, error: emailCheckError } = await supabase.rpc(
      "church_has_active_member_email",
      {
        p_church_id: church.id,
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
    let passwordReset = false;
    let provisionalPassword: string | null = input.password;

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

    if (createError || !created.user) {
      if (!isAlreadyRegisteredError(createError?.message)) {
        return {
          error:
            createError?.message ||
            "Unable to create the login account for this member.",
        };
      }

      const { data: existingUserId, error: lookupError } = await admin.rpc(
        "get_auth_user_id_by_email",
        { p_email: input.email },
      );

      if (lookupError || !existingUserId) {
        return {
          error:
            lookupError?.message ||
            "That email is already registered, but the account could not be looked up. Run migration 020_provision_church_member.sql, then try again.",
        };
      }

      targetUserId = existingUserId as string;
      provisionalPassword = null;

      if (input.resetExistingPassword) {
        const { error: updateError } = await admin.auth.admin.updateUserById(
          targetUserId,
          {
            password: input.password,
            email_confirm: true,
            user_metadata: userMetadata,
          },
        );
        if (updateError) {
          return {
            error:
              updateError.message ||
              "Unable to reset the password for the existing account.",
          };
        }
        provisionalPassword = input.password;
        passwordReset = true;
      } else {
        await admin.auth.admin.updateUserById(targetUserId, {
          user_metadata: userMetadata,
        });
      }
    } else {
      targetUserId = created.user.id;
      accountCreated = true;
    }

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
      "attach_church_membership",
      {
        p_church_id: church.id,
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
      churchId: church.id,
      userId: user.id,
      action: AuditAction.MEMBER_PROVISIONED,
      entityType: AuditEntityType.CHURCH_MEMBERSHIP,
      entityId: membershipId,
      metadata: {
        email: input.email,
        role: input.role,
        provisional_user_id: targetUserId,
        account_created: accountCreated,
        password_reset: passwordReset,
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
        passwordReset,
      };
    }

    return state;
  } catch (error) {
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
