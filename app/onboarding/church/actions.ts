"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { writeActiveChurchCookie } from "@/lib/organization/cookie";
import { setActiveChurchForUser } from "@/lib/organization/context";
import type { ActionState } from "@/lib/organization/types";
import {
  CHURCH_CREATE_GENERIC_ERROR,
  mapChurchCreateRpcError,
  validateChurchOnboarding,
} from "@/lib/organization/onboarding";
import {
  isOrganizationSlugConflict,
  ORGANIZATION_SLUG_MAX_ALLOCATION_ATTEMPTS,
  uniqueOrganizationSlugCandidate,
} from "@/lib/organization/slug";
import { isServiceRoleConfigured } from "@/lib/supabase/admin";
import { ensureChurchSubscription } from "@/lib/subscriptions/mutations";

type CreateRpcResult = {
  data: unknown;
  error: { message: string } | null;
};

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

  const baseArgs = {
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
  };

  async function rpcCreate(slug: string | null): Promise<CreateRpcResult> {
    const rpcArgs =
      slug === null
        ? baseArgs
        : { ...baseArgs, p_slug: slug };

    let { data, error } = await supabase.rpc(
      "create_organization_with_owner",
      rpcArgs,
    );

    if (
      error &&
      /PGRST202|schema cache|could not find the function/i.test(error.message)
    ) {
      ({ data, error } = await supabase.rpc(
        "create_organization_with_owner",
        baseArgs,
      ));
    }

    return { data, error: error ? { message: error.message } : null };
  }

  let data: unknown = null;
  let lastError: string | null = null;

  for (
    let attempt = 1;
    attempt <= ORGANIZATION_SLUG_MAX_ALLOCATION_ATTEMPTS;
    attempt += 1
  ) {
    const candidate = uniqueOrganizationSlugCandidate(input.slug, attempt);
    const result = await rpcCreate(candidate);
    if (!result.error) {
      data = result.data;
      lastError = null;
      break;
    }

    lastError = result.error.message;
    if (
      isOrganizationSlugConflict(lastError) &&
      attempt < ORGANIZATION_SLUG_MAX_ALLOCATION_ATTEMPTS
    ) {
      continue;
    }
    break;
  }

  if (lastError) {
    console.error("Church onboarding create failed:", lastError);
    return mapChurchCreateRpcError(lastError);
  }

  if (!data) {
    console.error("Church onboarding create returned no result.");
    return { error: CHURCH_CREATE_GENERIC_ERROR };
  }

  const payload =
    typeof data === "object" && data !== null
      ? (data as { organization_id?: string })
      : null;

  if (payload?.organization_id) {
    try {
      await setActiveChurchForUser(payload.organization_id);
    } catch {
      await writeActiveChurchCookie(payload.organization_id);
    }

    if (isServiceRoleConfigured()) {
      try {
        await ensureChurchSubscription({
          organizationId: payload.organization_id,
          status: "trialing",
          periodDays: 30,
          userId: user.id,
          source: "church_onboarding",
          reason: "Default trial subscription for new church",
        });
      } catch (subscriptionError) {
        console.error(
          "Failed to assign default church subscription during onboarding:",
          subscriptionError,
        );
      }
    }
  }

  revalidatePath("/", "layout");
  revalidatePath("/select-church");
  revalidatePath("/home");
  redirect("/home");
}
