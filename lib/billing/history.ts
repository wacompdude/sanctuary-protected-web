import { formatBillingPlanPrice } from "@/lib/billing/checkout-eligibility";
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

/**
 * Customer-facing money lines for an SMS purchase whose stored transaction
 * says Stripe determined the tax. Historical rows without that marker stay unlabeled.
 */
export function smsCreditPurchaseHistoryDetail(input: {
  amountCents: number;
  taxCents: number;
  taxDetermined: boolean;
}): string | null {
  if (input.taxDetermined !== true) return null;
  if (!Number.isInteger(input.amountCents) || input.amountCents < 0) return null;
  if (!Number.isInteger(input.taxCents) || input.taxCents < 0) return null;
  const usd = (cents: number) => formatBillingPlanPrice(cents);
  return [
    `Subtotal: ${usd(input.amountCents)}`,
    `Tax: ${usd(input.taxCents)}`,
    `Total: ${usd(input.amountCents + input.taxCents)}`,
  ].join("\n");
}

export async function listBillingHistory(
  organizationId: string,
  limit = 25,
): Promise<BillingHistoryItem[]> {
  const supabase = await createClient();
  const take = Math.min(Math.max(limit, 1), 100);

  const [changes, events, smsPurchases] = await Promise.all([
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
        "id, event_type, processing_status, created_at, billing_provider, error_message, metadata, provider_mode",
      )
      .eq("organization_id", organizationId)
      .eq("provider_mode", "live")
      .order("created_at", { ascending: false })
      .limit(take),
    supabase
      .from("billing_transactions")
      .select("idempotency_key, amount_cents, tax_cents, metadata")
      .eq("organization_id", organizationId)
      .eq("transaction_type", "sms_block")
      .eq("status", "succeeded")
      .eq("provider_mode", "live")
      .order("created_at", { ascending: false })
      .limit(take),
  ]);

  const smsPurchaseByKey = new Map<
    string,
    {
      amountCents: number;
      taxCents: number;
      taxDetermined: boolean;
      autoReplenishment: boolean;
    }
  >();
  for (const row of smsPurchases.data ?? []) {
    const key = typeof row.idempotency_key === "string" ? row.idempotency_key : "";
    const metadata = asRecord(row.metadata);
    if (!key) continue;
    smsPurchaseByKey.set(key, {
      amountCents: Number(row.amount_cents),
      taxCents: Number(row.tax_cents),
      taxDetermined: metadata.tax_determined === true,
      autoReplenishment: metadata.sms_auto_replenishment === true,
    });
  }

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
      detail: smsPurchaseDetail(row.metadata, smsPurchaseByKey) ??
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

function smsPurchaseDetail(
  metadata: unknown,
  purchases: Map<
    string,
    {
      amountCents: number;
      taxCents: number;
      taxDetermined: boolean;
      autoReplenishment: boolean;
    }
  >,
): string | null {
  const handler = asRecord(asRecord(metadata).handler);
  const key =
    typeof handler.purchase_idempotency_key === "string"
      ? handler.purchase_idempotency_key
      : "";
  const purchase = key ? purchases.get(key) : undefined;
  if (!purchase) return null;
  if (handler.sms_auto_replenishment === true) {
    if (!purchase.autoReplenishment && !purchase.taxDetermined) return null;
    return smsCreditPurchaseHistoryDetail({
      amountCents: purchase.amountCents,
      taxCents: purchase.taxCents,
      taxDetermined: true,
    });
  }
  if (handler.sms_package_purchase !== true) return null;
  return smsCreditPurchaseHistoryDetail(purchase);
}
