/**
 * Billing-address save order. No database, Stripe, or network calls.
 * The local profile update must succeed before Stripe synchronization.
 */

export type BillingAddressSaveResult =
  | { ok: true; sync: "synced" | "needs_attention" }
  | { ok: false; error: string };

export const BILLING_ADDRESS_LOCAL_SAVE_ERROR = "The billing address could not be saved.";

export async function orchestrateOrganizationBillingAddressSave(input: {
  ensureProfile: () => Promise<{ ok: true } | { ok: false; code?: string | null }>;
  updateAddress: () => Promise<
    { ok: true; rowCount: number } | { ok: false; code?: string | null }
  >;
  audit: () => Promise<{ ok: boolean }>;
  syncStripe: () => Promise<"synced" | "needs_attention">;
}): Promise<BillingAddressSaveResult> {
  const ensured = await input.ensureProfile();
  if (!ensured.ok) {
    return { ok: false, error: BILLING_ADDRESS_LOCAL_SAVE_ERROR };
  }

  const updated = await input.updateAddress();
  if (!updated.ok || updated.rowCount < 1) {
    return { ok: false, error: BILLING_ADDRESS_LOCAL_SAVE_ERROR };
  }

  await input.audit();

  try {
    const sync = await input.syncStripe();
    return { ok: true, sync };
  } catch {
    return { ok: true, sync: "needs_attention" };
  }
}
