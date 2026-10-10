/**
 * How feature entitlements are chosen for an organization.
 * A current subscription (including one scheduled to cancel) uses that plan.
 * A finally cancelled subscription is not a free/default plan and not a
 * lingering paid plan. No subscription row at all still uses the default plan.
 */
export type ChurchEntitlementSource = "current" | "none" | "default";

export function resolveChurchEntitlementSource(input: {
  hasCurrentSubscription: boolean;
  latestStatus: string | null;
}): ChurchEntitlementSource {
  if (input.hasCurrentSubscription) return "current";
  if ((input.latestStatus ?? "").trim() === "cancelled") return "none";
  return "default";
}
