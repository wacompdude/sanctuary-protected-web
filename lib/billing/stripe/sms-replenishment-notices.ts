/**
 * Customer notices for automatic SMS replenishment.
 * Building these messages does not send email, SMS, or push, and does not charge.
 */

import { formatBillingPlanPrice } from "@/lib/billing/checkout-eligibility";
import { automaticReplenishmentGrantKey } from "@/lib/billing/sms-auto-replenishment";

export const SMS_REPLENISHMENT_NOTICE_CHANNELS = ["in_app", "email"] as const;
export const SMS_REPLENISHMENT_NOTICE_ROLES = ["owner", "co_owner"] as const;

export type SmsReplenishmentNotice = {
  notificationType:
    | "billing.sms_auto_replenishment_succeeded"
    | "billing.sms_auto_replenishment_payment_attention"
    | "billing.sms_auto_replenishment_authorization_review"
    | "billing.sms_auto_replenishment_tax_attention"
    | "billing.sms_auto_replenishment_spending_cap";
  title: string;
  body: string;
  deduplicationKey: string;
  channels: typeof SMS_REPLENISHMENT_NOTICE_CHANNELS;
  recipientRoles: typeof SMS_REPLENISHMENT_NOTICE_ROLES;
};

function money(cents: number): string {
  return formatBillingPlanPrice(cents);
}

export function smsReplenishmentSuccessNotice(input: {
  attemptId: string;
  organizationName: string;
  credits: number;
  subtotalCents: number;
  taxCents: number;
  occurredAtLabel: string;
  cardLabel?: string | null;
}): SmsReplenishmentNotice {
  const lines = [
    `${input.organizationName} purchased ${input.credits} Application SMS credits.`,
    `Subtotal: ${money(input.subtotalCents)}`,
    `Tax: ${money(input.taxCents)}`,
    `Total: ${money(input.subtotalCents + input.taxCents)}`,
    input.occurredAtLabel,
  ];
  if (input.cardLabel) lines.push(input.cardLabel);
  return {
    notificationType: "billing.sms_auto_replenishment_succeeded",
    title: "Automatic SMS credits purchased",
    body: lines.join("\n"),
    deduplicationKey: `billing.sms_auto_replenishment_succeeded:${input.attemptId}`,
    channels: SMS_REPLENISHMENT_NOTICE_CHANNELS,
    recipientRoles: SMS_REPLENISHMENT_NOTICE_ROLES,
  };
}

export function smsReplenishmentPaymentAttentionNotice(input: {
  attemptId: string;
  organizationName: string;
}): SmsReplenishmentNotice {
  return {
    notificationType: "billing.sms_auto_replenishment_payment_attention",
    title: "Automatic SMS replenishment is paused",
    body: [
      `Automatic SMS replenishment for ${input.organizationName} is paused because the saved payment method needs attention.`,
      "No SMS credits were purchased.",
      "No automatic retry will occur.",
      "Update the automatic SMS payment method in Settings → Billing, then resume automatic replenishment.",
      "Application SMS may become unavailable if your available credits run out.",
    ].join("\n"),
    deduplicationKey: `billing.sms_auto_replenishment_payment_attention:${input.attemptId}`,
    channels: SMS_REPLENISHMENT_NOTICE_CHANNELS,
    recipientRoles: SMS_REPLENISHMENT_NOTICE_ROLES,
  };
}

export function smsReplenishmentAuthorizationReviewNotice(input: {
  organizationId: string;
  organizationName: string;
  currentPackagePriceCents: number;
}): SmsReplenishmentNotice {
  return {
    notificationType: "billing.sms_auto_replenishment_authorization_review",
    title: "Review automatic SMS replenishment",
    body: [
      `Automatic SMS replenishment for ${input.organizationName} stopped because the current package price is ${money(input.currentPackagePriceCents)}, which is higher than the price you previously authorized.`,
      "Review the package and reauthorize before another automatic purchase can be made.",
      "No charge was made for this price change.",
    ].join("\n"),
    deduplicationKey: `billing.sms_auto_replenishment_authorization_review:${input.organizationId}:${input.currentPackagePriceCents}`,
    channels: SMS_REPLENISHMENT_NOTICE_CHANNELS,
    recipientRoles: SMS_REPLENISHMENT_NOTICE_ROLES,
  };
}

export function smsReplenishmentTaxAttentionNotice(input: {
  attemptId: string;
  organizationName: string;
}): SmsReplenishmentNotice {
  return {
    notificationType: "billing.sms_auto_replenishment_tax_attention",
    title: "Billing address needed for automatic SMS credits",
    body: [
      `Automatic SMS replenishment for ${input.organizationName} is paused because the billing address cannot currently be used to calculate sales tax.`,
      "This is not a tax-free purchase.",
      "Review Settings → Billing → Billing & Tax Address.",
      "No charge was made.",
    ].join("\n"),
    deduplicationKey: `billing.sms_auto_replenishment_tax_attention:${input.attemptId}`,
    channels: SMS_REPLENISHMENT_NOTICE_CHANNELS,
    recipientRoles: SMS_REPLENISHMENT_NOTICE_ROLES,
  };
}

export function smsReplenishmentSpendingCapNotice(input: {
  attemptId: string;
  organizationName: string;
}): SmsReplenishmentNotice {
  return {
    notificationType: "billing.sms_auto_replenishment_spending_cap",
    title: "Automatic SMS spending limit reached",
    body: [
      `Automatic SMS credits were not purchased for ${input.organizationName} because this purchase, including sales tax, would exceed your automatic SMS spending limit.`,
      "No charge was made.",
      "No SMS credits were purchased.",
      "Automatic replenishment remains enabled and may purchase credits in a later subscription billing period.",
    ].join("\n"),
    deduplicationKey: `billing.sms_auto_replenishment_spending_cap:${input.attemptId}`,
    channels: SMS_REPLENISHMENT_NOTICE_CHANNELS,
    recipientRoles: SMS_REPLENISHMENT_NOTICE_ROLES,
  };
}

export function smsReplenishmentPurchaseIdempotencyKey(attemptId: string): string {
  return automaticReplenishmentGrantKey(attemptId);
}
