/**
 * Sends automatic SMS replenishment notices through the existing notification
 * dispatcher. Does not grant credits, call the orchestrator, or create a charge.
 */

import "server-only";

import { formatChurchDateTime } from "@/lib/datetime/format";
import { smsPackageForPlan } from "@/lib/billing/commercial-catalog";
import { readSafeCardDisplay } from "@/lib/billing/stripe/sms-payment-setup-live";
import {
  smsReplenishmentAuthorizationReviewNotice,
  smsReplenishmentPaymentAttentionNotice,
  smsReplenishmentSpendingCapNotice,
  smsReplenishmentSuccessNotice,
  smsReplenishmentTaxAttentionNotice,
  type SmsReplenishmentNotice,
} from "@/lib/billing/stripe/sms-replenishment-notices";
import { createNotification } from "@/lib/notifications/create-notification";
import { createAdminClient } from "@/lib/supabase/admin";
import { getChurchSubscription } from "@/lib/subscriptions";

async function organizationContext(organizationId: string): Promise<{
  name: string;
  timeZone: string | null;
}> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("organizations")
    .select("name, display_name, timezone")
    .eq("id", organizationId)
    .maybeSingle();
  const name =
    (typeof data?.display_name === "string" && data.display_name.trim()) ||
    (typeof data?.name === "string" && data.name.trim()) ||
    "your organization";
  return {
    name,
    timeZone: typeof data?.timezone === "string" ? data.timezone : null,
  };
}

async function deliver(organizationId: string, notice: SmsReplenishmentNotice): Promise<void> {
  await createNotification(
    {
      organizationId,
      notificationType: notice.notificationType,
      severity: "medium",
      title: notice.title,
      body: notice.body,
      actionUrl: "/settings/billing",
      deduplicationKey: notice.deduplicationKey,
      recipientRoles: [...notice.recipientRoles],
      channels: [...notice.channels],
      requestedSenderCategory: "billing",
      metadata: { sms_auto_replenishment_notice: true },
    },
    { dispatchNow: false },
  );
}

export async function notifySmsReplenishmentSuccess(input: {
  organizationId: string;
  attemptId: string;
  credits: number;
  subtotalCents: number;
  taxCents: number;
}): Promise<void> {
  const organization = await organizationContext(input.organizationId);
  let cardLabel: string | null = null;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("organization_sms_auto_replenishment")
      .select("payment_method_id")
      .eq("organization_id", input.organizationId)
      .maybeSingle();
    const paymentMethodId =
      typeof data?.payment_method_id === "string" ? data.payment_method_id : null;
    if (paymentMethodId) {
      const display = await readSafeCardDisplay(paymentMethodId);
      if (display) {
        cardLabel = `${display.brand} ending ${display.last4}`;
      }
    }
  } catch {
    cardLabel = null;
  }
  await deliver(
    input.organizationId,
    smsReplenishmentSuccessNotice({
      attemptId: input.attemptId,
      organizationName: organization.name,
      credits: input.credits,
      subtotalCents: input.subtotalCents,
      taxCents: input.taxCents,
      occurredAtLabel: formatChurchDateTime(new Date().toISOString(), {
        timeZone: organization.timeZone,
      }),
      cardLabel,
    }),
  );
}

export async function notifySmsReplenishmentPaymentAttention(input: {
  organizationId: string;
  attemptId: string;
}): Promise<void> {
  const organization = await organizationContext(input.organizationId);
  await deliver(
    input.organizationId,
    smsReplenishmentPaymentAttentionNotice({
      attemptId: input.attemptId,
      organizationName: organization.name,
    }),
  );
}

export async function notifySmsReplenishmentPaymentAttentionForAttempt(
  attemptId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("organization_sms_replenishment_attempts")
    .select("organization_id")
    .eq("id", attemptId)
    .maybeSingle();
  if (!data?.organization_id) return;
  await notifySmsReplenishmentPaymentAttention({
    organizationId: String(data.organization_id),
    attemptId,
  });
}

export async function notifySmsReplenishmentOrchestrationResult(
  organizationId: string,
  result: { outcome: string; attemptId: string | null },
): Promise<void> {
  const organization = await organizationContext(organizationId);
  if (result.outcome === "authorization_review_required") {
    const subscription = await getChurchSubscription(organizationId);
    const planKey = subscription ? String(subscription.plan_key ?? "") : "";
    const price = smsPackageForPlan(planKey)?.smsPackagePriceCents;
    if (!Number.isInteger(price)) return;
    await deliver(
      organizationId,
      smsReplenishmentAuthorizationReviewNotice({
        organizationId,
        organizationName: organization.name,
        currentPackagePriceCents: price as number,
      }),
    );
    return;
  }
  if (!result.attemptId) return;
  if (result.outcome === "tax_attention_required") {
    await deliver(
      organizationId,
      smsReplenishmentTaxAttentionNotice({
        attemptId: result.attemptId,
        organizationName: organization.name,
      }),
    );
  }
  if (result.outcome === "period_cap_reached") {
    await deliver(
      organizationId,
      smsReplenishmentSpendingCapNotice({
        attemptId: result.attemptId,
        organizationName: organization.name,
      }),
    );
  }
}
