import { subscriptionGrantsAccess } from "@/lib/subscriptions/status";

/**
 * How feature entitlements are chosen for an organization.
 * A current access-granting subscription, including one scheduled to cancel,
 * uses that plan. A current row that does not grant access, and a final
 * non-granting status, grant nothing. No subscription row at all still uses
 * the default plan so invite acceptance is not blocked by hidden RLS.
 */
export type ChurchEntitlementSource = "current" | "none" | "default";

export function resolveChurchEntitlementSource(input: {
  hasCurrentSubscription: boolean;
  /** Status of the current lookup row. Omitted only by callers that already know it grants access. */
  currentStatus?: string | null;
  latestStatus: string | null;
}): ChurchEntitlementSource {
  if (input.hasCurrentSubscription) {
    const status = (input.currentStatus ?? "").trim();
    if (status && !subscriptionGrantsAccess(status)) return "none";
    return "current";
  }

  const latest = (input.latestStatus ?? "").trim();
  if (latest && !subscriptionGrantsAccess(latest)) return "none";
  return "default";
}
