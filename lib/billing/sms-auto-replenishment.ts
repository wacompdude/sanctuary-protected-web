/**
 * Application SMS auto-replenishment rules.
 *
 * These helpers do not enable a production organization, call Stripe, or
 * write configuration. Persistence is the service-role SQL in migration 110.
 * This module is not a Server Action and is not wired to the Billing page.
 */

import { commercialPlanByKey } from "@/lib/billing/commercial-catalog";

export const SMS_AUTO_REPLENISHMENT_TEXT_VERSION = "sms_auto_replenishment_v1";

/** $500 per subscription period. */
export const SMS_AUTO_REPLENISHMENT_MAX_SPEND_CENTS = 50_000;

const MANAGE_ROLES = new Set(["owner", "co_owner"]);

export function canManageSmsAutoReplenishment(role: string): boolean {
  return MANAGE_ROLES.has(role);
}

export function defaultSmsAutoReplenishmentThreshold(
  planKey: string,
): number | null {
  return commercialPlanByKey(planKey)?.suggestedLowBalanceThreshold ?? null;
}

export function thresholdIsValid(
  packageSegments: number,
  threshold: number,
): boolean {
  return (
    Number.isInteger(packageSegments) &&
    packageSegments > 1 &&
    Number.isInteger(threshold) &&
    threshold >= 1 &&
    threshold < packageSegments
  );
}

export function spendCapIsValid(
  packagePriceCents: number,
  capCents: number,
): boolean {
  return (
    Number.isInteger(packagePriceCents) &&
    packagePriceCents > 0 &&
    Number.isInteger(capCents) &&
    capCents >= packagePriceCents &&
    capCents <= SMS_AUTO_REPLENISHMENT_MAX_SPEND_CENTS
  );
}

export function priceIncreaseRequiresReauthorization(
  authorizedPackagePriceCents: number,
  currentPackagePriceCents: number,
): boolean {
  return currentPackagePriceCents > authorizedPackagePriceCents;
}

/** Total available application SMS capacity at or under the threshold qualifies. */
export function totalAvailableQualifies(
  totalAvailable: number,
  threshold: number,
): boolean {
  return totalAvailable <= threshold;
}

/**
 * Succeeded automatic spend in the current subscription period, plus any open
 * attempt amount, plus the current package price. Manual purchases are not
 * part of `automaticSpendCents`.
 */
export function packageFitsAutomaticCap(input: {
  automaticSpendCents: number;
  openAttemptCents: number;
  packagePriceCents: number;
  maxAutoSpendCents: number;
}): boolean {
  return (
    input.automaticSpendCents +
      input.openAttemptCents +
      input.packagePriceCents <=
    input.maxAutoSpendCents
  );
}

export function automaticReplenishmentGrantKey(attemptId: string): string {
  return `sms:auto:${attemptId}`;
}

export function automaticReplenishmentProviderKey(attemptId: string): string {
  return `sms_auto_pi_${attemptId}`;
}
