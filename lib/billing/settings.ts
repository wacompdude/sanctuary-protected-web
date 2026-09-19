/**
 * Platform billing settings helpers.
 * Trial length defaults to 7 days (billing_settings.trial_days).
 */

export const DEFAULT_BILLING_TRIAL_DAYS = 7;
export const DEFAULT_BILLING_PERIOD_DAYS = 30;

/**
 * Fallback when DB settings are unavailable (pre-migration or read failure).
 * Prefer `getBillingTrialDays()` when a client is available.
 */
export function resolveTrialPeriodDays(periodDays?: number | null): number {
  if (periodDays != null && Number.isFinite(periodDays) && periodDays >= 0) {
    return Math.floor(periodDays);
  }
  return DEFAULT_BILLING_TRIAL_DAYS;
}
