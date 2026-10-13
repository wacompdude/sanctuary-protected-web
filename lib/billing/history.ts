import { createClient } from "@/lib/supabase/server";
import type { BillingHistoryItem } from "@/lib/billing/types";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Presentation label for a billing_events row. Does not grant credits. */
export function billingHistoryEventTitle(input: {
  eventType: string;
  metadata?: unknown;
}): string {
  const handler = asRecord(asRecord(input.metadata).handler);
  if (handler.sms_package_purchase === true) return "SMS Credit Purchase";
  if (handler.sms_auto_replenishment === true) {
    return "Automatic SMS Credit Replenishment";
  }
  return input.eventType || "billing event";
}

export async function listBillingHistory(
  organizationId: string,
  limit = 25,
): Promise<BillingHistoryItem[]> {
  const supabase = await createClient();
  const take = Math.min(Math.max(limit, 1), 100);

  const [changes, events] = await Promise.all([
    supabase
      .from("subscription_change_history")
      .select(
        "id, change_type, reason, old_status, new_status, created_at, metadata",
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(take),
    supabase
      .from("billing_events")
      .select(
        "id, event_type, processing_status, created_at, billing_provider, error_message, metadata",
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(take),
  ]);

  const items: BillingHistoryItem[] = [];

  for (const row of changes.data ?? []) {
    const changeType = String(row.change_type ?? "change");
    items.push({
      id: `sub:${row.id}`,
      kind: "subscription_change",
      occurredAt: String(row.created_at),
      title: changeType.replaceAll("_", " "),
      detail:
        (row.reason as string | null) ??
        ([row.old_status, row.new_status].filter(Boolean).join(" → ") || null),
      status: (row.new_status as string | null) ?? null,
    });
  }

  for (const row of events.data ?? []) {
    items.push({
      id: `bill:${row.id}`,
      kind: "billing_event",
      occurredAt: String(row.created_at),
      title: billingHistoryEventTitle({
        eventType: String(row.event_type ?? "billing event"),
        metadata: row.metadata,
      }),
      detail:
        (row.error_message as string | null) ??
        `Provider ${row.billing_provider ?? "unknown"}`,
      status: (row.processing_status as string | null) ?? null,
    });
  }

  items.sort(
    (a, b) =>
      new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );

  return items.slice(0, take);
}
