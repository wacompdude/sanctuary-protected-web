/**
 * Daily read-only scan of effective base-subscription cards.
 * Does not create Stripe objects or send SMS.
 */

import "server-only";

import type Stripe from "stripe";
import { AuditAction } from "@/lib/audit/actions";
import { writeAuditLog } from "@/lib/audit/log";
import { getStripeClient } from "@/lib/billing/stripe/client";
import { logStripeBillingError } from "@/lib/billing/stripe/safe-error-log";
import { effectiveSubscriptionPaymentMethodId } from "@/lib/billing/stripe/subscription-payment-method";
import {
  SUBSCRIPTION_CARD_EXPIRATION_CHANNELS,
  SUBSCRIPTION_CARD_EXPIRATION_PAGE_SIZE,
  SUBSCRIPTION_CARD_EXPIRATION_ROLES,
  SUBSCRIPTION_CARD_EXPIRATION_STATUSES,
  subscriptionCardExpirationDecision,
  subscriptionCardExpirationDedupKey,
  subscriptionCardExpirationNotice,
} from "@/lib/billing/stripe/subscription-card-expiration";
import { createNotification } from "@/lib/notifications/create-notification";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";

export type SubscriptionCardExpirationScanResult = {
  organizationsScanned: number;
  warningsQueued: number;
  duplicatesSkipped: number;
  skipped: number;
  errors: string[];
};

function customerIdOf(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
): string | null {
  if (!customer) return null;
  if (typeof customer === "string") return customer;
  if ("deleted" in customer && customer.deleted) return null;
  return customer.id;
}

function paymentMethodIdOf(
  paymentMethod: string | Stripe.PaymentMethod | null | undefined,
): string | null {
  if (!paymentMethod) return null;
  return typeof paymentMethod === "string" ? paymentMethod : paymentMethod.id;
}

export async function scanSubscriptionCardExpirations(options?: {
  now?: Date;
  organizationId?: string;
}): Promise<SubscriptionCardExpirationScanResult> {
  const result: SubscriptionCardExpirationScanResult = {
    organizationsScanned: 0,
    warningsQueued: 0,
    duplicatesSkipped: 0,
    skipped: 0,
    errors: [],
  };
  if (!isServiceRoleConfigured()) {
    result.errors.push("Subscription card expiration scan requires server configuration.");
    return result;
  }

  const admin = createAdminClient();
  const now = options?.now ?? new Date();
  const seenOrganizations = new Set<string>();
  let offset = 0;

  for (;;) {
    let query = admin
      .from("organization_subscriptions")
      .select("organization_id, billing_subscription_id, status")
      .in("status", [...SUBSCRIPTION_CARD_EXPIRATION_STATUSES])
      .not("billing_subscription_id", "is", null)
      // Billing notifications are Live-only: Test/UNKNOWN subscriptions never warn.
      .eq("provider_mode", "live")
      .order("organization_id", { ascending: true })
      .range(offset, offset + SUBSCRIPTION_CARD_EXPIRATION_PAGE_SIZE - 1);
    if (options?.organizationId) {
      query = query.eq("organization_id", options.organizationId);
    }
    const { data, error } = await query;
    if (error) {
      result.errors.push("Unable to load subscription candidates.");
      return result;
    }
    const rows = data ?? [];
    for (const row of rows) {
      const organizationId = String(row.organization_id ?? "");
      const subscriptionId = String(row.billing_subscription_id ?? "").trim();
      if (!organizationId || !subscriptionId || seenOrganizations.has(organizationId)) {
        continue;
      }
      seenOrganizations.add(organizationId);
      result.organizationsScanned += 1;
      try {
        const outcome = await inspectOrganization({
          admin,
          organizationId,
          subscriptionId,
          now,
        });
        if (outcome === "queued") result.warningsQueued += 1;
        else if (outcome === "duplicate") result.duplicatesSkipped += 1;
        else result.skipped += 1;
      } catch (error) {
        logStripeBillingError("subscription_card_expiration_read", error);
        result.errors.push(`Organization ${organizationId}: card expiration could not be read.`);
      }
    }
    if (rows.length < SUBSCRIPTION_CARD_EXPIRATION_PAGE_SIZE) break;
    offset += SUBSCRIPTION_CARD_EXPIRATION_PAGE_SIZE;
  }

  return result;
}

async function inspectOrganization(input: {
  admin: ReturnType<typeof createAdminClient>;
  organizationId: string;
  subscriptionId: string;
  now: Date;
}): Promise<"queued" | "duplicate" | "skipped"> {
  const { data: profile } = await input.admin
    .from("organization_billing_profiles")
    .select("provider_customer_id, provider_mode")
    .eq("organization_id", input.organizationId)
    .eq("billing_provider", "stripe")
    .maybeSingle();
  const customerId =
    profile?.provider_mode !== "test" &&
    typeof profile?.provider_customer_id === "string"
      ? profile.provider_customer_id.trim()
      : "";
  if (!customerId) return "skipped";

  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(input.subscriptionId);
  if (subscription.livemode === false) return "skipped";
  if (customerIdOf(subscription.customer) !== customerId) return "skipped";

  const subscriptionDefault = paymentMethodIdOf(subscription.default_payment_method);
  let customerDefault: string | null = null;
  if (!subscriptionDefault) {
    const customer = await stripe.customers.retrieve(customerId);
    if (!customer.deleted) {
      customerDefault = paymentMethodIdOf(
        customer.invoice_settings?.default_payment_method ?? null,
      );
    }
  }
  const paymentMethodId = effectiveSubscriptionPaymentMethodId({
    subscriptionDefaultPaymentMethodId: subscriptionDefault,
    customerInvoiceDefaultPaymentMethodId: customerDefault,
  });
  if (!paymentMethodId) return "skipped";

  const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
  if (customerIdOf(paymentMethod.customer) !== customerId) return "skipped";
  const decision = subscriptionCardExpirationDecision({
    paymentMethodType: paymentMethod.type,
    expMonth: paymentMethod.card?.exp_month ?? null,
    expYear: paymentMethod.card?.exp_year ?? null,
    now: input.now,
  });
  if (!decision || !paymentMethod.card?.brand || !paymentMethod.card.last4) {
    return "skipped";
  }

  const { data: organization } = await input.admin
    .from("organizations")
    .select("name, display_name")
    .eq("id", input.organizationId)
    .maybeSingle();
  const organizationName =
    (typeof organization?.display_name === "string" && organization.display_name.trim()) ||
    (typeof organization?.name === "string" && organization.name.trim()) ||
    "your organization";
  const notice = subscriptionCardExpirationNotice({
    brand: paymentMethod.card.brand,
    last4: paymentMethod.card.last4,
    expMonth: decision.expMonth,
    expYear: decision.expYear,
    threshold: decision.threshold,
    organizationName,
  });
  const created = await createNotification(
    {
      organizationId: input.organizationId,
      notificationType: notice.notificationType,
      severity: notice.severity,
      title: notice.title,
      body: notice.body,
      actionUrl: "/settings/billing",
      deduplicationKey: subscriptionCardExpirationDedupKey({
        paymentMethodId,
        expMonth: decision.expMonth,
        expYear: decision.expYear,
        threshold: decision.threshold,
      }),
      recipientRoles: [...SUBSCRIPTION_CARD_EXPIRATION_ROLES],
      channels: [...SUBSCRIPTION_CARD_EXPIRATION_CHANNELS],
      requestedSenderCategory: "billing",
      metadata: {
        threshold: decision.threshold,
        brand: paymentMethod.card.brand,
        last4: paymentMethod.card.last4,
        exp_month: decision.expMonth,
        exp_year: decision.expYear,
      },
    },
    { dispatchNow: false },
  );
  if (created.status === "duplicate") return "duplicate";
  if (created.status !== "queued") return "skipped";

  await writeAuditLog(input.admin, {
    organizationId: input.organizationId,
    action: AuditAction.BILLING_PAYMENT_METHOD_EXPIRATION_WARNING_CREATED,
    entityType: "organization",
    entityId: input.organizationId,
    metadata: {
      organization_id: input.organizationId,
      threshold: decision.threshold,
      brand: paymentMethod.card.brand,
      last4: paymentMethod.card.last4,
      exp_month: decision.expMonth,
      exp_year: decision.expYear,
      recipient_count: created.recipientCount,
    },
  });
  return "queued";
}
