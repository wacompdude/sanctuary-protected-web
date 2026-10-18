/**
 * Application SMS auto-replenishment rules.
 *
 * These helpers do not enable a production organization, call Stripe, or
 * write configuration. Persistence is the service-role SQL in migration 110.
 * This module is not a Server Action and is not wired to the Billing page.
 */

import { commercialPlanByKey } from "@/lib/billing/commercial-catalog";

export const SMS_AUTO_REPLENISHMENT_TEXT_VERSION = "sms_auto_replenishment_v1";

export const SMS_AUTO_REPLENISHMENT_AUTHORIZATION_TEXT =
  "I authorize Sanctuary Protected LLC to charge the saved automatic SMS payment method when the application text credits available to this organization reach the selected threshold. Each charge buys this plan's SMS credit package at its current package price. Sales tax is added. Automatic charges in a subscription billing period stop when they reach the spending limit I selected. I can turn automatic replenishment off. These purchases are for Application SMS only. MFA and security verification texts are not included.";

/** Selectable automatic spending limits. $5 is intentionally absent. */
export const SMS_AUTO_REPLENISHMENT_SPEND_CHOICES_CENTS = [
  1_000, 2_500, 5_000, 10_000, 25_000, 50_000,
] as const;

/** $500 per subscription period. */
export const SMS_AUTO_REPLENISHMENT_MAX_SPEND_CENTS = 50_000;

const MANAGE_ROLES = new Set(["owner", "co_owner"]);

export function canManageSmsAutoReplenishment(role: string): boolean {
  return MANAGE_ROLES.has(role);
}

export function customerSmsAutoReplenishmentStatus(
  status: string | null | undefined,
): string {
  switch (status) {
    case "enabled":
      return "Automatic replenishment is on";
    case "payment_attention_required":
      return "Automatic replenishment is paused until the payment method is updated";
    case "authorization_review_required":
      return "Review and reauthorize automatic replenishment";
    case "tax_attention_required":
      return "Billing address or tax information needs attention";
    default:
      return "Automatic replenishment is off";
  }
}

export type SmsAutoReplenishmentDecision =
  | { ok: true }
  | { ok: false; reason: string };

/** Customer-controlled enablement checks. Package price and size come from the server. */
export function evaluateSmsAutoReplenishmentEnable(input: {
  role: string;
  authorizationAccepted: boolean;
  threshold: number;
  capCents: number;
  packageSegments: number;
  packagePriceCents: number;
  hasPaymentMethod: boolean;
}): SmsAutoReplenishmentDecision {
  if (!canManageSmsAutoReplenishment(input.role)) {
    return { ok: false, reason: "forbidden" };
  }
  if (input.authorizationAccepted !== true) {
    return { ok: false, reason: "authorization_required" };
  }
  if (!input.hasPaymentMethod) {
    return { ok: false, reason: "payment_method_missing" };
  }
  if (!thresholdIsValid(input.packageSegments, input.threshold)) {
    return { ok: false, reason: "threshold_invalid" };
  }
  if (!spendChoiceIsOffered(input.capCents) || !spendCapIsValid(input.packagePriceCents, input.capCents)) {
    return { ok: false, reason: "spending_cap_invalid" };
  }
  return { ok: true };
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

export function spendChoiceIsOffered(capCents: number): boolean {
  return (SMS_AUTO_REPLENISHMENT_SPEND_CHOICES_CENTS as readonly number[]).includes(
    capCents,
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
