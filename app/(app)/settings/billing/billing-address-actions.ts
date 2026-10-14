"use server";

import { revalidatePath } from "next/cache";
import { requireBillingManageAccess } from "@/lib/billing/access";
import { validateOrganizationBillingAddress } from "@/lib/billing/organization-billing-address";
import { persistOrganizationBillingAddress } from "@/lib/billing/stripe/billing-address-live";

export type BillingAddressActionState = {
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
};

export async function saveOrganizationBillingAddressAction(
  _previous: BillingAddressActionState,
  formData: FormData,
): Promise<BillingAddressActionState> {
  try {
    const { church, user } = await requireBillingManageAccess();
    const validated = validateOrganizationBillingAddress({
      businessName: formData.get("businessName"),
      line1: formData.get("line1"),
      line2: formData.get("line2"),
      city: formData.get("city"),
      state: formData.get("state"),
      postalCode: formData.get("postalCode"),
      country: formData.get("country"),
    });
    if (!validated.ok) {
      return { error: "Check the billing address.", fieldErrors: validated.fieldErrors };
    }

    const saved = await persistOrganizationBillingAddress({
      organizationId: church.id,
      actorUserId: user.id,
      address: validated.address,
    });
    if (!saved.ok) return { error: saved.error };

    revalidatePath("/settings/billing");
    if (saved.sync === "needs_attention") {
      return {
        message: "Billing address was saved, but Stripe synchronization needs attention.",
      };
    }
    return { message: "Billing address saved." };
  } catch {
    return { error: "The billing address could not be saved." };
  }
}
