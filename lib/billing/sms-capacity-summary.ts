/**
 * Billing-page display of application SMS capacity.
 * Matches SMS-A: included remaining, then purchased balance minus reserved.
 * A missing purchased-balance row displays as zero and is not created.
 */

export type ApplicationSmsCapacitySummary = {
  includedLimit: number;
  includedUsed: number;
  includedReserved: number;
  remainingIncluded: number;
  purchasedBalance: number;
  purchasedReserved: number;
  purchasedAvailable: number;
  totalAvailable: number;
};

export function summarizeApplicationSmsCapacity(input: {
  includedLimit: number | null;
  includedUsed: number;
  includedReserved: number;
  purchasedBalance: number | null;
  purchasedReserved: number | null;
}): ApplicationSmsCapacitySummary {
  const includedLimit = Math.max(0, input.includedLimit ?? 0);
  const includedUsed = Math.max(0, input.includedUsed);
  const includedReserved = Math.max(0, input.includedReserved);
  const purchasedBalance = Math.max(0, input.purchasedBalance ?? 0);
  const purchasedReserved = Math.max(0, input.purchasedReserved ?? 0);
  const remainingIncluded = Math.max(
    0,
    includedLimit - includedUsed - includedReserved,
  );
  const purchasedAvailable = Math.max(0, purchasedBalance - purchasedReserved);
  return {
    includedLimit,
    includedUsed,
    includedReserved,
    remainingIncluded,
    purchasedBalance,
    purchasedReserved,
    purchasedAvailable,
    totalAvailable: remainingIncluded + purchasedAvailable,
  };
}
