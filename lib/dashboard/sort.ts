/**
 * Display-only dashboard box ordering.
 * Never mutates stored display_order / manual preferences.
 */

export type DashboardSortableBox = {
  key: string;
  itemCount: unknown;
  manualOrder: number;
};

/** Safe count for sort/dimming. Null, NaN, and negatives become 0. */
export function normalizeDashboardItemCount(value: unknown): number {
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.trunc(parsed);
    }
    return 0;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.trunc(value);
}

/**
 * If sortByActiveCount is false, keep saved manual order.
 * If true, sort by count descending, then manual order, then key.
 */
export function sortDashboardBoxes<T extends DashboardSortableBox>(
  boxes: readonly T[],
  sortByActiveCount: boolean,
): T[] {
  return [...boxes].sort((a, b) => {
    if (sortByActiveCount) {
      const countDelta =
        normalizeDashboardItemCount(b.itemCount) -
        normalizeDashboardItemCount(a.itemCount);
      if (countDelta !== 0) return countDelta;
    }
    if (a.manualOrder !== b.manualOrder) {
      return a.manualOrder - b.manualOrder;
    }
    return a.key.localeCompare(b.key);
  });
}
