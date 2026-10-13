/**
 * SMS auto-replenishment payment-method setup rules.
 * This module does not call Stripe, enable replenishment, or grant credits.
 */

export const SMS_PAYMENT_SETUP_PURPOSE = "sms_auto_replenishment_payment_setup";
export const SMS_PAYMENT_SETUP_METHOD_TYPE = "card";

const PAYMENT_METHOD_ID = /^pm_[A-Za-z0-9_]{1,252}$/;
const SETUP_INTENT_ID = /^seti_[A-Za-z0-9_]+$/;
const LAST4 = /^\d{4}$/;

export type SmsPaymentSetupRejection =
  | "setup_intent_missing"
  | "wrong_customer"
  | "wrong_organization"
  | "wrong_purpose"
  | "not_off_session"
  | "not_succeeded"
  | "payment_method_missing"
  | "unsupported_payment_method"
  | "payment_method_customer_mismatch";

export type SafeCardDisplay = {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
};

export type SetupIntentVerificationSnapshot = {
  id: string;
  status: string;
  usage: string | null;
  customerId: string | null;
  paymentMethodId: string | null;
  purpose: string | null;
  organizationId: string | null;
};

export type PaymentMethodVerificationSnapshot = {
  id: string;
  type: string;
  customerId: string | null;
  card: {
    brand: string | null;
    last4: string | null;
    expMonth: number | null;
    expYear: number | null;
  } | null;
};

export type VerifiedSmsPaymentSetup = {
  ok: true;
  paymentMethodId: string;
  display: SafeCardDisplay | null;
};

export type RejectedSmsPaymentSetup = {
  ok: false;
  outcome: SmsPaymentSetupRejection;
};

/**
 * One SetupIntent per organization and currently saved payment method.
 * A double-click reuses that SetupIntent. Replacing a saved method uses a
 * new key. A terminal SetupIntent is not reused after the saved method changes.
 */
export function smsPaymentSetupIdempotencyKey(
  organizationId: string,
  currentPaymentMethodId: string | null,
): string {
  const current = currentPaymentMethodId?.trim() || "none";
  return `sms_auto_pm_setup_v1_${organizationId}_${current}`;
}

export function smsPaymentSetupCreateParams(input: {
  customerId: string;
  organizationId: string;
}): {
  customer: string;
  usage: "off_session";
  allowed_payment_method_types: ["card"];
  metadata: {
    sanctuary_purpose: typeof SMS_PAYMENT_SETUP_PURPOSE;
    organization_id: string;
  };
} {
  return {
    customer: input.customerId,
    usage: "off_session",
    allowed_payment_method_types: ["card"],
    metadata: {
      sanctuary_purpose: SMS_PAYMENT_SETUP_PURPOSE,
      organization_id: input.organizationId,
    },
  };
}

/** The browser may supply only a SetupIntent id. */
export function readSetupIntentIdFromClient(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  if (!SETUP_INTENT_ID.test(id) || id.length > 255) return null;
  return id;
}

export function isStripePaymentMethodId(value: string): boolean {
  return PAYMENT_METHOD_ID.test(value) && value.length >= 8 && value.length <= 255;
}

export function verifySmsPaymentSetup(input: {
  organizationId: string;
  customerId: string;
  setupIntent: SetupIntentVerificationSnapshot | null;
  paymentMethod: PaymentMethodVerificationSnapshot | null;
}): VerifiedSmsPaymentSetup | RejectedSmsPaymentSetup {
  const setupIntent = input.setupIntent;
  if (!setupIntent) {
    return { ok: false, outcome: "setup_intent_missing" };
  }
  if (setupIntent.customerId !== input.customerId) {
    return { ok: false, outcome: "wrong_customer" };
  }
  if (setupIntent.organizationId !== input.organizationId) {
    return { ok: false, outcome: "wrong_organization" };
  }
  if (setupIntent.purpose !== SMS_PAYMENT_SETUP_PURPOSE) {
    return { ok: false, outcome: "wrong_purpose" };
  }
  if (setupIntent.usage !== "off_session") {
    return { ok: false, outcome: "not_off_session" };
  }
  if (setupIntent.status !== "succeeded") {
    return { ok: false, outcome: "not_succeeded" };
  }
  if (!setupIntent.paymentMethodId || !isStripePaymentMethodId(setupIntent.paymentMethodId)) {
    return { ok: false, outcome: "payment_method_missing" };
  }
  const paymentMethod = input.paymentMethod;
  if (!paymentMethod || paymentMethod.id !== setupIntent.paymentMethodId) {
    return { ok: false, outcome: "payment_method_missing" };
  }
  if (paymentMethod.type !== SMS_PAYMENT_SETUP_METHOD_TYPE) {
    return { ok: false, outcome: "unsupported_payment_method" };
  }
  if (paymentMethod.customerId !== input.customerId) {
    return { ok: false, outcome: "payment_method_customer_mismatch" };
  }
  return {
    ok: true,
    paymentMethodId: paymentMethod.id,
    display: safeCardDisplay(paymentMethod),
  };
}

export function safeCardDisplay(
  paymentMethod: PaymentMethodVerificationSnapshot,
): SafeCardDisplay | null {
  const card = paymentMethod.card;
  if (!card) return null;
  const brand = (card.brand ?? "").trim().toLowerCase();
  const last4 = (card.last4 ?? "").trim();
  if (!/^[a-z]{3,20}$/.test(brand)) return null;
  if (!LAST4.test(last4)) return null;
  if (
    !Number.isInteger(card.expMonth) ||
    card.expMonth == null ||
    card.expMonth < 1 ||
    card.expMonth > 12 ||
    !Number.isInteger(card.expYear) ||
    card.expYear == null ||
    card.expYear < 2000 ||
    card.expYear > 2100
  ) {
    return null;
  }
  return {
    brand,
    last4,
    expMonth: card.expMonth,
    expYear: card.expYear,
  };
}

export function persistedPaymentSetupIsChargeable(status: string): boolean {
  return status === "enabled";
}
