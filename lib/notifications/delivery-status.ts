/**
 * Provider lifecycle precedence for notification deliveries.
 * A later or equal provider status may advance. An earlier status must not
 * replace a later one. processing -> queued is not a lifecycle advance;
 * accounting retry sets that explicitly.
 */

export const TERMINAL_DELIVERY_STATUSES = new Set([
  "delivered",
  "failed",
  "rejected",
  "expired",
  "bounced",
  "cancelled",
  "suppressed",
]);

export function deliveryStatusRank(status: string): number {
  switch (status) {
    case "pending":
      return 0;
    case "queued":
      return 1;
    case "processing":
      return 2;
    case "sent":
      return 3;
    case "delivered":
    case "failed":
    case "rejected":
    case "expired":
    case "bounced":
    case "cancelled":
    case "suppressed":
      return 4;
    default:
      return 0;
  }
}

export function mayAdvanceDeliveryStatus(current: string, next: string): boolean {
  if (TERMINAL_DELIVERY_STATUSES.has(current) && next !== current) return false;
  if (current === "delivered" && next !== "delivered") return false;
  if (deliveryStatusRank(next) < deliveryStatusRank(current)) return false;
  return true;
}
