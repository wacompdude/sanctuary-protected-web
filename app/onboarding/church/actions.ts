"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { writeActiveChurchCookie } from "@/lib/organization/cookie";
import { setActiveChurchForUser } from "@/lib/organization/context";
import type { ActionState } from "@/lib/organization/types";
import { validateChurchOnboarding } from "@/lib/organization/onboarding";
import { SLUG_DUPLICATE_MESSAGE } from "@/lib/organization/slug";
import { isServiceRoleConfigured } from "@/lib/supabase/admin";
import { ensureChurchSubscription } from "@/lib/subscriptions/mutations";

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

  const rpcArgs = {
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
    p_slug: input.slug,
  };

  let { data, error } = await supabase.rpc(
    "create_organization_with_owner",
    rpcArgs,
  );

  if (
    error &&
    /PGRST202|schema cache|could not find the function/i.test(error.message)
  ) {
    const { p_slug: _omitted, ...legacyArgs } = rpcArgs;
    ({ data, error } = await supabase.rpc(
      "create_organization_with_owner",
      legacyArgs,
    ));
  }

  if (error) {
    const message = error.message || "Unable to create your church.";
    if (message.includes("UNAUTHENTICATED")) {
      return { error: "You must be signed in to create a church." };
    }
    if (message.includes("VALIDATION:")) {
      const text = message.replace(/^.*VALIDATION:\s*/i, "");
      if (/slug/i.test(text)) {
        return {
          fieldErrors: {
            slug: /already in use/i.test(text) ? SLUG_DUPLICATE_MESSAGE : text,
          },
        };
      }
      return { error: text };
    }
    if (
      message.toLowerCase().includes("duplicate") &&
      message.toLowerCase().includes("slug")
    ) {
      return {
        fieldErrors: {
          slug: SLUG_DUPLICATE_MESSAGE,
        },
      };
    }
    if (message.toLowerCase().includes("already in use")) {
      return {
        fieldErrors: { slug: SLUG_DUPLICATE_MESSAGE },
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
